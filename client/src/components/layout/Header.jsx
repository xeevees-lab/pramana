import { NavLink } from 'react-router-dom';
import useAuthStore from '../../stores/authStore.js';
import { useState, useRef, useEffect } from 'react';

const navLinks = [
  { to: '/', label: 'Dashboard' },
  { to: '/live', label: 'Live' },
  { to: '/explore', label: 'Explore' },
  { to: '/ask', label: 'Ask' },
  { to: '/fact-check', label: 'Fact Check' },
];

export default function Header() {
  const { user, firebaseUser, signOut } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [menuOpen]);

  return (
    <header className="app-header" role="banner">
      <NavLink to="/" className="app-header__logo" aria-label="PRAMĀṆA home">
        PRAMĀṆA
      </NavLink>

      <nav className="app-header__nav" aria-label="Main navigation">
        {navLinks.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `app-header__nav-link${isActive ? ' app-header__nav-link--active' : ''}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="app-header__actions">
        {user && (
          <div className="user-menu" ref={menuRef}>
            <button
              className="user-menu__trigger"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="User menu"
            >
              {(user.custom_avatar_url || firebaseUser?.photoURL || user.photo_url) ? (
                <img
                  src={user.custom_avatar_url || firebaseUser?.photoURL || user.photo_url}
                  alt=""
                  className="user-menu__avatar"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <span className="user-menu__avatar-fallback" aria-hidden="true">
                  {(user.display_name || user.email || '?')[0].toUpperCase()}
                </span>
              )}
            </button>

            {menuOpen && (
              <div className="user-menu__dropdown" role="menu">
                <div className="user-menu__info">
                  <span className="user-menu__name">{user.display_name || 'User'}</span>
                  <span className="user-menu__email">{user.email}</span>
                </div>
                <hr className="divider" style={{ margin: '0' }} />
                <NavLink
                  to="/profile"
                  className="user-menu__item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Profile
                </NavLink>
                <NavLink
                  to="/settings"
                  className="user-menu__item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </NavLink>
                <hr className="divider" style={{ margin: '0' }} />
                <button
                  className="user-menu__item"
                  role="menuitem"
                  onClick={() => { signOut(); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
