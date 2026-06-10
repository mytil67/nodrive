/**
 * Tests de safeAuthCheck — comparaison HMAC timing-safe
 * utilisée dans le cron cleanup.
 */

import { describe, it, expect } from 'vitest';
import { timingSafeEqual, randomBytes, createHmac } from 'crypto';

// Copie exacte de la fonction dans api/cron/cleanup.js
function safeAuthCheck(authHeader, secret) {
  if (!secret || !authHeader) return false;
  const expected = `Bearer ${secret}`;
  const key = randomBytes(32);
  const a = createHmac('sha256', key).update(authHeader).digest();
  const b = createHmac('sha256', key).update(expected).digest();
  return timingSafeEqual(a, b);
}

describe('safeAuthCheck', () => {
  const secret = 'my-super-secret-cron-token-12345';

  it('accepte un header Authorization valide', () => {
    expect(safeAuthCheck(`Bearer ${secret}`, secret)).toBe(true);
  });

  it('rejette un mauvais secret', () => {
    expect(safeAuthCheck('Bearer wrong-secret', secret)).toBe(false);
  });

  it('rejette sans préfixe Bearer', () => {
    expect(safeAuthCheck(secret, secret)).toBe(false);
  });

  it('rejette un header vide', () => {
    expect(safeAuthCheck('', secret)).toBe(false);
  });

  it('rejette si secret est undefined', () => {
    expect(safeAuthCheck('Bearer something', undefined)).toBe(false);
  });

  it('rejette si secret est vide', () => {
    expect(safeAuthCheck('Bearer something', '')).toBe(false);
  });

  it('rejette si authHeader est null', () => {
    expect(safeAuthCheck(null, secret)).toBe(false);
  });

  it('fonctionne avec des longueurs différentes (pas de length leak)', () => {
    expect(safeAuthCheck('Bearer short', secret)).toBe(false);
    expect(safeAuthCheck('Bearer ' + 'x'.repeat(1000), secret)).toBe(false);
  });
});
