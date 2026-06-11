/**
 * GET /api/file/:code/info
 *
 * Retourne les métadonnées publiques d'un transfert.
 *
 * Anti-énumération : le temps de réponse est uniformisé. Tous les chemins
 * (succès, code mal formé, introuvable, expiré, quota atteint) répondent après
 * le même délai plancher + un jitter aléatoire. Sans ça, un code valide
 * répondrait plus vite qu'un code inexistant → un oracle temporel permettrait
 * de distinguer les codes valides. Le blocage brute-force reste assuré en amont
 * par le middleware edge ; ce plancher supprime juste la fuite par timing.
 */

import { list } from '@vercel/blob';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;
const CODE_REGEX = /^[A-Z2-9]{6}$/;

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

    const files = meta.files.map((f) => ({
      originalName: f.originalName,
      size:         f.size,
      chunkCount:   f.chunkCount || 0,
    }));

    return respond(start, res, 200, {
      files,
      salt:          meta.salt,
      expiresAt:     meta.expiresAt,
      maxDownloads:  meta.maxDownloads,
      downloadCount: meta.downloadCount,
    });
  } catch (err) {
    console.error('[info] Erreur :', err.message);
    return respond(start, res, 500, { error: 'Erreur interne' });
  }
}
