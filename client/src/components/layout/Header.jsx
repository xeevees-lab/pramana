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
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt=""
                  className="user-menu__avatar"
                  referrerPolicy="no-referrer"
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
                <button
                  className="user-menu__item"
                  role="menuitem"
                  onClick={() => { signOut(); setMenuOpen(false); }}
                >
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
