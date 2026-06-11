/**
 * GET /api/file/:code/info
 *
 * Retourne les métadonnées d'un transfert. Les NOMS de fichiers ne sont inclus
 * que si l'appelant fournit un verifier valide (preuve de mot de passe) via
 * l'en-tête x-blob-verifier ; sinon seul un sous-ensemble non sensible est
 * renvoyé (sel, expiration, nombre de fichiers, taille totale).
 *
 * Anti-énumération : le temps de réponse est uniformisé. Tous les chemins
 * (succès, code mal formé, introuvable, expiré, quota atteint) répondent après
 * le même délai plancher + un jitter aléatoire. Sans ça, un code valide
 * répondrait plus vite qu'un code inexistant → un oracle temporel permettrait
 * de distinguer les codes valides. Le blocage brute-force reste assuré en amont
 * par le middleware edge ; ce plancher supprime juste la fuite par timing.
 */

import { list } from '@vercel/blob';
import { timingSafeEqual } from 'crypto';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;
const CODE_REGEX     = /^[A-Z2-9]{6}$/;
const VERIFIER_REGEX = /^[0-9a-f]{64}$/;

/** Comparaison en temps constant de deux chaînes hex de même format. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Plancher de temps de réponse (ms). Surchargé à 0 dans les tests pour la vitesse.
const MIN_RESPONSE_MS = () => parseInt(process.env.INFO_MIN_RESPONSE_MS || '500', 10);
const JITTER_MS = 80;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Répond après avoir égalisé le temps écoulé au plancher (+ jitter), de sorte
 * que la durée ne dépende pas de l'issue (code valide ou non).
 */
async function respond(start, res, status, body) {
  const elapsed = Date.now() - start;
  const jitter  = Math.floor(Math.random() * JITTER_MS);
  const wait    = Math.max(0, MIN_RESPONSE_MS() - elapsed) + jitter;
  if (wait > 0) await sleep(wait);
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const start = Date.now();
  const code  = (req.query.code || '').toString().toUpperCase();

  if (!CODE_REGEX.test(code)) {
    return respond(start, res, 400, { error: 'Format de code invalide' });
  }

  try {
    const { blobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!blobs.length) {
      return respond(start, res, 404, { error: 'Code invalide ou expiré' });
    }

    const response = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN()}` },
    });
    if (!response.ok) {
      return respond(start, res, 404, { error: 'Métadonnée introuvable' });
    }
    const meta = await response.json();

    if (Date.now() > meta.expiresAt) {
      return respond(start, res, 410, { error: 'Ce fichier a expiré' });
    }
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return respond(start, res, 410, { error: 'Nombre maximum de téléchargements atteint' });
    }
    if (!meta.files || !meta.files.length) {
      return respond(start, res, 410, { error: 'Format de transfert non supporté' });
    }

    // Les NOMS de fichiers sont des données sensibles : on ne les révèle qu'à un
    // client capable de prouver la connaissance du mot de passe (verifier). Sans
    // verifier valide, on ne renvoie que le strict nécessaire — sel (requis pour
    // dériver la clé), expiration, nombre de fichiers et taille totale — pour
    // l'aperçu, sans divulguer les noms à quiconque possède seulement le code.
    const provided = (req.headers['x-blob-verifier'] || '').toLowerCase();
    let includeFiles = false;
    if (!meta.verifier) {
      includeFiles = true; // transfert legacy non protégé → rien à cacher
    } else if (provided) {
      if (!VERIFIER_REGEX.test(provided) || !safeEqual(provided, meta.verifier)) {
        return respond(start, res, 403, { error: 'Mot de passe incorrect' });
      }
      includeFiles = true;
    }

    const payload = {
      salt:          meta.salt,
      expiresAt:     meta.expiresAt,
      maxDownloads:  meta.maxDownloads,
      downloadCount: meta.downloadCount,
      fileCount:     meta.files.length,
      totalSize:     meta.totalSize,
    };
    if (includeFiles) {
      payload.files = meta.files.map((f) => ({
        originalName: f.originalName,
        size:         f.size,
        chunkCount:   f.chunkCount || 0,
      }));
    }

    return respond(start, res, 200, payload);
  } catch (err) {
    console.error('[info] Erreur :', err.message);
    return respond(start, res, 500, { error: 'Erreur interne' });
  }
}
