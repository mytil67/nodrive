# UX & Animations

> Fichier source : `frontend/src/index.css`

## Design system

### Palette de couleurs

| Variable | Valeur | Usage |
|----------|--------|-------|
| `--color-bg` | `#0f1117` | Fond principal (dark) |
| `--color-surface` | `#1a1d27` | Cartes, formulaires |
| `--color-border` | `#2a2d3e` | Bordures |
| `--color-primary` | `#5b8af0` | Actions, liens, accents |
| `--color-primary-hover` | `#7aa4ff` | Hover primaire |
| `--color-danger` | `#e05c5c` | Erreurs |
| `--color-success` | `#4caf82` | Succès, fichier sélectionné |
| `--color-text` | `#e2e4f0` | Texte principal |
| `--color-muted` | `#8b8fa8` | Texte secondaire |

### Rayons et ombres

| Variable | Valeur |
|----------|--------|
| `--radius` | `12px` (cartes) |
| `--radius-sm` | `6px` (boutons, inputs) |
| `--shadow` | `0 4px 24px rgba(0,0,0,0.4)` |
| `--transition` | `0.2s ease` |

## Animations

### Fade-in (entrée des sections)

```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-in { animation: fadeSlideIn 0.4s ease-out both; }
```

Appliqué sur : toutes les sections de status (idle, encrypting, uploading, done, error), les items de la file-list.

### Shimmer (barre de progression)

```css
@keyframes shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

Un pseudo-élément `::after` semi-transparent glisse sur la barre de progression remplie.

### Barre de progression indéterminée

```css
@keyframes progress-slide {
  0%   { transform: translateX(-150%); }
  100% { transform: translateX(370%); }
}
```

Utilisée pendant le chiffrement et le déchiffrement (pas de % connu).

### Glow pulse (hero)

```css
@keyframes glow-pulse {
  0%, 100% { opacity: 0.7; scale(1); }
  50%       { opacity: 1;   scale(1.08); }
}
```

Halo bleu derrière le titre "NoDrive" sur la page d'accueil.

### Boutons

- **Hover** : changement de couleur/ombre
- **Active** : `transform: scale(0.97)` — feedback tactile
- **Action cards** : `translateY(-2px)` au hover, `scale(0.98)` au clic

## Composants visuels clés

### DropZone
- État vide : bordure tiretée, icône upload
- État rempli : bordure pleine verte, icône check, liste des fichiers
- État drag-over : fond bleu léger

### Carte de progression (send-progress-card)
- Icône ronde colorée (bleu, rouge, vert)
- Titre + sous-label
- Barre de progression (déterminée ou indéterminée)

### CodeDisplay (après envoi)
- Badge succès ✓
- Code en gros caractères monospace
- Boutons copier (code + mot de passe)
- QR code SVG
- Bouton annulation

## Responsive

- `max-width: 520px` pour la page Send
- `max-width: 640px` pour la page Receive
- `max-width: 480px` pour les action cards
- Breakpoint `480px` : empile les boutons en colonne

## Voir aussi

- [[10 — Frontend overview]]
- [[15 — Internationalisation]]
