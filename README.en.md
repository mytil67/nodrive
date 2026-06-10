# NoDrive

Temporary encrypted file transfer between two machines — no account, no install, from the browser.

**[-> nodrive.cc](https://nodrive.cc)** · dev by [@mytil](https://github.com/mytil67)

---

## How it works

1. **Sender** — drops a file, chooses a password -> gets a 6-character code
2. **Recipient** — opens the site, enters the code + password -> downloads the decrypted file

No long URL to copy-paste. Two short pieces of information to share verbally or by message.

---

## Security

| Mechanism | Detail |
|---|---|
| **Encryption** | AES-256-GCM, performed in the browser (Web Crypto API) |
| **Key derivation** | PBKDF2 / SHA-256 / 600,000 iterations |
| **Salt** | 256-bit random per transfer (stored in metadata, not secret) |
| **Key** | Never sent to the server — derived locally on both sender and recipient side |
| **Storage** | Private Vercel Blobs (inaccessible without server token) |
| **Deletion** | Automatic after first download (safety net: 1-hour expiration if never downloaded) |
| **Cancellation** | Sender receives a 128-bit `deleteToken` to delete the transfer |
| **Rate limiting** | Vercel Edge Middleware — 5 uploads/min, 30 req/min on other endpoints |
| **HTTP headers** | CSP, X-Frame-Options DENY, HSTS preload, X-Content-Type-Options, Referrer-Policy |

The server never sees the password or the decryption key.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + React Router |
| Backend | Vercel Serverless Functions (Node.js ESM) |
| Storage | Vercel Blob (private access) |
| Edge | Vercel Edge Middleware (`@vercel/edge`) |
| Deployment | Vercel |

---

## Structure

```
/
├── api/
│   ├── upload.js                 POST /api/upload (files ≤ 4 MB)
│   ├── upload/
│   │   ├── authorize.js          POST /api/upload/authorize (Blob client token)
│   │   └── complete.js           POST /api/upload/complete (metadata post-upload)
│   ├── health.js                 GET  /api/health
│   ├── cron/cleanup.js           GET  /api/cron/cleanup
│   └── file/[code]/
│       ├── info.js               GET  /api/file/:code/info
│       ├── download.js           GET  /api/file/:code/download
│       └── delete.js             POST /api/file/:code/delete  (deleteToken required)
├── frontend/
│   └── src/
│       ├── pages/                Home · Send · Receive
│       ├── components/           BackButton · CodeDisplay · DropZone · Footer · ProgressBar
│       ├── api/client.js         HTTP layer (XHR upload, fetch info/download/cancel)
│       └── utils/crypto.js       AES-GCM · PBKDF2 · generateSalt
├── middleware.js                 Rate limiting (Vercel Edge)
└── vercel.json                   SPA routing · Security headers · Cron
```

Vercel Blob storage:
- `transfers/{CODE}/file.enc` — encrypted file (raw binary)
- `metadata/{CODE}.json` — public metadata (name, size, salt, expiration) — no key or password

---

## Local setup

```bash
git clone https://github.com/mytil67/nodrive.git
cd nodrive
npm install
cd frontend && npm install && cd ..

# Link to your Vercel project and pull environment variables
vercel link
vercel env pull .env.local

# Start (frontend + API on the same port)
vercel dev
```

> Do not use `npm run dev` from `frontend/` alone — `/api` routes would not be available.

## Deployment

```bash
vercel --prod
```

The `prebuild` script automatically increments the patch version in `frontend/package.json` on each build.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | — | Automatically injected by Vercel Blob (connect via Dashboard) |
| `CRON_SECRET` | — | Secret to secure `/api/cron/cleanup` (`openssl rand -hex 32`) |
| `MAX_FILE_SIZE_MB` | `25` | Maximum file size (MB) |
| `MAX_DOWNLOADS` | `1` | Auto-delete after N download(s) |
| `EXPIRATION_HOURS` | `1` | Safety net: delete never-downloaded transfers after N hours |
| `VITE_MAX_FILE_SIZE_MB` | `25` | Same, exposed to frontend for client-side validation |

---

## Limitations

- **Max size**: 25 MB by default. Files > 4 MB are uploaded directly to Vercel Blob (client upload). Configurable via `MAX_FILE_SIZE_MB`.
- **Rate limiting**: in-memory counter per edge instance (best-effort, not distributed). For precise rate-limiting, connect a `@vercel/kv` store.
- **Single use**: `MAX_DOWNLOADS=1` by default. Adjustable if needed.

---

## CLI

A command-line tool is available in the `cli/` folder. It uses the same cryptography (AES-256-GCM + PBKDF2) and calls the deployed API. No dependencies — Node.js >= 18 is enough.

### Configuration

The CLI requires the URL of **your own** NoDrive instance (no shared instance by default):

```bash
# Option 1: environment variable (recommended)
export NODRIVE_URL=https://my-instance.vercel.app

# Option 2: --url flag on each command
nodrive send file.pdf --url https://my-instance.vercel.app
```

### Installation

```bash
# Direct usage (no install)
npx nodrive-cli send file.pdf

# Global install
npm install -g nodrive-cli
nodrive send file.pdf
```

### Commands

```bash
# Send a file
nodrive send report.pdf -p "mypassword"
#   Code          : AB3K7P
#   Password      : mypassword
#   Delete token  : a3f9...

# Receive a file
nodrive receive AB3K7P -p "mypassword"
nodrive receive AB3K7P -p "mypassword" -o ~/Downloads

# Cancel a transfer (before download)
nodrive cancel AB3K7P --token a3f9...
```

### npm publishing

```bash
cd cli
npm publish --access public
```

---

## License

MIT
