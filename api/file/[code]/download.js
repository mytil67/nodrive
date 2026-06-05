/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger le fichier chiffré stocké en blob privé.
 * Stream le fichier directement depuis Vercel Blob vers le navigateur
 * sans bufferisation mémoire (supporte les gros fichiers).
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
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
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

    // 3. Incrémenter le compteur AVANT de servir le fichier (anti race condition)
    const newCount = meta.downloadCount + 1;
    const shouldDelete = meta.maxDownloads > 0 && newCount >= meta.maxDownloads;

    if (shouldDelete) {
      await del([metaBlobs[0].url]);
    } else {
      const updatedMeta = { ...meta, downloadCount: newCount };
      await put(metaBlobs[0].pathname, JSON.stringify(updatedMeta, null, 2), {
        access:          'private',
        contentType:     'application/json',
        addRandomSuffix: false,
        allowOverwrite:  true,
      });
    }

    // 4. Stream le fichier chiffré vers le client
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="file.enc"');
    res.setHeader('Cache-Control', 'no-store');

    if (meta.chunkUrls && meta.chunkUrls.length > 0) {
      // ── Mode chunked : stream chaque chunk séquentiellement ──
      if (meta.encryptedSize) {
        res.setHeader('Content-Length', String(meta.encryptedSize));
      }

      for (const chunkUrl of meta.chunkUrls) {
        const chunkResponse = await fetch(chunkUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!chunkResponse.ok) {
          console.error(`[download] Chunk introuvable : ${chunkUrl}`);
          if (!res.writableEnded) res.end();
          return;
        }
        const reader = chunkResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      }
      res.end();

      // Supprimer tous les chunks si quota atteint
      if (shouldDelete) {
        await del(meta.chunkUrls).catch((e) =>
          console.error('[download] Erreur suppression chunks :', e.message)
        );
      }
    } else {
      // ── Mode fichier unique (ancien format / petits fichiers) ──
      const fileResponse = await fetch(meta.blobUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!fileResponse.ok) {
        return res.status(404).json({ error: 'Fichier introuvable' });
      }

      const contentLength = fileResponse.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const reader = fileResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (streamErr) {
        console.error('[download] Erreur stream :', streamErr.message);
        if (!res.writableEnded) res.end();
      }

      // Supprimer le fichier après envoi si quota atteint
      if (shouldDelete) {
        await del([meta.blobUrl]).catch((e) =>
          console.error('[download] Erreur suppression fichier :', e.message)
        );
      }
    }

  } catch (err) {
    console.error('[download] Erreur :', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
}
