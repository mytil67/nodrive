import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

// Résolution du chemin absolu de ce fichier (ESM n'a pas __dirname)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10),
  expirationMinutes: parseInt(process.env.EXPIRATION_MINUTES || '60', 10),
  // Origine autorisée pour les requêtes CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Répertoire de stockage des fichiers uploadés
  uploadsDir: path.join(__dirname, '..', 'uploads'),
  // Fichier JSON de métadonnées
  metaFile: path.join(__dirname, '..', 'uploads', 'meta.json'),
};
