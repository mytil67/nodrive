/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger un chunk de fichier chiffré.
 * Paramètres query : ?file=0&chunk=0
 *
 * Gestion du quota : incrémenté sur file=0&chunk=0 uniquement.
 * Nettoyage : dernier chunk du dernier fichier supprime tout si quota atteint.
 *
 * Rétrocompatible avec l'ancien format (fichier unique, blobUrl).
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

  const rawFile  = parseInt(req.query.file  || '0', 10);
  const rawChunk = parseInt(req.query.chunk || '-1', 10);
  const fileIndex  = (Number.isFinite(rawFile)  && rawFile  >= 0) ? Math.min(rawFile, 999)  : 0;
  const chunkIndex = (Number.isFinite(rawChunk) && rawChunk >= -1) ? Math.min(rawChunk, 9999) : -1;

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

    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }

    // Normaliser : ancien format → nouveau format
    let files, allChunkUrls;
    if (meta.files) {
      files = meta.files;
      allChunkUrls = meta.files.flatMap(f => f.chunkUrls || []);
    } else if (meta.chunkUrls) {
      files = [{ originalName: meta.originalName, size: meta.size, chunkCount: meta.chunkCount, chunkUrls: meta.chunkUrls }];
      allChunkUrls = meta.chunkUrls;
    } else {
      // Ancien format fichier unique (blobUrl)
      files = [{ originalName: meta.originalName, size: meta.size, chunkCount: 0, blobUrl: meta.blobUrl }];
      allChunkUrls = meta.blobUrl ? [meta.blobUrl] : [];
    }

    // Validation des index
    if (fileIndex < 0 || fileIndex >= files.length) {
      return res.status(400).json({ error: 'Index de fichier invalide' });
    }

    const file = files[fileIndex];
    const isFirstOverall = (fileIndex === 0 && chunkIndex <= 0);
    const isLastOverall  = (fileIndex === files.length - 1) &&
                           (chunkIndex === (file.chunkUrls ? file.chunkUrls.length - 1 : 0));

    // Vérifier quota uniquement sur la toute première requête
    if (isFirstOverall) {
      if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
        return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
      }
      // Incrémenter le compteur avec verrouillage optimiste :
      // on re-lit la metadata juste après l'écriture pour détecter une course.
      const updatedMeta = { ...meta, downloadCount: meta.downloadCount + 1 };
      await put(metaBlobs[0].pathname, JSON.stringify(updatedMeta, null, 2), {
        access: 'private', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: true,
      });
      // Re-lire pour vérifier qu'aucune requête concurrente n'a aussi incrémenté
      const verifyResp = await fetch(metaBlobs[0].url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (verifyResp.ok) {
        const verified = await verifyResp.json();
        if (verified.downloadCount !== updatedMeta.downloadCount) {
          // Une requête concurrente a modifié le compteur → rejeter celle-ci
          return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
        }
      }
    }

    // Mode chunked (nouveau format)
    if (file.chunkUrls && file.chunkUrls.length > 0) {
      const ci = Math.max(0, chunkIndex);
      if (ci >= file.chunkUrls.length) {
        return res.status(400).json({ error: 'Index de chunk invalide' });
      }

      const chunkUrl = file.chunkUrls[ci];
      const chunkResponse = await fetch(chunkUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!chunkResponse.ok) {
        return res.status(404).json({ error: 'Chunk introuvable' });
      }

      const contentLength = chunkResponse.headers.get('content-length');
      res.setHeader('Content-Type', 'application/octet-stream');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const reader = chunkResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (streamErr) {
        console.error(`[download] Erreur stream :`, streamErr.message);
        if (!res.writableEnded) res.end();
      }

      // Nettoyer après le tout dernier chunk si quota atteint
      if (isLastOverall) {
        const finalCount = meta.downloadCount + 1;
        if (meta.maxDownloads > 0 && finalCount >= meta.maxDownloads) {
          const urlsToDelete = [metaBlobs[0].url, ...allChunkUrls];
          await del(urlsToDelete).catch(e =>
            console.error('[download] Erreur suppression :', e.message)
          );
          console.log(`[download] Transfert ${code} supprimé (quota atteint)`);
        }
      }
      return;
    }

    // Mode fichier unique ancien (blobUrl)
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads && !isFirstOverall) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    const fileResponse = await fetch(file.blobUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileResponse.ok) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    const contentLength = fileResponse.headers.get('content-length');
    res.setHeader('Content-Type', 'application/octet-stream');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Content-Disposition', 'attachment; filename="file.enc"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

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

    const shouldDelete = meta.maxDownloads > 0 && (meta.downloadCount + 1) >= meta.maxDownloads;
    if (shouldDelete) {
      await del([metaBlobs[0].url, file.blobUrl]).catch(e =>
        console.error('[download] Erreur suppression :', e.message)
      );
    }

  } catch (err) {
    console.error('[download] Erreur :', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
}
