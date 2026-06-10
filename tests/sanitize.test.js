/**
 * Tests de sanitizeFilename — protection contre path traversal,
 * null bytes, caractères de contrôle, noms vides.
 *
 * La fonction est dupliquée dans api/upload/chunk.js et api/upload.js (supprimé).
 * On la copie ici pour tester de façon isolée.
 */

import { describe, it, expect } from 'vitest';

// Copie exacte de la fonction dans api/upload/chunk.js
function sanitizeFilename(name) {
  let sanitized = String(name)
    .normalize('NFC')
    .trim();
  sanitized = sanitized.replace(/[\\/]/g, '_');
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\-\u0080-\uFFFF ]/g, '_');
  sanitized = sanitized.substring(0, 200).trim();
  return sanitized || 'fichier';
}

describe('sanitizeFilename', () => {
  it('laisse un nom normal intact', () => {
    expect(sanitizeFilename('rapport.pdf')).toBe('rapport.pdf');
    expect(sanitizeFilename('photo-vacances_2024.jpg')).toBe('photo-vacances_2024.jpg');
  });

  it('gère les noms avec accents (unicode)', () => {
    expect(sanitizeFilename('résumé.docx')).toBe('résumé.docx');
    expect(sanitizeFilename('文件.txt')).toBe('文件.txt');
  });

  it('supprime les séparateurs de chemin (path traversal)', () => {
    // Les slashes deviennent _, les points restent (pas dangereux sans slash)
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('.._.._windows_system32');
    expect(sanitizeFilename('/etc/shadow')).toBe('_etc_shadow');
    // Vérifie qu'aucun séparateur de chemin ne survit
    expect(sanitizeFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('..\\..\\test')).not.toContain('\\');
  });

  it('supprime les null bytes', () => {
    expect(sanitizeFilename('file\x00.exe')).toBe('file.exe');
    expect(sanitizeFilename('\x00\x00test')).toBe('test');
  });

  it('supprime les caractères de contrôle', () => {
    expect(sanitizeFilename('file\x01\x02\x03.txt')).toBe('file.txt');
    expect(sanitizeFilename('test\x7F')).toBe('test');
  });

  it('remplace les caractères spéciaux dangereux', () => {
    expect(sanitizeFilename('file<script>.html')).toBe('file_script_.html');
    expect(sanitizeFilename('test"quotes".txt')).toBe('test_quotes_.txt');
    expect(sanitizeFilename("file'name.js")).toBe('file_name.js');
  });

  it('tronque à 200 caractères', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('retourne "fichier" pour un nom vide ou invalide', () => {
    expect(sanitizeFilename('')).toBe('fichier');
    expect(sanitizeFilename('   ')).toBe('fichier');
    expect(sanitizeFilename('\x00\x01\x02')).toBe('fichier');
  });

  it('trim les espaces en début et fin', () => {
    expect(sanitizeFilename('  test.pdf  ')).toBe('test.pdf');
  });

  it('gère les doubles extensions', () => {
    expect(sanitizeFilename('file.tar.gz')).toBe('file.tar.gz');
  });

  it('gère les noms avec espaces', () => {
    expect(sanitizeFilename('mon fichier important.pdf')).toBe('mon fichier important.pdf');
  });
});
