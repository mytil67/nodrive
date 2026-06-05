# Download multi-fichier

## Vue d'ensemble

Le téléchargement supporte les transferts **multi-fichier**. Chaque fichier est téléchargé chunk par chunk, reassemblé, déchiffré, puis proposé en téléchargement navigateur.

## Flux détaillé

```
1. GET /api/file/{code}/info
   → { files: [{ originalName, size, chunkCount }, ...], salt, expiresAt }

2. Utilisateur saisit le mot de passe
3. Dérivation de la clé : PBKDF2(passphrase, salt) → AES key

4. Pour chaque fichier fi (0..N-1) :
   a. Pour chaque chunk ci (0..chunkCount-1) :
      GET /api/file/{code}/download?file={fi}&chunk={ci}
      → binary data (application/octet-stream)
   b. Reassemblage des chunks → Uint8Array encryptedData
   c. AES-GCM decrypt(encryptedData, key) → decryptedBuffer
   d. Blob(decryptedBuffer) → URL.createObjectURL → <a>.click()
   e. Le navigateur propose le téléchargement du fichier

5. Quota : compteur incrémenté sur file=0&chunk=0 uniquement
6. Nettoyage : dernier chunk du dernier fichier → suppression si quota atteint
```

## Gestion du quota (côté serveur)

| Événement | Action |
|-----------|--------|
| `file=0, chunk=0` | Vérification quota + incrémentation `downloadCount` |
| Autres chunks | Pas de vérification (le transfert est "en cours") |
| Dernier chunk du dernier fichier | Si `downloadCount >= maxDownloads` → suppression metadata + chunks |

> **Pourquoi ?** Un téléchargement multi-chunk ne doit pas être interrompu au milieu. Le quota est vérifié uniquement au début, et le nettoyage se fait uniquement à la fin.

## Progression

```
progressionGlobale = chunksDownloaded / totalChunks * 90%
```

Les 10% restants couvrent le déchiffrement. Chaque fichier affiche un sous-label :
- `"Téléchargement du fichier 2/3 — rapport.pdf"`
- `"Déchiffrement du fichier 2/3…"`

## Rétrocompatibilité

Le endpoint `download.js` gère 3 formats de métadonnées :

| Format | Détection | Comportement |
|--------|-----------|--------------|
| Multi-fichier (nouveau) | `meta.files` existe | Utilise `files[fi].chunkUrls[ci]` |
| Chunked single (intermédiaire) | `meta.chunkUrls` existe | Wrappe dans un array `files` |
| Ancien blob unique | `meta.blobUrl` existe | Stream direct du blob |

## Voir aussi

- [[23 — Endpoint download]]
- [[22 — Endpoint info]]
- [[51 — Format des métadonnées]]
