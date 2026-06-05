import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { config } from '../config.js';
import { saveFileMeta, getFileMeta } from '../services/storage.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/**
 * Génère un code de transfert court (6 caractères) non prédictible.
 * Utilise crypto.randomBytes pour l'aléatoire cryptographique.
 * Les caractères ambigus (0/O, 1/I/L) sont exclus pour la lisibilité.
 */
function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

/**
 * Nettoie un nom de fichier pour éviter les path traversal et caractères dangereux.
 * Conserve uniquement les caractères alphanumériques, points, tirets et underscores.
 */
function sanitizeFilename(name) {
  return path.basename(name)
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .substring(0, 200);
}

// ---------------------------------------------------------------------------
// Configuration Multer
// ---------------------------------------------------------------------------

/** Stockage sur disque avec nom de fichier unique basé sur un UUID. */
const diskStorage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/upload
 * Reçoit un fichier via multipart/form-data (champ "file"),
 * génère un code court, stocke les métadonnées et répond avec le code.
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni.' });
    }

    const code = generateCode();
    const expiresAt = Date.now() + config.expirationMinutes * 60 * 1000;

    const entry = {
      code,
      originalName: sanitizeFilename(req.file.originalname),
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: Date.now(),
      expiresAt,
    };

    await saveFileMeta(code, entry);

    console.log(`[upload] Fichier reçu : ${entry.originalName} → code ${code}`);

    res.json({
      code,
      expiresAt,
      expiresInMinutes: config.expirationMinutes,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/file/:code/info
 * Retourne les métadonnées publiques d'un fichier (nom, taille, expiration).
 * Ne renvoie pas le chemin interne de stockage.
 */
router.get('/file/:code/info', async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const entry = await getFileMeta(code);

    if (!entry) {
      return res.status(404).json({ error: 'Code invalide ou inexistant.' });
    }
    if (Date.now() > entry.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré.' });
    }

    res.json({
      originalName: entry.originalName,
      size: entry.size,
      mimeType: entry.mimeType,
      expiresAt: entry.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/file/:code/download
 * Envoie le fichier en pièce jointe (Content-Disposition: attachment).
 * Vérifie l'expiration avant de servir le fichier.
 */
router.get('/file/:code/download', async (req, res, next) => {
  try {
    const code = req.params.code.toUpperCase();
    const entry = await getFileMeta(code);

    if (!entry) {
      return res.status(404).json({ error: 'Code invalide ou inexistant.' });
    }
    if (Date.now() > entry.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré.' });
    }

    const filePath = path.join(config.uploadsDir, entry.storedName);

    // Vérifie que le fichier est bien présent sur le disque
    await fs.access(filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${entry.originalName}"`);
    res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', entry.size);

    res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });
    }
    next(err);
  }
});

export default router;
