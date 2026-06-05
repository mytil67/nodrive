import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
});
