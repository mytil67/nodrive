/**
 * POST /api/file/:code/confirm  — DÉPRÉCIÉ (no-op)
 *
 * Historiquement, ce endpoint consommait le quota après un déchiffrement réussi
 * côté client. Problème : un client malveillant pouvait télécharger en boucle
 * sans jamais appeler /confirm, contournant entièrement `maxDownloads`.
 *
 * La consommation du quota est désormais faite côté serveur, au téléchargement
 * du dernier chunk (voir api/file/[code]/download.js). Ce endpoint est conservé
 * uniquement pour ne pas casser d'anciens clients déjà chargés dans des
 * navigateurs : il valide la requête et répond 200 sans rien modifier (sinon il
 * provoquerait un double comptage).
 */

const CODE_REGEX = /^[A-Z2-9]{6}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  // No-op : la consommation réelle a lieu dans /download (chunk final).
  return res.json({ ok: true, deprecated: true });
}
