import { config } from '../config.js';

/**
 * Gestionnaire d'erreurs Express centralisé.
 * Gère les erreurs multer (taille dépassée) et les erreurs génériques.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Erreur multer : fichier trop volumineux
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `Fichier trop volumineux. Taille maximale : ${config.maxFileSizeMb} Mo.`,
    });
  }

  console.error('[error]', err.message);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
}
