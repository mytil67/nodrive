/**
 * GET /api/cron/cleanup
 *
 * Tâche de nettoyage exécutée quotidiennement par Vercel Cron (cf. vercel.json).
 * Parcourt tous les blobs metadata/*.json, identifie les transferts expirés
 * et supprime le fichier chiffré + la métadonnée associée.
 *
 * Sécurisé par le header Authorization: Bearer ${CRON_SECRET}
 * (Vercel injecte automatiquement CRON_SECRET dans les requêtes cron).
 */

import { list, del } from '@vercel/blob';
import { timingSafeEqual } from 'crypto';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;

function safeAuthCheck(authHeader, secret) {
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

export default async function handler(req, res) {
  // Vérification du secret Vercel Cron — toujours requis
  const authHeader = req.headers['authorization'] || '';
  const secret     = process.env.CRON_SECRET;
  if (!safeAuthCheck(authHeader, secret)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const now = Date.now();
  let deleted = 0;
  let errors  = 0;
  let cursor  = undefined;

  try {
    // Parcourir toutes les métadonnées par pages de 100
    do {
      const { blobs, cursor: nextCursor } = await list({
        prefix: 'metadata/',
        limit:  100,
        cursor,
      });
      cursor = nextCursor;

      for (const metaBlob of blobs) {
        try {
          const response = await fetch(metaBlob.url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN()}` },
          });
          if (!response.ok) continue;
          const meta = await response.json();

          if (now > meta.expiresAt) {
            const urlsToDelete = [metaBlob.url];
            if (meta.blobUrl) urlsToDelete.push(meta.blobUrl);
            if (meta.chunkUrls) urlsToDelete.push(...meta.chunkUrls);

            await del(urlsToDelete);
            deleted++;
            console.log(`[cleanup] Supprimé : ${meta.code} — ${meta.originalName}`);
          }
        } catch (err) {
          console.error(`[cleanup] Erreur sur ${metaBlob.pathname} :`, err.message);
          errors++;
        }
      }
    } while (cursor);

    const message = `Nettoyage terminé : ${deleted} supprimé(s), ${errors} erreur(s)`;
    console.log(`[cleanup] ${message}`);
    return res.json({ deleted, errors, message });
  } catch (err) {
    console.error('[cleanup] Erreur critique :', err.message);
    return res.status(500).json({ error: 'Erreur interne lors du nettoyage' });
  }
}
