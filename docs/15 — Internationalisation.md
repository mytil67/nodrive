# Internationalisation (i18n)

## Architecture

| Fichier | Rôle |
|---------|------|
| `i18n/translations.js` | Dictionnaire FR/EN |
| `i18n/I18nContext.jsx` | Provider React + hook `useI18n()` |

## Utilisation

```jsx
const { t, lang, toggle } = useI18n();

// Simple
t('send.title')           // → "Envoyer"

// Avec interpolation
t('send.error.toolarge', { size: '30 Mo', max: 25 })
// → "Trop volumineux (30 Mo — max 25 Mo)"

// Toggle
toggle()                  // fr ↔ en
```

## Détection de langue

1. `localStorage.getItem('nodrive-lang')` si présent
2. `navigator.language` — si commence par `fr` → français
3. Fallback : anglais

## Clés de traduction

### Structure des clés

```
section.element.variant
```

| Préfixe | Section |
|---------|---------|
| `home.*` | Page d'accueil |
| `send.*` | Page d'envoi |
| `receive.*` | Page de réception |
| `code.*` | Affichage du code (CodeDisplay) |
| `drop.*` | Zone de dépôt (DropZone) |
| `progress.*` | Barre de progression |
| `back` | Bouton retour |
| `lang` | Label du toggle langue |

### Clés multi-fichier (ajoutées v0.3.x)

| Clé | FR | EN |
|-----|----|----|
| `send.files` | fichiers | files |
| `send.encrypting.file` | Chiffrement du fichier | Encrypting file |
| `receive.downloading.file` | Téléchargement du fichier | Downloading file |
| `receive.decrypting.file` | Déchiffrement du fichier | Decrypting file |
| `receive.success.multi` | {count} fichiers téléchargés… | {count} files downloaded… |
| `receive.files.count` | fichiers | files |
| `code.sent.multi` | Fichiers chiffrés et envoyés | Files encrypted and sent |
| `drop.files.count` | fichier(s) sélectionné(s) | file(s) selected |
| `drop.add` | Cliquez pour en ajouter | Click to add more |
| `drop.remove` | Retirer | Remove |

## Voir aussi

- [[14 — UX & Animations]]
- [[10 — Frontend overview]]
