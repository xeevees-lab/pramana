import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './stores/authStore.js';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import LoginPage from './pages/LoginPage';
import LivePage from './pages/LivePage';
import ExplorePage from './pages/ExplorePage';
import AskPage from './pages/AskPage';
import EventPage from './pages/EventPage';
import ArticlePage from './pages/ArticlePage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import FloatingIntelligence from './components/common/FloatingIntelligence';
import './styles/login.css';

export default function App() {
  const { user, loading, init, isConfigured } = useAuthStore();

  // Apply persisted theme & font on startup
  useEffect(() => {
    const savedTheme = localStorage.getItem('pramana_theme') || 'system';
    const savedFont = localStorage.getItem('pramana_chat_font') || 'sans';
    
    if (savedTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    document.documentElement.setAttribute('data-chat-font', savedFont);
  }, []);

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
          <Route path="/" element={<Navigate to="/explore" replace />} />
          <Route path="/dashboard" element={<Navigate to="/explore" replace />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/fact-check" element={<Navigate to="/ask?mode=fact-check" replace />} />
          <Route path="/event/:id" element={<EventPage />} />
          <Route path="/article/:id" element={<ArticlePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
      <FloatingIntelligence />
    </div>
  );
}

