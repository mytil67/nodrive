import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import { getAllMeta, deleteFileMeta } from './storage.js';

/**
 * Parcourt toutes les entrées de métadonnées et supprime
 * les fichiers dont la date d'expiration est dépassée.
 */
export async function cleanupExpiredFiles() {
  const meta = await getAllMeta();
  const now = Date.now();

  for (const [code, entry] of Object.entries(meta)) {
    if (now > entry.expiresAt) {
      // Suppression du fichier physique
      try {
        await fs.unlink(path.join(config.uploadsDir, entry.storedName));
      } catch {
        // Le fichier peut déjà avoir été supprimé manuellement
      }
      // Suppression de l'entrée dans les métadonnées
      await deleteFileMeta(code);
      console.log(`[cleanup] Fichier expiré supprimé : ${entry.originalName} (code : ${code})`);
    }
  }
}

/**
 * Lance le planificateur de nettoyage automatique.
 * Exécution immédiate au démarrage, puis toutes les 60 secondes.
 */
export function startCleanupScheduler() {
  // Premier passage au démarrage
  cleanupExpiredFiles().catch((err) => console.error('[cleanup] Erreur :', err.message));
  // Passage périodique toutes les minutes
  setInterval(() => {
    cleanupExpiredFiles().catch((err) => console.error('[cleanup] Erreur :', err.message));
  }, 60 * 1000);
}
