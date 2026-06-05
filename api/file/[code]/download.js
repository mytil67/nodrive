/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger le fichier chiffré stocké en blob privé.
 * Le navigateur ne peut pas accéder directement aux blobs privés Vercel :
 * cette fonction lit le blob avec le token serveur et le retransmet au client.
 *
 * Flux :
 *  1. Lecture des métadonnées (blob privé, auth token)
 *  2. Vérification expiration + quota
 *  3. Fetch du fichier chiffré (blob privé, auth token)
 *  4. Transmission binaire au navigateur
 */

import { list } from '@vercel/blob';

const CODE_REGEX = /^[A-Z2-9]{6}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Configuration serveur incomplète : BLOB_READ_WRITE_TOKEN absent.' });
  }

  try {
    // Lecture des métadonnées (blob privé)
    const { blobs: metaBlobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!metaBlobs.length) {
      return res.status(404).json({ error: 'Code invalide ou expiré' });
    }

    const metaResponse = await fetch(metaBlobs[0].url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaResponse.ok) {
      return res.status(404).json({ error: 'Métadonnée introuvable' });
    }
    const meta = await metaResponse.json();

    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // Fetch du fichier chiffré (blob privé)
    const fileResponse = await fetch(meta.blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileResponse.ok) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    // Transmission du binaire chiffré au navigateur
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', 'attachment; filename="file.enc"');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(buffer);

  } catch (err) {
    console.error('[download] Erreur :', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
}
