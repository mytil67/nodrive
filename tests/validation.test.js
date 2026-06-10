/**
 * Tests de validation des inputs API :
 * - Code de transfert (regex)
 * - Salt (regex)
 * - Index de chunks/fichiers (bornes)
 */

import { describe, it, expect } from 'vitest';

const CODE_REGEX = /^[A-Z2-9]{6}$/;
const SALT_REGEX = /^[0-9a-f]{64}$/;

describe('CODE_REGEX', () => {
  it('accepte un code valide', () => {
    expect(CODE_REGEX.test('AB3K7P')).toBe(true);
    expect(CODE_REGEX.test('XXXXXX')).toBe(true);
    expect(CODE_REGEX.test('234567')).toBe(true);
  });

  it('rejette 0 et 1 (mais O/I/L sont dans A-Z, acceptés par la regex backend)', () => {
    // La regex backend est permissive : [A-Z2-9] exclut 0 et 1 mais pas O/I/L.
    // L'exclusion de O/I/L est assurée par la *génération* (rejection sampling), pas la validation.
    expect(CODE_REGEX.test('A0BCDE')).toBe(false); // 0 exclu
    expect(CODE_REGEX.test('A1BCDE')).toBe(false); // 1 exclu
    expect(CODE_REGEX.test('AOBCDE')).toBe(true);  // O est dans A-Z
    expect(CODE_REGEX.test('AIBCDE')).toBe(true);  // I est dans A-Z
    expect(CODE_REGEX.test('ALBCDE')).toBe(true);  // L est dans A-Z
  });

  it('rejette les minuscules', () => {
    expect(CODE_REGEX.test('ab3k7p')).toBe(false);
  });

  it('rejette les codes trop courts ou trop longs', () => {
    expect(CODE_REGEX.test('AB3K7')).toBe(false);
    expect(CODE_REGEX.test('AB3K7PP')).toBe(false);
    expect(CODE_REGEX.test('')).toBe(false);
  });

  it('rejette les caractères spéciaux', () => {
    expect(CODE_REGEX.test('AB3K7!')).toBe(false);
    expect(CODE_REGEX.test('AB3K7 ')).toBe(false);
  });
});

describe('SALT_REGEX (256-bit)', () => {
  it('accepte un salt valide de 64 hex chars', () => {
    expect(SALT_REGEX.test('a'.repeat(64))).toBe(true);
    expect(SALT_REGEX.test('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('rejette un ancien salt de 32 hex chars (128-bit)', () => {
    expect(SALT_REGEX.test('a'.repeat(32))).toBe(false);
  });

  it('rejette les caractères non-hex', () => {
    expect(SALT_REGEX.test('g'.repeat(64))).toBe(false);
    expect(SALT_REGEX.test('A'.repeat(64))).toBe(false); // uppercase
  });

  it('rejette les longueurs incorrectes', () => {
    expect(SALT_REGEX.test('a'.repeat(63))).toBe(false);
    expect(SALT_REGEX.test('a'.repeat(65))).toBe(false);
    expect(SALT_REGEX.test('')).toBe(false);
  });
});

describe('Chunk index validation', () => {
  const MAX_CHUNKS_PER_FILE = 100;
  const MAX_FILES = 50;

  function validateChunkParams(chunkIndex, chunkTotal, fileIndex, fileTotal) {
    if (chunkIndex < 0 || chunkTotal < 1 || chunkIndex >= chunkTotal || chunkTotal > MAX_CHUNKS_PER_FILE) {
      return 'Index de chunk invalide';
    }
    if (fileIndex < 0 || fileTotal < 1 || fileIndex >= fileTotal || fileTotal > MAX_FILES) {
      return 'Index de fichier invalide';
    }
    return null;
  }

  it('accepte des index valides', () => {
    expect(validateChunkParams(0, 1, 0, 1)).toBeNull();
    expect(validateChunkParams(5, 10, 2, 5)).toBeNull();
    expect(validateChunkParams(99, 100, 49, 50)).toBeNull();
  });

  it('rejette chunkIndex négatif', () => {
    expect(validateChunkParams(-1, 5, 0, 1)).toBe('Index de chunk invalide');
  });

  it('rejette chunkIndex >= chunkTotal', () => {
    expect(validateChunkParams(5, 5, 0, 1)).toBe('Index de chunk invalide');
    expect(validateChunkParams(10, 5, 0, 1)).toBe('Index de chunk invalide');
  });

  it('rejette chunkTotal > MAX_CHUNKS_PER_FILE', () => {
    expect(validateChunkParams(0, 101, 0, 1)).toBe('Index de chunk invalide');
  });

  it('rejette fileIndex négatif', () => {
    expect(validateChunkParams(0, 1, -1, 1)).toBe('Index de fichier invalide');
  });

  it('rejette fileIndex >= fileTotal', () => {
    expect(validateChunkParams(0, 1, 1, 1)).toBe('Index de fichier invalide');
  });

  it('rejette fileTotal > MAX_FILES', () => {
    expect(validateChunkParams(0, 1, 0, 51)).toBe('Index de fichier invalide');
  });
});
