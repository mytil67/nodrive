# Chiffrement côté client

> Fichier source : `frontend/src/utils/crypto.js`

## Principe

Tout le chiffrement se fait **dans le navigateur** via la [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). Le serveur ne voit **jamais** les données en clair ni le mot de passe.

## Algorithmes

| Étape | Algorithme | Paramètres |
|-------|-----------|------------|
| Dérivation de clé | PBKDF2 | SHA-256, 600 000 itérations |
| Chiffrement | AES-GCM | 256 bits, IV 12 octets |
| Salt | `crypto.getRandomValues` | 256 bits (32 octets), hex |
| Code transfert | `crypto.getRandomValues` | 6 caractères, rejection sampling |

## Génération du code de transfert

```
Alphabet : ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (31 caractères)
```

- Exclut 0/O, 1/I/L pour éviter la confusion visuelle
- **Rejection sampling** : `limit = 256 - (256 % 31) = 248`
  - Les octets ≥ 248 sont rejetés → pas de biais modulo
  - Chaque caractère a exactement 1/31 de probabilité

## Format des données chiffrées

```
┌──────────┬───────────────────────┐
│  IV (12) │   Ciphertext (N)      │
│  octets  │   octets              │
└──────────┴───────────────────────┘
```

- L'IV (Initialization Vector) est généré aléatoirement pour chaque fichier
- Il est stocké en tête des données chiffrées
- AES-GCM inclut un tag d'authentification de 16 octets dans le ciphertext

## Flux de chiffrement (envoi)

```
passphrase + salt → PBKDF2 → AES-256 key
                                  ↓
fichier.arrayBuffer() + IV → AES-GCM encrypt → [IV | ciphertext]
```

## Flux de déchiffrement (réception)

```
passphrase + salt (du serveur) → PBKDF2 → AES-256 key
                                               ↓
[IV | ciphertext] → split → AES-GCM decrypt → fichier original
```

## Sécurité

- Le salt est **unique par transfert** et stocké dans les métadonnées serveur
- Le salt est **public** (envoyé avec le code) — la sécurité repose sur le mot de passe
- 600 000 itérations PBKDF2 rendent le brute-force coûteux
- AES-GCM assure à la fois la confidentialité et l'intégrité (authentification)
- Un mauvais mot de passe produit une erreur de déchiffrement (pas de données corrompues silencieuses)

## Voir aussi

- [[40 — Modèle de sécurité]]
- [[12 — Upload multi-fichier]]
