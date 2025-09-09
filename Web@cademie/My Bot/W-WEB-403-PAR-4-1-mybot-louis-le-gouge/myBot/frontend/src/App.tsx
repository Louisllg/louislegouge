import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import ChatPage from './pages/Chat';
import AnimalsPage from './pages/Animals';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <span className="brand">Generative Pets</span>
        <Link to="/">Chat</Link>
        <Link to="/animals">Animaux</Link>
      </nav>
      <div style={{ display: 'flex', height: 'calc(100vh - 49px)', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/animals" element={<AnimalsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
