# Versioning

## Schéma

Semantic Versioning (semver) : `MAJOR.MINOR.PATCH`

| Composant | Quand incrémenter |
|-----------|------------------|
| MAJOR | Breaking changes (pas encore utilisé) |
| MINOR | Nouvelles fonctionnalités (multi-fichier, etc.) |
| PATCH | Auto-incrémenté à chaque build |

## Auto-bump

> Fichier : `frontend/scripts/bump-version.js`

Le script est exécuté via le hook `prebuild` dans `package.json` :

```json
{
  "scripts": {
    "prebuild": "node scripts/bump-version.js",
    "build": "vite build"
  }
}
```

À chaque `npm run build` :
1. Lit `frontend/package.json`
2. Incrémente le patch : `0.3.1` → `0.3.2`
3. Écrit le nouveau `package.json`
4. Log : `[bump-version] 0.3.1 → 0.3.2`

## Affichage

La version est affichée dans le **Footer** via la variable globale `__APP_VERSION__`, injectée par Vite :

```javascript
// vite.config.js
define: {
  __APP_VERSION__: JSON.stringify(pkg.version),
}
```

```jsx
// Footer.jsx
<span className="app-footer__version">v{__APP_VERSION__}</span>
```

## Historique des versions

| Version | Feature |
|---------|---------|
| 0.1.x | Upload/download fichier unique, blob direct |
| 0.2.x | Chunked upload/download (>3.5 Mo), audit sécurité |
| 0.3.x | Multi-fichier, fade animations, UX polish |

## Voir aussi

- [[33 — GitHub]]
- [[10 — Frontend overview]]
