import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import useAuthStore from './stores/authStore.js';
import Header from './components/layout/Header';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LivePage from './pages/LivePage';
import ExplorePage from './pages/ExplorePage';
import AskPage from './pages/AskPage';
import FactCheckPage from './pages/FactCheckPage';
import EventPage from './pages/EventPage';
import NotFoundPage from './pages/NotFoundPage';
import './styles/login.css';

export default function App() {
  const { user, loading, init, isConfigured } = useAuthStore();

  useEffect(() => {
    const unsubscribe = init();
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [init]);

  // Show loading spinner during initial auth check
  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '100vh' }}>
        <div className="loading__spinner" />
      </div>
    );
  }

  // If not authenticated, show login page
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app-layout">
      <Header />
      <main className="app-main" id="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/fact-check" element={<FactCheckPage />} />
          <Route path="/event/:id" element={<EventPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
