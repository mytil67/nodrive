import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { config } from './config.js';
import filesRouter from './routes/files.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startCleanupScheduler } from './services/cleanup.js';

const app = express();

// ---------------------------------------------------------------------------
// Initialisation du répertoire uploads
// ---------------------------------------------------------------------------
await fs.mkdir(config.uploadsDir, { recursive: true });

// ---------------------------------------------------------------------------
// Middlewares globaux
// ---------------------------------------------------------------------------

/**
 * CORS : autorise uniquement l'origine du frontend configurée.
 * En production, remplacer par l'URL publique du frontend.
 */
app.use(
  cors({
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
  })
);

app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api', filesRouter);

// Gestionnaire d'erreurs (doit être déclaré après les routes)
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
app.listen(config.port, () => {
  console.log(`[server] FileDrop backend démarré sur http://localhost:${config.port}`);
  console.log(`[server] Taille max : ${config.maxFileSizeMb} Mo`);
  console.log(`[server] Expiration : ${config.expirationMinutes} min`);
  console.log(`[server] CORS autorisé pour : ${config.frontendUrl}`);
});

// Lance le nettoyage automatique des fichiers expirés
startCleanupScheduler();
