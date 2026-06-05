import fs from 'fs/promises';
import { config } from '../config.js';

/**
 * Lit l'intégralité du fichier de métadonnées.
 * Retourne un objet vide si le fichier n'existe pas encore.
 */
async function readMeta() {
  try {
    const raw = await fs.readFile(config.metaFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persiste les métadonnées sur le disque.
 */
async function writeMeta(meta) {
  await fs.writeFile(config.metaFile, JSON.stringify(meta, null, 2), 'utf8');
}

/**
 * Enregistre une nouvelle entrée pour un fichier uploadé.
 * @param {string} code - code de transfert court
 * @param {object} entry - métadonnées du fichier
 */
export async function saveFileMeta(code, entry) {
  const meta = await readMeta();
  meta[code] = entry;
  await writeMeta(meta);
}

/**
 * Récupère les métadonnées d'un fichier via son code.
 * Retourne null si le code est inconnu.
 */
export async function getFileMeta(code) {
  const meta = await readMeta();
  return meta[code] ?? null;
}

/**
 * Supprime l'entrée de métadonnées d'un code donné.
 */
export async function deleteFileMeta(code) {
  const meta = await readMeta();
  delete meta[code];
  await writeMeta(meta);
}

/**
 * Retourne toutes les entrées de métadonnées.
 */
export async function getAllMeta() {
  return readMeta();
}
