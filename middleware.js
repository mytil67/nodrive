/**
 * Vercel Edge Middleware — NoDrive
 *
 * S'exécute en périphérie (edge) avant chaque requête /api/*.
 *
 * Responsabilités :
 *  1. Rate limiting in-memory par IP (best-effort — par instance edge)
 *  2. Détection de brute-force sur les codes de transfert (anti-énumération)
 *  3. Blocage des requêtes cross-origin
 *  4. Header X-RateLimit-Remaining pour le diagnostic
 *
 * Compatible Cloudflare : lit CF-Connecting-IP pour la vraie IP client.
 *
 * Limites connues :
 *  - Le cache in-memory est par instance edge (pas distribué).
 *    Cloudflare WAF assure un rate-limiting distribué en amont.
 */

import { next, ipAddress } from '@vercel/edge';

// ── Configuration des limites ──────────────────────────────────────────────
// Important : upload ET download fonctionnent par chunks (une requête HTTP par
// chunk). Un transfert légitime peut donc générer plusieurs dizaines de
// requêtes sur le même bucket en quelques secondes — les limites doivent les
// absorber. La protection anti-énumération (recordEnumFailure ci-dessous) et
// Cloudflare WAF en amont restent les vraies barrières anti-abus ; ces limites
// ne servent qu'à lisser les pics par instance edge.
const RATE_LIMITS = {
  '/api/upload':              { max: 100, windowMs: 60_000 },  // ~chunks de plusieurs uploads/min
  '/api/file':                { max: 100, windowMs: 60_000 },  // ~chunks de download + info
  default:                    { max: 60,  windowMs: 60_000 },  // 60 req/min autres
};

// Après N échecs sur /api/file/*/info par IP → blocage temporaire
const ENUM_FAIL_THRESHOLD = 8;    // 8 échecs dans la fenêtre
const ENUM_BLOCK_DURATION = 300_000; // 5 min de blocage

// ── Cache in-memory (scope module = par instance edge, éphémère) ───────────
/** @type {Map<string, { count: number, resetAt: number }>} */
const rlCache = new Map();

/** @type {Map<string, { fails: number, resetAt: number, blockedUntil: number }>} */
const enumCache = new Map();

// Nettoyage périodique pour éviter une fuite mémoire sur les instances longues
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rlCache) {
    if (now > entry.resetAt) rlCache.delete(key);
  }
  for (const [key, entry] of enumCache) {
    if (now > entry.blockedUntil && now > entry.resetAt) enumCache.delete(key);
  }
}, 120_000);

function getLimit(pathname) {
  for (const [prefix, limit] of Object.entries(RATE_LIMITS)) {
    if (prefix !== 'default' && pathname.startsWith(prefix)) return limit;
  }
  return RATE_LIMITS.default;
}

function checkRateLimit(ip, pathname) {
  const limit  = getLimit(pathname);
  const bucket = pathname.split('/').slice(0, 3).join('/'); // /api/upload, /api/file, etc.
  const key    = `${ip}:${bucket}`;
  const now    = Date.now();

  let entry = rlCache.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + limit.windowMs };
  }
  entry.count++;
  rlCache.set(key, entry);

  return {
    allowed:    entry.count <= limit.max,
    remaining:  Math.max(0, limit.max - entry.count),
    resetAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Vérifie si l'IP est bloquée pour brute-force de codes.
 * Retourne true si la requête doit être bloquée.
 */
function isEnumBlocked(ip) {
  const entry = enumCache.get(ip);
  if (!entry) return false;
  if (Date.now() < entry.blockedUntil) return true;
  return false;
}

/**
 * Enregistre un échec de lookup de code pour cette IP.
 * Appelé quand le endpoint info ou download retourne 404.
 */
function recordEnumFailure(ip) {
  const now = Date.now();
  let entry = enumCache.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { fails: 0, resetAt: now + 60_000, blockedUntil: 0 };
  }
  entry.fails++;
  if (entry.fails >= ENUM_FAIL_THRESHOLD) {
    entry.blockedUntil = now + ENUM_BLOCK_DURATION;
  }
  enumCache.set(ip, entry);
}

// ── Matcher : uniquement les routes /api/* ─────────────────────────────────
export const config = {
  matcher: '/api/:path*',
};

/**
 * Résout l'IP réelle du client.
 * Derrière Cloudflare, l'IP arrive dans CF-Connecting-IP.
 * Sinon, fallback sur l'helper Vercel Edge.
 */
function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
      || ipAddress(request)
      || '0.0.0.0';
}

export default async function middleware(request) {
  const ip       = getClientIp(request);
  const url      = new URL(request.url);
  const pathname = url.pathname;
  const origin   = url.origin;

  // ── CORS : bloquer les requêtes cross-origin vers l'API ──
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== origin) {
    return new Response(
      JSON.stringify({ error: 'Requête cross-origin non autorisée' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ── Anti-énumération : blocage si trop d'échecs ──
  const isFileEndpoint = pathname.match(/^\/api\/file\/[^/]+\/(info|download)/);
  if (isFileEndpoint && isEnumBlocked(ip)) {
    return new Response(
      JSON.stringify({ error: 'Trop de tentatives — réessayez plus tard.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After':  '300',
        },
      }
    );
  }

  // ── Rate limiting ──
  const { allowed, remaining, resetAfter } = checkRateLimit(ip, pathname);

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Trop de requêtes — réessayez dans un instant.' }),
      {
        status: 429,
        headers: {
          'Content-Type':          'application/json',
          'Retry-After':           String(resetAfter),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // ── Exécuter le endpoint ──
  const response = await next();
  response.headers.set('X-RateLimit-Remaining', String(remaining));

  // ── Traquer les échecs pour l'anti-énumération ──
  if (isFileEndpoint && (response.status === 404 || response.status === 410)) {
    recordEnumFailure(ip);
  }

  return response;
}
