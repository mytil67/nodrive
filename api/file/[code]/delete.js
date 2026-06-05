/**
 * POST /api/file/:code/delete
 *
 * Supprime un transfert :
 *  - le fichier chiffré dans Vercel Blob
 *  - les métadonnées JSON associées
 *
 * Utilisé automatiquement par le frontend après un téléchargement unique,
 * ou manuellement pour supprimer un transfert avant expiration.
 */

import { list, del } from '@vercel/blob';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;

const CODE_REGEX = /^[A-Z2-9]{6}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  try {
    // Récupérer la métadonnée pour obtenir l'URL du fichier chiffré
    const { blobs: metaBlobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    const urlsToDelete = [];

    if (metaBlobs.length) {
      // Récupérer l'URL du fichier chiffré depuis la métadonnée
      try {
        const response = await fetch(metaBlobs[0].url, {
          headers: { Authorization: `Bearer ${BLOB_TOKEN()}` },
        });
        if (response.ok) {
          const meta = await response.json();
          if (meta.blobUrl) urlsToDelete.push(meta.blobUrl);
        }
      } catch {
        // Si la métadonnée est illisible, on supprime quand même ce qu'on peut
      }
      urlsToDelete.push(metaBlobs[0].url);
    }

    if (urlsToDelete.length) {
      await del(urlsToDelete);
      console.log(`[delete] Transfert ${code} supprimé (${urlsToDelete.length} blob(s))`);
    }

    return res.json({ success: true, deleted: urlsToDelete.length });
  } catch (err) {
    console.error('[delete] Erreur :', err.message);
    return res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
}
