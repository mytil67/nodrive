import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

/**
 * Configuration Vite pour NoDrive (déploiement Vercel).
 *
 * Développement local : utiliser `vercel dev` (depuis la racine du projet),
 * qui démarre frontend + API serverless sur le même port (3000 par défaut).
 * Ne pas utiliser `npm run dev` depuis frontend/ seul : les routes /api
 * ne seraient pas disponibles.
 */
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Désactive le polyfill modulepreload de Vite : il est injecté en <script>
    // inline dans index.html, ce que bloque notre CSP stricte (script-src 'self').
    // Les navigateurs modernes (ceux qui supportent WebCrypto, déjà requis ici)
    // gèrent modulepreload nativement, donc le polyfill est superflu.
    modulePreload: { polyfill: false },
  },
});
