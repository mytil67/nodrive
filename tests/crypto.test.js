/**
 * Tests du module de chiffrement (frontend/src/utils/crypto.js).
 *
 * Vitest utilise Node.js webcrypto, compatible avec l'API navigateur.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTransferCode,
  generateSalt,
  deriveKeyFromPassphrase,
  encryptFile,
  decryptFile,
} from '../frontend/src/utils/crypto.js';

// ── generateTransferCode ────────────────────────────────────────────────────

describe('generateTransferCode', () => {
  it('retourne 6 caractères', () => {
    expect(generateTransferCode()).toHaveLength(6);
  });

  it('ne contient que des caractères valides (pas 0/O/1/I/L)', () => {
    const valid = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
    for (let i = 0; i < 100; i++) {
      expect(generateTransferCode()).toMatch(valid);
    }
  });

  it('produit des codes différents (entropie)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateTransferCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

// ── generateSalt ────────────────────────────────────────────────────────────

describe('generateSalt', () => {
  it('retourne 64 caractères hex (256 bits)', () => {
    const salt = generateSalt();
    expect(salt).toHaveLength(64);
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produit des sels uniques', () => {
    const salts = new Set(Array.from({ length: 20 }, () => generateSalt()));
    expect(salts.size).toBe(20);
  });
});

// ── Encrypt / Decrypt round-trip ────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  const passphrase = 'motdepasse-test-42';

  it('round-trip : chiffrer puis déchiffrer retourne les données originales', async () => {
    const salt = generateSalt();
    const plaintext = new TextEncoder().encode('Hello NoDrive !');

    const encKey = await deriveKeyFromPassphrase(passphrase, salt, 'encrypt');
    const encrypted = await encryptFile(plaintext.buffer, encKey);

    // Le résultat doit être plus grand que le plaintext (IV 12 + tag 16)
    expect(encrypted.byteLength).toBeGreaterThan(plaintext.byteLength);
    // Les 12 premiers octets sont l'IV
    expect(encrypted.slice(0, 12).some(b => b !== 0)).toBe(true);

    const decKey = await deriveKeyFromPassphrase(passphrase, salt, 'decrypt');
    const decrypted = await decryptFile(encrypted, decKey);

    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it('fichier vide : round-trip fonctionne', async () => {
    const salt = generateSalt();
    const plaintext = new Uint8Array(0);

    const encKey = await deriveKeyFromPassphrase(passphrase, salt, 'encrypt');
    const encrypted = await encryptFile(plaintext.buffer, encKey);

    const decKey = await deriveKeyFromPassphrase(passphrase, salt, 'decrypt');
    const decrypted = await decryptFile(encrypted, decKey);

    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it('gros fichier (1 Mo) : round-trip fonctionne', async () => {
    const salt = generateSalt();
    const plaintext = new Uint8Array(1024 * 1024);
    // getRandomValues a une limite de 65536 bytes, remplir par blocs
    for (let i = 0; i < plaintext.length; i += 65536) {
      crypto.getRandomValues(plaintext.subarray(i, Math.min(i + 65536, plaintext.length)));
    }

    const encKey = await deriveKeyFromPassphrase(passphrase, salt, 'encrypt');
    const encrypted = await encryptFile(plaintext.buffer, encKey);

    const decKey = await deriveKeyFromPassphrase(passphrase, salt, 'decrypt');
    const decrypted = await decryptFile(encrypted, decKey);

    expect(new Uint8Array(decrypted)).toEqual(plaintext);
  });

  it('mauvais mot de passe → erreur de déchiffrement', async () => {
    const salt = generateSalt();
    const plaintext = new TextEncoder().encode('données secrètes');

    const encKey = await deriveKeyFromPassphrase(passphrase, salt, 'encrypt');
    const encrypted = await encryptFile(plaintext.buffer, encKey);

    const wrongKey = await deriveKeyFromPassphrase('mauvais-mdp-99', salt, 'decrypt');
    await expect(decryptFile(encrypted, wrongKey)).rejects.toThrow();
  });

  it('données tronquées → erreur', async () => {
    const salt = generateSalt();
    const encKey = await deriveKeyFromPassphrase(passphrase, salt, 'encrypt');
    const encrypted = await encryptFile(new TextEncoder().encode('test').buffer, encKey);

    // Tronquer le ciphertext (garder IV mais couper le tag GCM)
    const truncated = encrypted.slice(0, 15);
    const decKey = await deriveKeyFromPassphrase(passphrase, salt, 'decrypt');
    await expect(decryptFile(truncated, decKey)).rejects.toThrow();
  });

  it('données trop courtes (<13 octets) → erreur immédiate', async () => {
    const salt = generateSalt();
    const decKey = await deriveKeyFromPassphrase(passphrase, salt, 'decrypt');
    await expect(decryptFile(new Uint8Array(10), decKey)).rejects.toThrow(
      'Données chiffrées invalides ou corrompues'
    );
  });

  it('deux chiffrements du même fichier produisent des résultats différents (IV unique)', async () => {
    const salt = generateSalt();
    const plaintext = new TextEncoder().encode('même contenu');

    const key = await deriveKeyFromPassphrase(passphrase, salt, 'encrypt');
    const enc1 = await encryptFile(plaintext.buffer, key);
    const enc2 = await encryptFile(plaintext.buffer, key);

    // Les IVs (12 premiers octets) doivent être différents
    const iv1 = enc1.slice(0, 12);
    const iv2 = enc2.slice(0, 12);
    expect(iv1).not.toEqual(iv2);
  });
});
