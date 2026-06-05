/**
 * GET /api/health
 *
 * Endpoint de diagnostic — retourne l'état de configuration du serveur.
 * Ne retourne JAMAIS la valeur du token, seulement sa présence booléenne.
 * Utilisé par le frontend avant chaque upload pour détecter rapidement
 * une misconfiguration (BLOB_READ_WRITE_TOKEN absent) plutôt que d'attendre
 * un timeout silencieux de @vercel/blob/client.
 */
export default function handler(req, res) {
  // Accessible en GET uniquement
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  return res.json({
    ok:           true,
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    env:          process.env.VERCEL_ENV || 'local',
  });
}
