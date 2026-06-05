/**
 * Utilitaires de chiffrement côté navigateur (Web Crypto API).
 *
 * Algorithme : AES-GCM 256 bits
 * Format stocké : IV (12 octets) || ciphertext
 *
 * La clé de déchiffrement n'est transmise à personne :
 * elle est incluse uniquement dans le fragment URL (#key),
 * qui n'est jamais envoyé au serveur par le navigateur.
 */

// ---------------------------------------------------------------------------
// Génération de code de transfert
// ---------------------------------------------------------------------------

/**
 * Génère un code de transfert court (6 caractères) non prédictible.
 * Utilise crypto.getRandomValues (aléatoire cryptographique côté navigateur).
 * L'alphabet exclut les caractères ambigus : 0/O, 1/I/L.
 * @returns {string}
 */
export function generateTransferCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alphabet[b % alphabet.length]).join('');
}

// ---------------------------------------------------------------------------
// Gestion de la clé AES-GCM
// ---------------------------------------------------------------------------

/**
 * Génère une clé AES-GCM 256 bits extractable.
 * @returns {Promise<{ key: CryptoKey, keyB64url: string }>}
 */
export async function generateEncryptionKey() {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,               // extractable : nécessaire pour exporter en base64url
    ['encrypt', 'decrypt']
  );

  const rawKey    = await crypto.subtle.exportKey('raw', key);
  const keyB64url = arrayBufferToBase64url(rawKey);

  return { key, keyB64url };
}

/**
 * Importe une clé AES-GCM depuis une chaîne base64url (fragment URL).
 * La clé importée est non-extractable pour limiter les risques d'exfiltration.
 * @param {string} keyB64url
 * @returns {Promise<CryptoKey>}
 */
export async function importEncryptionKey(keyB64url) {
  const rawKey = base64urlToArrayBuffer(keyB64url);
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,            // non-extractable une fois importée
    ['decrypt']
  );
}

// ---------------------------------------------------------------------------
// Chiffrement / déchiffrement
// ---------------------------------------------------------------------------

/**
 * Chiffre un ArrayBuffer avec AES-GCM.
 * Le résultat est : IV (12 octets) || ciphertext.
 *
 * @param {ArrayBuffer} plaintext - données originales
 * @param {CryptoKey}   key       - clé AES-GCM 256 bits
 * @returns {Promise<Uint8Array>}
 */
export async function encryptFile(plaintext, key) {
  const iv         = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  // Concaténer IV + ciphertext dans un seul buffer
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result;
}

/**
 * Déchiffre un Uint8Array produit par encryptFile.
 * Extrait l'IV des 12 premiers octets.
 *
 * @param {Uint8Array} data - IV (12 oct.) || ciphertext
 * @param {CryptoKey}  key  - clé AES-GCM 256 bits
 * @returns {Promise<ArrayBuffer>}
 * @throws si la clé est incorrecte ou les données corrompues
 */
export async function decryptFile(data, key) {
  if (!(data instanceof Uint8Array) || data.byteLength < 13) {
    throw new Error('Données chiffrées invalides ou corrompues');
  }

  const iv         = data.slice(0, 12);
  const ciphertext = data.slice(12);

  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error(
      'Déchiffrement échoué — clé incorrecte ou données corrompues. ' +
      "Assurez-vous d'utiliser le lien complet partagé par l'expéditeur."
    );
  }
}

// ---------------------------------------------------------------------------
// Utilitaires base64url (RFC 4648 §5, sans padding)
// ---------------------------------------------------------------------------

function arrayBufferToBase64url(buffer) {
  const bytes  = new Uint8Array(buffer);
  let   binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');
}

function base64urlToArrayBuffer(b64url) {
  const b64     = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded  = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  const binary  = atob(padded);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
