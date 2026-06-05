/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger le fichier chiffré stocké en blob privé.
 *
 * Flux :
 *  1. Lecture des métadonnées (blob privé, auth token)
 *  2. Vérification expiration + quota
 *  3. Incrémentation du downloadCount côté serveur (enforcement)
 *  4. Suppression immédiate si maxDownloads atteint (ne pas dépendre du client)
 *  5. Fetch du fichier chiffré + transmission binaire au navigateur
 *
 * NOTE : le fichier transmis est chiffré (AES-256-GCM).
 * Sans la passphrase, il est inutilisable.
 */

import { list, put, del } from '@vercel/blob';

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
    // 1. Lecture des métadonnées
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

    // 2. Vérifications
    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // 3. Fetch du fichier chiffré avant mise à jour des métadonnées
    const fileResponse = await fetch(meta.blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileResponse.ok) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    const buffer = Buffer.from(await fileResponse.arrayBuffer());

    // 4. Mise à jour du compteur + suppression si quota atteint (enforcement serveur)
    const newCount = meta.downloadCount + 1;
    if (meta.maxDownloads > 0 && newCount >= meta.maxDownloads) {
      // Supprimer le fichier ET les métadonnées — ne pas attendre le client
      await del([meta.blobUrl, metaBlobs[0].url]).catch((e) =>
        console.error('[download] Erreur suppression après quota :', e.message)
      );
      console.log(`[download] Transfert ${code} supprimé après ${newCount} téléchargement(s)`);
    } else {
      // Mettre à jour le compteur dans les métadonnées
      const updatedMeta = { ...meta, downloadCount: newCount };
      await put(metaBlobs[0].pathname, JSON.stringify(updatedMeta, null, 2), {
        access:          'private',
        contentType:     'application/json',
        addRandomSuffix: false,
        allowOverwrite:  true, // mise à jour intentionnelle du compteur
      }).catch((e) =>
        console.error('[download] Erreur mise à jour compteur :', e.message)
      );
    }

    // 5. Transmission du binaire chiffré
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
