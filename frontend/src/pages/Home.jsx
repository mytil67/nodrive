import { Link } from 'react-router-dom';

/**
 * Page d'accueil — choix entre envoyer et recevoir un fichier.
 */
export default function Home() {
  return (
    <main className="home">
      <div className="hero">
        <h1 className="hero__title">NoDrive</h1>
        <p className="hero__subtitle">
          Transfert de fichiers temporaire entre deux machines,<br />
          sans compte, sans installation, depuis votre navigateur.
        </p>
      </div>

      <div className="cards">
        <Link to="/send" className="card card--send">
          <span className="card__icon" aria-hidden="true">↑</span>
          <h2 className="card__title">Envoyer</h2>
          <p className="card__desc">Partagez un fichier et obtenez un code de transfert court</p>
        </Link>

        <Link to="/receive" className="card card--receive">
          <span className="card__icon" aria-hidden="true">↓</span>
          <h2 className="card__title">Recevoir</h2>
          <p className="card__desc">Entrez le code pour télécharger le fichier partagé</p>
        </Link>
      </div>

      <footer className="home__footer">
        Les fichiers sont automatiquement supprimés après expiration.
      </footer>
    </main>
  );
}
