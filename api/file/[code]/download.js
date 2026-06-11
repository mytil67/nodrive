/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger un chunk de fichier chiffré.
 * Paramètres query : ?file=0&chunk=0
 *
 * Gestion du quota : le quota est consommé côté serveur quand le DERNIER chunk
 * du dernier fichier est servi — c'est-à-dire quand le destinataire a récupéré
 * l'intégralité du ciphertext. Impossible d'obtenir le fichier complet sans
 * demander ce chunk, donc la limite est réellement appliquée sans dépendre d'un
 * appel client. Un mauvais mot de passe est rejeté (403) AVANT tout service, et
 * un téléchargement interrompu n'atteint jamais le chunk final → rien n'est
 * consommé ni détruit dans ces cas. (L'endpoint .../confirm est conservé en
 * no-op pour compatibilité avec d'anciens clients.)
 */

import { list, put, del } from '@vercel/blob';
import { timingSafeEqual } from 'crypto';

const CODE_REGEX     = /^[A-Z2-9]{6}$/;
const VERIFIER_REGEX = /^[0-9a-f]{64}$/;

/** Comparaison en temps constant de deux chaînes hex de même format. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Consomme un téléchargement : incrémente le compteur, et purge tout le
 * transfert (métadonnées + chunks) si le quota est atteint. Appelé une seule
 * fois par récupération complète, après que le chunk final a été servi.
 */
async function consumeDownload(meta, metaBlob) {
  const newCount     = (meta.downloadCount || 0) + 1;
  const reachedLimit = meta.maxDownloads > 0 && newCount >= meta.maxDownloads;

  if (reachedLimit) {
    const urls = [metaBlob.url];
    for (const f of meta.files || []) {
      if (f.chunkUrls) urls.push(...f.chunkUrls);
    }
    await del(urls);
    console.log(`[download] Transfert ${meta.code} consommé et purgé (quota atteint)`);
    return;
  }

  await put(metaBlob.pathname, JSON.stringify({ ...meta, downloadCount: newCount }, null, 2), {
    access:          'private',
    contentType:     'application/json',
    addRandomSuffix: false,
    allowOverwrite:  true,
  });
  console.log(`[download] Transfert ${meta.code} : téléchargement ${newCount}/${meta.maxDownloads}`);
}

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
  const rawChunk = parseInt(req.query.chunk || '0', 10);
  const fileIndex  = (Number.isFinite(rawFile)  && rawFile  >= 0) ? Math.min(rawFile, 999)  : 0;
  const chunkIndex = (Number.isFinite(rawChunk) && rawChunk >= 0) ? Math.min(rawChunk, 9999) : 0;

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

    if (!meta.files || !meta.files.length) {
      return res.status(410).json({ error: 'Format de transfert non supporté' });
    }

    // Preuve de connaissance du mot de passe OBLIGATOIRE (#5) : le ciphertext
    // n'est servi qu'aux clients capables de dériver le verifier. Tout transfert
    // créé par l'app en possède un ; en son absence on refuse (fail-closed)
    // plutôt que de servir le contenu sans aucune preuve.
    if (!meta.verifier) {
      return res.status(410).json({ error: 'Format de transfert non supporté' });
    }
    const provided = (req.headers['x-blob-verifier'] || '').toLowerCase();
    if (!VERIFIER_REGEX.test(provided) || !safeEqual(provided, meta.verifier)) {
      return res.status(403).json({ error: 'Mot de passe incorrect' });
    }

    const files = meta.files;

    // Validation des index
    if (fileIndex >= files.length) {
      return res.status(400).json({ error: 'Index de fichier invalide' });
    }

    const file = files[fileIndex];
    if (!file.chunkUrls || !file.chunkUrls.length) {
      return res.status(410).json({ error: 'Fichier sans chunks' });
    }

    // Garde quota : si déjà atteint, on ne sert rien (le transfert a en principe
    // déjà été purgé, mais on protège le cas où la purge a échoué).
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // Validation index chunk
    if (chunkIndex >= file.chunkUrls.length) {
      return res.status(400).json({ error: 'Index de chunk invalide' });
    }

    // Le chunk final du dernier fichier = récupération complète du ciphertext.
    // C'est lui qui consommera le quota une fois le flux terminé (voir plus bas).
    const isFinalChunk =
      (fileIndex === files.length - 1) &&
      (chunkIndex === file.chunkUrls.length - 1);

    // Récupérer le chunk (on vérifie sa disponibilité avant toute réservation).
    const chunkUrl = file.chunkUrls[chunkIndex];
    const chunkResponse = await fetch(chunkUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!chunkResponse.ok) {
      return res.status(404).json({ error: 'Chunk introuvable' });
    }

    // Réservation atomique (#4) : le Blob store n'est pas transactionnel. Deux
    // téléchargements finaux concurrents liraient tous deux downloadCount avant
    // que l'un n'incrémente → double service. On sérialise via un marqueur créé
    // en allowOverwrite:false (opération atomique « échoue si existe ») : le
    // perdant reçoit 410. Le marqueur est TOUJOURS libéré ensuite (succès ou
    // échec de flux) pour ne pas bloquer un téléchargement légitime.
    let claimUrl = null;
    if (isFinalChunk && meta.maxDownloads > 0) {
      try {
        const claim = await put(`transfers/${code}/.claim`, '1', {
          access:          'private',
          contentType:     'text/plain',
          addRandomSuffix: false,
          allowOverwrite:  false,
        });
        claimUrl = claim.url;
      } catch {
        return res.status(410).json({ error: 'Téléchargement déjà en cours' });
      }
    }

    const contentLength = chunkResponse.headers.get('content-length');
    res.setHeader('Content-Type', 'application/octet-stream');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const reader = chunkResponse.body.getReader();
    let streamOk = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      streamOk = true;
    } catch (streamErr) {
      console.error(`[download] Erreur stream :`, streamErr.message);
    }

    // Consommer le quota UNIQUEMENT si le ciphertext complet vient d'être servi
    // (chunk final + flux terminé sans erreur). Le verifier ayant déjà été validé
    // plus haut, atteindre ce point prouve la connaissance du mot de passe.
    if (streamOk && isFinalChunk && meta.maxDownloads > 0) {
      try {
        await consumeDownload(meta, metaBlobs[0]);
      } catch (e) {
        console.error('[download] Consommation quota échouée :', e.message);
      }
    }

    // Libérer la réservation dans tous les cas (le reste du transfert a déjà été
    // purgé ou incrémenté ; en cas d'échec de flux, un autre essai peut reprendre).
    if (claimUrl) {
      await del(claimUrl).catch(() => {});
    }

    if (!res.writableEnded) res.end();

  } catch (err) {
    console.error('[download] Erreur :', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
}
