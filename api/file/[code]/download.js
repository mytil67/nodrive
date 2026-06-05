/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger le fichier chiffré stocké en blob privé.
 *
 * Deux modes :
 *  - Fichier unique (ancien format / petits fichiers) : stream direct
 *  - Fichier chunked (>3.5 Mo) : le frontend appelle ?chunk=0, ?chunk=1, etc.
 *
 * Gestion du quota de téléchargements pour les fichiers chunked :
 *  - chunk=0 : incrémente le compteur (mais ne supprime JAMAIS la metadata)
 *  - chunks intermédiaires : servis sans vérification de quota
 *  - dernier chunk : après envoi, supprime metadata + chunks si quota atteint
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

  // Index de chunk demandé (-1 = pas de chunk, mode fichier unique)
  const chunkIndex = req.query.chunk !== undefined ? parseInt(req.query.chunk, 10) : -1;

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

    // 2. Vérification expiration (toujours)
    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }

    // ── Mode chunked ──────────────────────────────────────────────────────
    if (meta.chunkUrls && meta.chunkUrls.length > 0) {
      if (chunkIndex < 0 || chunkIndex >= meta.chunkUrls.length) {
        return res.status(400).json({
          error: `Index de chunk invalide (0-${meta.chunkUrls.length - 1})`,
        });
      }

      const isFirstChunk = chunkIndex === 0;
      const isLastChunk  = chunkIndex === meta.chunkUrls.length - 1;

      // Vérifier le quota UNIQUEMENT sur le premier chunk
      // (les chunks suivants font partie du même téléchargement)
      if (isFirstChunk) {
        if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
          return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
        }

        // Incrémenter le compteur — mais GARDER la metadata
        // (on en a besoin pour servir les chunks suivants)
        const updatedMeta = { ...meta, downloadCount: meta.downloadCount + 1 };
        await put(metaBlobs[0].pathname, JSON.stringify(updatedMeta, null, 2), {
          access:          'private',
          contentType:     'application/json',
          addRandomSuffix: false,
          allowOverwrite:  true,
        });
      }
      // Chunks > 0 : pas de vérification de quota, la "réservation"
      // a été faite sur chunk 0.

      // Servir le chunk demandé
      const chunkUrl = meta.chunkUrls[chunkIndex];
      const chunkResponse = await fetch(chunkUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!chunkResponse.ok) {
        console.error(`[download] Chunk ${chunkIndex} introuvable : ${chunkUrl} → ${chunkResponse.status}`);
        return res.status(404).json({ error: `Chunk ${chunkIndex} introuvable` });
      }

      const contentLength = chunkResponse.headers.get('content-length');

      res.setHeader('Content-Type', 'application/octet-stream');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'no-store');

      const reader = chunkResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (streamErr) {
        console.error(`[download] Erreur stream chunk ${chunkIndex} :`, streamErr.message);
        if (!res.writableEnded) res.end();
      }

      // Après le dernier chunk : nettoyer si quota atteint
      if (isLastChunk) {
        const finalCount = meta.downloadCount + 1;
        const quotaReached = meta.maxDownloads > 0 && finalCount >= meta.maxDownloads;
        if (quotaReached) {
          // Supprimer metadata + tous les chunks
          const urlsToDelete = [metaBlobs[0].url, ...meta.chunkUrls];
          await del(urlsToDelete).catch((e) =>
            console.error('[download] Erreur suppression après quota :', e.message)
          );
          console.log(`[download] Transfert ${code} supprimé (quota atteint)`);
        }
      }

      return;
    }

    // ── Mode fichier unique ───────────────────────────────────────────────
    // Vérifier le quota
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // Incrémenter le compteur AVANT de servir le fichier (anti race condition)
    const newCount = meta.downloadCount + 1;
    const shouldDelete = meta.maxDownloads > 0 && newCount >= meta.maxDownloads;

    if (shouldDelete) {
      // Pour un fichier unique, on peut supprimer la metadata tout de suite
      // car on n'en a plus besoin après
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

    const fileResponse = await fetch(meta.blobUrl, {
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

    if (shouldDelete) {
      await del([meta.blobUrl]).catch((e) =>
        console.error('[download] Erreur suppression fichier :', e.message)
      );
    }

  } catch (err) {
    console.error('[download] Erreur :', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
}
