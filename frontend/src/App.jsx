import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Send from './pages/Send.jsx';
import Receive from './pages/Receive.jsx';
import Footer from './components/Footer.jsx';

/**
 * Composant racine de l'application.
 * Déclare les trois routes principales :
 *  /          → page d'accueil
 *  /send      → envoi de fichier
 *  /receive   → réception (avec code optionnel dans l'URL)
 */
export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/send" element={<Send />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/receive/:code" element={<Receive />} />
      </Routes>
      <Footer />
    </div>
  );
}
