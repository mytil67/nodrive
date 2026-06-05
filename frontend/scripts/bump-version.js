/**
 * Incrémente le numéro de patch dans frontend/package.json avant chaque build.
 * Ex : 0.1.3 → 0.1.4
 * Appelé automatiquement par le script "prebuild".
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath   = resolve(__dirname, '../package.json');
const pkg       = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`[bump-version] ${major}.${minor}.${patch} → ${pkg.version}`);
