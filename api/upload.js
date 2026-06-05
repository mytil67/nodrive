/**
 * POST /api/upload
 *
 * Gère le cycle de vie de l'upload client vers Vercel Blob :
 *  1. onBeforeGenerateToken — valide le payload, retourne la config du token
 *  2. onUploadCompleted    — stocke les métadonnées JSON dans Vercel Blob
 *
 * Le fichier transite directement navigateur → Vercel Blob CDN.
 * Cette Function ne voit jamais le contenu du fichier, seulement les métadonnées.
 * La clé de chiffrement n'est jamais envoyée ici.
 */

import { handleUpload } from '@vercel/blob/client';
import { put } from '@vercel/blob';

const MAX_FILE_SIZE_MB   = parseInt(process.env.MAX_FILE_SIZE_MB  || '25', 10);
const EXPIRATION_HOURS   = parseInt(process.env.EXPIRATION_HOURS  || '24', 10);
const MAX_DOWNLOADS      = parseInt(process.env.MAX_DOWNLOADS     || '1',  10);

/** Format attendu pour un code de transfert. */
const CODE_REGEX = /^[A-Z2-9]{6}$/;

/**
 * Nettoie un nom de fichier pour supprimer les caractères dangereux.
 * Empêche le path traversal et les noms trop longs.
 */
function sanitizeFilename(name) {
  return String(name)
    .replace(/.*[\\/]/, '')               // retire tout préfixe de chemin
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '_')  // caractères autorisés uniquement
    .substring(0, 200)
    .trim() || 'fichier';
}

/**
 * Lit et parse le body de la requête Node.js en JSON.
 * Gère les différents états possibles de req.body selon le runtime Vercel :
 *  - undefined  : body non lu, on lit le stream
 *  - null       : body vide ou échec de parsing, on lit le stream
 *  - string     : déjà lu en chaîne, on parse
 *  - Buffer     : déjà lu en buffer, on convertit puis parse
 *  - object     : déjà parsé (middleware Vercel), on retourne directement
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    // Déjà parsé en objet par un middleware Vercel (et non null)
    if (req.body !== null && req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return resolve(req.body);
    }
    // Déjà disponible en string
    if (typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); }
      catch { return resolve({}); }
    }
    // Disponible en Buffer
    if (Buffer.isBuffer(req.body)) {
      try { return resolve(JSON.parse(req.body.toString('utf8'))); }
      catch { return resolve({}); }
    }
    // Lecture depuis le stream (cas par défaut)
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  // Vérification précoce : sans ce token aucune opération Blob n'est possible
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[upload] BLOB_READ_WRITE_TOKEN manquant. Vérifiez les variables d\'environnement Vercel (Dashboard → Storage → Blob → connecter au projet).');
    return res.status(500).json({
      error: 'Configuration serveur incomplète : BLOB_READ_WRITE_TOKEN absent. Consultez les logs Vercel.',
    });
  }

  const body = await readBody(req);

  // Le body doit avoir un champ "type" pour être traité par handleUpload
  if (!body || !body.type) {
    console.error('[upload] Body invalide reçu :', JSON.stringify(body));
    return res.status(400).json({ error: 'Corps de requête invalide' });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,

      /**
       * Appelé avant la génération du token client.
       * Valide les données envoyées par le navigateur et configure l'upload.
       */
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload;
        try {
          payload = JSON.parse(clientPayload);
        } catch {
          throw new Error('Payload invalide');
        }

        // Validation du code
        if (!CODE_REGEX.test(payload.code)) {
          throw new Error('Code de transfert invalide');
        }

        // Validation de la taille
        const sizeBytes = parseInt(payload.size, 10);
        if (!sizeBytes || sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)`);
        }

        // Validation du nom
        if (!payload.originalName || typeof payload.originalName !== 'string') {
          throw new Error('Nom de fichier invalide');
        }

        return {
          // Seuls les fichiers binaires chiffrés sont acceptés
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes: MAX_FILE_SIZE_MB * 1024 * 1024,
          // Le pathname est contrôlé côté client (transfers/{code}/file.enc)
          addRandomSuffix: false,
          // tokenPayload est retransmis tel quel à onUploadCompleted
          tokenPayload: JSON.stringify({
            code:         payload.code,
            originalName: sanitizeFilename(payload.originalName),
            size:         sizeBytes,
            expiresAt:    Date.now() + EXPIRATION_HOURS * 3600 * 1000,
          }),
        };
      },

      /**
       * Appelé par l'infrastructure Vercel Blob après upload réussi.
       * Stocke les métadonnées publiques sous metadata/{code}.json dans Vercel Blob.
       * NE contient pas la clé de chiffrement.
       */
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { code, originalName, size, expiresAt } = JSON.parse(tokenPayload);

        const meta = {
          code,
          originalName,
          size,
          blobPathname: blob.pathname,
          blobUrl:      blob.url,
          createdAt:    Date.now(),
          expiresAt,
          maxDownloads: MAX_DOWNLOADS,
          downloadCount: 0,
          encrypted:    true,
        };

        await put(`metadata/${code}.json`, JSON.stringify(meta, null, 2), {
          access:          'public',
          contentType:     'application/json',
          addRandomSuffix: false,
          allowOverwrite:  true,
        });

        console.log(`[upload] Transfert ${code} enregistré — expire ${new Date(expiresAt).toISOString()}`);
      },
    });

    return res.json(jsonResponse);
  } catch (err) {
    // Logguer l'erreur complète côté serveur pour diagnostiquer
    console.error('[upload] Erreur handleUpload :', err.message, err.stack);
    // Retourner un message utile (sans exposer de stack interne en prod)
    const isDev = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'development';
    return res.status(400).json({
      error: isDev ? err.message : 'Erreur lors de la génération du token d\'upload',
    });
  }
}
