/**
 * Tests d'intégration pour les endpoints API.
 *
 * On mock @vercel/blob (list, put, del) et fetch pour simuler
 * le stockage sans infrastructure Vercel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock de @vercel/blob ────────────────────────────────────────────────────

const blobStore = new Map();

vi.mock('@vercel/blob', () => ({
  list: vi.fn(async ({ prefix, limit }) => {
    const blobs = [];
    for (const [key, value] of blobStore) {
      if (key.startsWith(prefix)) {
        blobs.push({ pathname: key, url: `https://blob.test/${key}`, size: value.length });
      }
      if (blobs.length >= (limit || 100)) break;
    }
    return { blobs, cursor: undefined };
  }),
  put: vi.fn(async (pathname, content) => {
    blobStore.set(pathname, typeof content === 'string' ? content : Buffer.from(content));
    return { pathname, url: `https://blob.test/${pathname}` };
  }),
  del: vi.fn(async (urls) => {
    const urlList = Array.isArray(urls) ? urls : [urls];
    for (const url of urlList) {
      const key = url.replace('https://blob.test/', '');
      blobStore.delete(key);
    }
  }),
}));

// ── Mock de fetch global (pour lire les blobs) ─────────────────────────────

const originalFetch = globalThis.fetch;
globalThis.fetch = vi.fn(async (url, opts) => {
  const key = String(url).replace('https://blob.test/', '');
  const data = blobStore.get(key);
  if (!data) {
    return { ok: false, status: 404 };
  }
  const content = typeof data === 'string' ? data : data.toString();
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(content),
    arrayBuffer: async () => (typeof data === 'string' ? Buffer.from(data) : data).buffer,
    headers: { get: (h) => h === 'content-length' ? String(data.length) : null },
    body: {
      getReader: () => {
        let done = false;
        const buf = typeof data === 'string' ? Buffer.from(data) : data;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: new Uint8Array(buf) };
          },
        };
      },
    },
  };
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockReq(method, query = {}, headers = {}) {
  return { method, query, headers };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    _headers: {},
    _body: null,
    _ended: false,
    headersSent: false,
    writableEnded: false,
    status(code) { res.statusCode = code; return res; },
    json(data) { res._body = data; res.headersSent = true; return res; },
    setHeader(k, v) { res._headers[k] = v; },
    write(data) { res._body = res._body ? Buffer.concat([res._body, data]) : data; },
    end() { res._ended = true; res.writableEnded = true; },
  };
  return res;
}

function createTestMetadata(overrides = {}) {
  return {
    code: 'AB3K7P',
    salt: 'a'.repeat(64),
    deleteToken: 'b'.repeat(32),
    files: [{
      originalName: 'test.pdf',
      size: 1024,
      chunkCount: 1,
      chunkUrls: ['https://blob.test/transfers/AB3K7P/f000-chunk-000.enc'],
    }],
    totalSize: 1024,
    encryptedSize: 1052,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600_000,
    maxDownloads: 1,
    downloadCount: 0,
    encrypted: true,
    ...overrides,
  };
}

function seedTransfer(meta = createTestMetadata()) {
  blobStore.set(`metadata/${meta.code}.json`, JSON.stringify(meta, null, 2));
  // Seed chunk data
  for (const f of meta.files) {
    for (const url of f.chunkUrls) {
      const key = url.replace('https://blob.test/', '');
      blobStore.set(key, Buffer.from('encrypted-chunk-data'));
    }
  }
  return meta;
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  blobStore.clear();
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  process.env.CRON_SECRET = 'test-cron-secret';
});

// ── Tests info endpoint ─────────────────────────────────────────────────────

describe('GET /api/file/:code/info', async () => {
  const { default: infoHandler } = await import('../api/file/[code]/info.js');

  it('retourne les métadonnées pour un code valide', async () => {
    const meta = seedTransfer();
    const req = createMockReq('GET', { code: 'AB3K7P' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.files).toHaveLength(1);
    expect(res._body.files[0].originalName).toBe('test.pdf');
    expect(res._body.salt).toBe('a'.repeat(64));
    expect(res._body).not.toHaveProperty('deleteToken');
  });

  it('retourne 404 pour un code inexistant', async () => {
    const req = createMockReq('GET', { code: 'ZZZZZZ' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('retourne 400 pour un code mal formaté', async () => {
    const req = createMockReq('GET', { code: 'abc' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('retourne 410 pour un transfert expiré', async () => {
    seedTransfer(createTestMetadata({ expiresAt: Date.now() - 1000 }));
    const req = createMockReq('GET', { code: 'AB3K7P' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(410);
  });

  it('retourne 410 si le quota de téléchargements est atteint', async () => {
    seedTransfer(createTestMetadata({ downloadCount: 1, maxDownloads: 1 }));
    const req = createMockReq('GET', { code: 'AB3K7P' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(410);
  });

  it('retourne 405 pour une méthode non-GET', async () => {
    const req = createMockReq('POST', { code: 'AB3K7P' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(405);
  });

  it('gère le multi-fichier', async () => {
    seedTransfer(createTestMetadata({
      files: [
        { originalName: 'a.pdf', size: 500, chunkCount: 1, chunkUrls: ['https://blob.test/transfers/AB3K7P/f000-chunk-000.enc'] },
        { originalName: 'b.jpg', size: 800, chunkCount: 1, chunkUrls: ['https://blob.test/transfers/AB3K7P/f001-chunk-000.enc'] },
      ],
    }));
    const req = createMockReq('GET', { code: 'AB3K7P' });
    const res = createMockRes();

    await infoHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.files).toHaveLength(2);
    expect(res._body.files[0].originalName).toBe('a.pdf');
    expect(res._body.files[1].originalName).toBe('b.jpg');
  });
});

// ── Tests delete endpoint ───────────────────────────────────────────────────

describe('POST /api/file/:code/delete', async () => {
  const { default: deleteHandler } = await import('../api/file/[code]/delete.js');

  it('supprime un transfert avec le bon token', async () => {
    const meta = seedTransfer();
    const req = createMockReq('POST', { code: 'AB3K7P' }, { 'x-delete-token': 'b'.repeat(32) });
    const res = createMockRes();

    await deleteHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(false);
  });

  it('rejette un mauvais token', async () => {
    seedTransfer();
    const req = createMockReq('POST', { code: 'AB3K7P' }, { 'x-delete-token': 'c'.repeat(32) });
    const res = createMockRes();

    await deleteHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(true);
  });

  it('rejette un token au format invalide', async () => {
    seedTransfer();
    const req = createMockReq('POST', { code: 'AB3K7P' }, { 'x-delete-token': 'short' });
    const res = createMockRes();

    await deleteHandler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('retourne 404 pour un code inexistant', async () => {
    const req = createMockReq('POST', { code: 'ZZZZZZ' }, { 'x-delete-token': 'b'.repeat(32) });
    const res = createMockRes();

    await deleteHandler(req, res);

    expect(res.statusCode).toBe(404);
  });
});

// ── Tests download endpoint ─────────────────────────────────────────────────

describe('GET /api/file/:code/download', async () => {
  const { default: downloadHandler } = await import('../api/file/[code]/download.js');

  it('télécharge un chunk avec succès', async () => {
    seedTransfer();
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._ended).toBe(true);
    expect(res._headers['Content-Type']).toBe('application/octet-stream');
  });

  it('retourne 404 pour un code inexistant', async () => {
    const req = createMockReq('GET', { code: 'ZZZZZZ', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('retourne 410 pour un transfert expiré', async () => {
    seedTransfer(createTestMetadata({ expiresAt: Date.now() - 1000 }));
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(410);
  });

  it('retourne 400 pour un index de chunk hors limites', async () => {
    seedTransfer();
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '99' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('retourne 400 pour un index de fichier hors limites', async () => {
    seedTransfer();
    const req = createMockReq('GET', { code: 'AB3K7P', file: '5', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('retourne 410 si quota de téléchargements atteint', async () => {
    seedTransfer(createTestMetadata({ downloadCount: 1, maxDownloads: 1 }));
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(410);
  });

  it('ne consomme PAS le quota (lecture seule) lors du téléchargement', async () => {
    seedTransfer(createTestMetadata({ downloadCount: 0, maxDownloads: 1 }));
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(200);
    // Le compteur ne doit pas avoir bougé et le transfert ne doit pas être supprimé
    const meta = JSON.parse(blobStore.get('metadata/AB3K7P.json'));
    expect(meta.downloadCount).toBe(0);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(true);
  });
});

// ── Tests confirm endpoint ──────────────────────────────────────────────────

describe('POST /api/file/:code/confirm', async () => {
  const { default: confirmHandler } = await import('../api/file/[code]/confirm.js');

  it('incrémente le compteur sans supprimer quand le quota n\'est pas atteint', async () => {
    seedTransfer(createTestMetadata({ downloadCount: 0, maxDownloads: 3 }));
    const req = createMockReq('POST', { code: 'AB3K7P' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.consumed).toBe(false);
    const meta = JSON.parse(blobStore.get('metadata/AB3K7P.json'));
    expect(meta.downloadCount).toBe(1);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(true);
  });

  it('supprime tout le transfert quand le quota est atteint', async () => {
    seedTransfer(createTestMetadata({ downloadCount: 0, maxDownloads: 1 }));
    const req = createMockReq('POST', { code: 'AB3K7P' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.consumed).toBe(true);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(false);
    expect(blobStore.has('transfers/AB3K7P/f000-chunk-000.enc')).toBe(false);
  });

  it('est idempotent sur un code déjà consommé (404 → ok)', async () => {
    const req = createMockReq('POST', { code: 'ZZZZZZ' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.consumed).toBe(true);
  });

  it('retourne 400 pour un code mal formaté', async () => {
    const req = createMockReq('POST', { code: 'abc' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('retourne 405 pour une méthode non-POST', async () => {
    const req = createMockReq('GET', { code: 'AB3K7P' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(405);
  });

  // ── Verifier (preuve de mot de passe) ──
  const VERIFIER = 'c'.repeat(64);

  it('refuse (403) la confirmation sans verifier quand le transfert en a un', async () => {
    seedTransfer(createTestMetadata({ verifier: VERIFIER }));
    const req = createMockReq('POST', { code: 'AB3K7P' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(403);
    // Rien ne doit avoir été consommé ni supprimé
    const meta = JSON.parse(blobStore.get('metadata/AB3K7P.json'));
    expect(meta.downloadCount).toBe(0);
  });

  it('refuse (403) un verifier incorrect', async () => {
    seedTransfer(createTestMetadata({ verifier: VERIFIER }));
    const req = createMockReq('POST', { code: 'AB3K7P' }, { 'x-blob-verifier': 'd'.repeat(64) });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(true);
  });

  it('accepte le bon verifier et consomme le quota', async () => {
    seedTransfer(createTestMetadata({ verifier: VERIFIER, maxDownloads: 1 }));
    const req = createMockReq('POST', { code: 'AB3K7P' }, { 'x-blob-verifier': VERIFIER });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.consumed).toBe(true);
    expect(blobStore.has('metadata/AB3K7P.json')).toBe(false);
  });

  it('reste compatible avec les anciens transferts sans verifier', async () => {
    seedTransfer(createTestMetadata({ maxDownloads: 3 }));
    const req = createMockReq('POST', { code: 'AB3K7P' });
    const res = createMockRes();

    await confirmHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._body.consumed).toBe(false);
  });
});

// ── Tests download : verifier ───────────────────────────────────────────────

describe('GET /api/file/:code/download — verifier', async () => {
  const { default: downloadHandler } = await import('../api/file/[code]/download.js');
  const VERIFIER = 'c'.repeat(64);

  it('refuse (403) le téléchargement sans verifier quand le transfert en a un', async () => {
    seedTransfer(createTestMetadata({ verifier: VERIFIER }));
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('sert le chunk avec le bon verifier', async () => {
    seedTransfer(createTestMetadata({ verifier: VERIFIER }));
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' }, { 'x-blob-verifier': VERIFIER });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(200);
  });

  it('sert le chunk sans verifier pour un ancien transfert (compat)', async () => {
    seedTransfer(createTestMetadata());
    const req = createMockReq('GET', { code: 'AB3K7P', file: '0', chunk: '0' });
    const res = createMockRes();

    await downloadHandler(req, res);

    expect(res.statusCode).toBe(200);
  });
});
