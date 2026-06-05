#!/usr/bin/env node
/**
 * NoDrive CLI — transfert de fichiers chiffré
 *
 * Requiert Node.js >= 18 (crypto.webcrypto + fetch natifs).
 * Aucune dépendance externe.
 *
 * Usage :
 *   nodrive send <fichier> [-p <mot-de-passe>] [--url <url>]
 *   nodrive receive <code>  [-p <mot-de-passe>] [-o <dossier>] [--url <url>]
 *   nodrive cancel <code>   --token <deleteToken> [--url <url>]
 */

import { webcrypto }                    from 'crypto';
import { readFileSync, writeFileSync }  from 'fs';
import { basename, resolve, join }      from 'path';
import { createInterface }              from 'readline';

const { subtle, getRandomValues } = webcrypto;

// ── Vérification version Node ─────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('NoDrive CLI requiert Node.js >= 18.0.0');
  process.exit(1);
}

const DEFAULT_URL = process.env.NODRIVE_URL || '';

// ── Parsing des arguments ─────────────────────────────────────────────────────

function usage() {
  console.log(`
NoDrive CLI — transfert de fichiers chiffré entre deux machines

Usage :
  nodrive send <fichier>  [-p <mot-de-passe>] [--url <url>]
  nodrive receive <code>  [-p <mot-de-passe>] [-o <dossier>] [--url <url>]
  nodrive cancel <code>   --token <deleteToken> [--url <url>]

Options :
  -p, --password <pass>    Mot de passe (min. 6 caractères)
  -o, --output <dossier>   Dossier de destination (défaut : répertoire courant)
      --token <token>      Delete token (retourné lors de l'envoi)
      --url <url>          URL du serveur NoDrive (ou variable NODRIVE_URL)
  -h, --help               Afficher cette aide

Vous devez déployer votre propre instance NoDrive et fournir son URL
via --url ou la variable d'environnement NODRIVE_URL.
`);
  process.exit(0);
}

function parseArgs(argv) {
  const args = { command: null, target: null, password: null, output: '.', token: null, url: DEFAULT_URL };
  let i = 2;
  if (!argv[i] || argv[i] === '-h' || argv[i] === '--help') usage();
  args.command = argv[i++];
  if (argv[i] && !argv[i].startsWith('-')) args.target = argv[i++];
  while (i < argv.length) {
    const flag = argv[i++];
    if ((flag === '-p' || flag === '--password') && argv[i]) args.password = argv[i++];
    else if ((flag === '-o' || flag === '--output') && argv[i]) args.output = argv[i++];
    else if (flag === '--token' && argv[i])    args.token = argv[i++];
    else if (flag === '--url' && argv[i])      args.url   = argv[i++];
    else if (flag === '-h' || flag === '--help') usage();
  }
  return args;
}

// ── Prompt interactif ─────────────────────────────────────────────────────────

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

// ── Formatage ─────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024)        return `${bytes} o`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 ** 2).toFixed(2)} Mo`;
}

// ── Crypto (identique au navigateur) ─────────────────────────────────────────

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode() {
  const bytes = new Uint8Array(6);
  getRandomValues(bytes);
  return Array.from(bytes).map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

function generateSalt() {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(passphrase, saltHex, usage) {
  const enc       = new TextEncoder();
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const material  = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 200_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

async function encryptBuffer(buffer, key) {
  const iv         = getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
  const result     = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result;
}

async function decryptBuffer(data, key) {
  try {
    return await subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  } catch {
    throw new Error('Déchiffrement échoué — mot de passe incorrect ou fichier corrompu.');
  }
}

// ── Commande : send ───────────────────────────────────────────────────────────

async function cmdSend({ target, password, url }) {
  if (!target) { console.error('Usage : nodrive send <fichier>'); process.exit(1); }

  const filePath = resolve(target);
  let fileBuffer;
  try { fileBuffer = readFileSync(filePath); }
  catch { console.error(`Erreur : impossible de lire "${filePath}"`); process.exit(1); }

  const fileName = basename(filePath);
  const fileSize = fileBuffer.length;

  if (!password) password = await prompt('Mot de passe (min. 6 caractères) : ');
  if (password.length < 6) { console.error('Erreur : mot de passe trop court (min. 6 caractères).'); process.exit(1); }

  process.stdout.write('\nChiffrement…  ');
  const code      = generateCode();
  const salt      = generateSalt();
  const key       = await deriveKey(password, salt, 'encrypt');
  const encrypted = await encryptBuffer(fileBuffer, key);
  process.stdout.write('✓\n');

  process.stdout.write(`Envoi (${fmtSize(encrypted.length)})… `);
  const res = await fetch(`${url}/api/upload`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-blob-code':  code,
      'x-blob-name':  encodeURIComponent(fileName),
      'x-blob-size':  String(fileSize),
      'x-blob-salt':  salt,
    },
    body: encrypted,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) { process.stdout.write('\n'); console.error(`Erreur : ${body.error || res.status}`); process.exit(1); }
  process.stdout.write('✓\n');

  const divider = '─'.repeat(44);
  console.log(`\n${divider}`);
  console.log(`  Fichier       : ${fileName} (${fmtSize(fileSize)})`);
  console.log(`  Code          : ${code}`);
  console.log(`  Mot de passe  : ${password}`);
  if (body.deleteToken) {
    console.log(`  Delete token  : ${body.deleteToken}`);
  }
  console.log(divider);
  console.log(`\nSur l'autre machine :\n  nodrive receive ${code} -p "${password}"${url !== DEFAULT_URL ? ` --url ${url}` : ''}\n`);
}

// ── Commande : receive ────────────────────────────────────────────────────────

async function cmdReceive({ target, password, output, url }) {
  if (!target) { console.error('Usage : nodrive receive <code>'); process.exit(1); }

  const code = target.toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) { console.error('Erreur : code invalide (6 caractères attendus, ex: AB3K7P)'); process.exit(1); }

  process.stdout.write('Vérification… ');
  const infoRes = await fetch(`${url}/api/file/${code}/info`);
  const info    = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok) { process.stdout.write('\n'); console.error(`Erreur : ${info.error || infoRes.status}`); process.exit(1); }
  process.stdout.write('✓\n');
  console.log(`  Fichier : ${info.originalName}  (${fmtSize(info.size)})`);

  if (!password) password = await prompt('Mot de passe : ');

  process.stdout.write('Téléchargement… ');
  const dlRes = await fetch(`${url}/api/file/${code}/download`);
  if (!dlRes.ok) {
    const b = await dlRes.json().catch(() => ({}));
    process.stdout.write('\n'); console.error(`Erreur : ${b.error || dlRes.status}`); process.exit(1);
  }
  const encrypted = new Uint8Array(await dlRes.arrayBuffer());
  process.stdout.write('✓\n');

  process.stdout.write('Déchiffrement… ');
  const key = await deriveKey(password, info.salt, 'decrypt');
  let decrypted;
  try { decrypted = await decryptBuffer(encrypted, key); }
  catch (err) { process.stdout.write('\n'); console.error(`Erreur : ${err.message}`); process.exit(1); }
  process.stdout.write('✓\n');

  const outputPath = join(resolve(output), info.originalName);
  writeFileSync(outputPath, Buffer.from(decrypted));
  console.log(`\nFichier sauvegardé : ${outputPath}\n`);
}

// ── Commande : cancel ─────────────────────────────────────────────────────────

async function cmdCancel({ target, token, url }) {
  if (!target || !token) {
    console.error('Usage : nodrive cancel <code> --token <deleteToken>');
    process.exit(1);
  }
  const code = target.toUpperCase();
  const res  = await fetch(`${url}/api/file/${code}/delete`, {
    method:  'POST',
    headers: { 'x-delete-token': token },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`Erreur : ${body.error || res.status}`); process.exit(1); }
  console.log(`Transfert ${code} supprimé.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

if (!args.url) {
  console.error('Erreur : URL du serveur NoDrive non définie.');
  console.error('Utilisez --url <url> ou définissez la variable NODRIVE_URL.');
  console.error('Vous devez déployer votre propre instance — voir le README.');
  process.exit(1);
}

switch (args.command) {
  case 'send':    await cmdSend(args);    break;
  case 'receive': await cmdReceive(args); break;
  case 'cancel':  await cmdCancel(args);  break;
  default:        usage();
}
