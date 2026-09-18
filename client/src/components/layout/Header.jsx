import { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../stores/authStore.js';

const PRIMARY_CATEGORIES = [
  { label: 'Home', path: '/explore' },
  { label: 'News', path: '/explore?category=news' },
  { label: 'India', path: '/explore?category=india' },
  { label: 'World', path: '/explore?category=world' },
  { label: 'Tech', path: '/explore?category=technology' },
  { label: 'Business', path: '/explore?category=business' },
  { label: 'Sports', path: '/explore?category=sports' },
  { label: 'Live', path: '/live', isLive: true },
];

const MORE_CATEGORIES = [
  { label: 'Science', category: 'science' },
  { label: 'AI', category: 'ai' },
  { label: 'Climate', category: 'climate' },
  { label: 'Environment', category: 'environment' },
  { label: 'Culture', category: 'culture' },
  { label: 'Arts', category: 'arts' },
  { label: 'Travel', category: 'travel' },
  { label: 'Earth', category: 'earth' },
];

export default function Header() {
  const { user, firebaseUser, signOut } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  const userMenuRef = useRef(null);
  const moreRef = useRef(null);
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close drawer and menus on route change
  useEffect(() => {
    setDrawerOpen(false);
    setUserMenuOpen(false);
    setMoreDropdownOpen(false);
    setSearchActive(false);
  }, [location.pathname, location.search]);

  // Handle Quick Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (quickSearch.trim()) {
      navigate(`/ask?q=${encodeURIComponent(quickSearch.trim())}`);
      setQuickSearch('');
      setSearchActive(false);
    }
  };

  const currentCategory = new URLSearchParams(location.search).get('category');

  return (
    <>
      <header className="app-header" role="banner">
        <div className="app-header__inner">
          {/* 1. Left controls: Hamburger + Branding */}
          <div className="app-header__left">
            <button
              type="button"
              className="app-header__hamburger"
              onClick={() => setDrawerOpen(!drawerOpen)}
              aria-label="Toggle navigation desk drawer"
              aria-expanded={drawerOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <Link to="/explore" className="app-header__logo" aria-label="PRAMĀṆA Intelligence Home">
              PRAMĀṆA
            </Link>
          </div>

          {/* 2. Center Category Navigation Bar (Wireframe 1.1) */}
          <nav className="app-header__cat-nav" aria-label="News desks & categories">
            {PRIMARY_CATEGORIES.map((item) => {
              const isItemActive =
                item.path === '/live'
                  ? location.pathname === '/live'
                  : item.path === '/explore'
                  ? location.pathname === '/explore' && !currentCategory
                  : location.pathname === '/explore' && location.search.includes(`category=${item.path.split('category=')[1]}`);

              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  className={`app-header__cat-link ${isItemActive ? 'app-header__cat-link--active' : ''}`}
                >
                  {item.isLive && <span className="live-pulse-dot" aria-hidden="true" />}
                  {item.label}
                </NavLink>
              );
            })}

            {/* "More ▾" Dropdown */}
            <div className="app-header__more-container" ref={moreRef}>
              <button
                type="button"
                className={`app-header__more-trigger ${moreDropdownOpen ? 'app-header__more-trigger--open' : ''}`}
                onClick={() => setMoreDropdownOpen(!moreDropdownOpen)}
                aria-expanded={moreDropdownOpen}
                aria-haspopup="true"
              >
                More <span className="app-header__dropdown-caret">▾</span>
              </button>

              {moreDropdownOpen && (
                <div className="app-header__more-menu" role="menu">
                  <div className="app-header__more-grid">
                    {MORE_CATEGORIES.map((cat) => (
                      <Link
                        key={cat.label}
                        to={`/explore?category=${cat.category}`}
                        className="app-header__more-item"
                        role="menuitem"
                        onClick={() => setMoreDropdownOpen(false)}
                      >
                        {cat.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* 3. Right actions: Quick Search + User Profile */}
          <div className="app-header__actions">
            {/* Quick Search Toggle / Input */}
            <div className="app-header__search-wrap">
              {searchActive ? (
                <form onSubmit={handleSearchSubmit} className="app-header__search-form">
                  <input
                    ref={searchInputRef}
                    type="search"
                    className="app-header__search-input"
                    placeholder="Search intelligence, claims, events..."
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="app-header__search-submit" aria-label="Submit search">
                    ↵
                  </button>
                  <button
                    type="button"
                    className="app-header__search-close"
                    onClick={() => setSearchActive(false)}
                    aria-label="Close search"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  className="app-header__action-btn"
                  onClick={() => setSearchActive(true)}
                  aria-label="Open search"
                  title="Search news intelligence (Ask)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              )}
            </div>

            {/* Ask / Research Shortcut Button */}
            <Link
              to="/ask"
              className="app-header__ask-shortcut"
              title="Open Research Workspace"
            >
              <span>Ask</span>
            </Link>

            {/* User Avatar Menu */}
            {user && (
              <div className="user-menu" ref={userMenuRef}>
                <button
                  className="user-menu__trigger"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  aria-label="User account menu"
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

                {userMenuOpen && (
                  <div className="user-menu__dropdown" role="menu">
                    <div className="user-menu__info">
                      <span className="user-menu__name">{user.display_name || 'Researcher'}</span>
                      <span className="user-menu__email">{user.email}</span>
                    </div>
                    <hr className="divider" style={{ margin: '0' }} />
                    <NavLink
                      to="/profile"
                      className="user-menu__item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Account Profile
                    </NavLink>
                    <NavLink
                      to="/settings"
                      className="user-menu__item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                      Preferences &amp; Themes
                    </NavLink>
                    <hr className="divider" style={{ margin: '0' }} />
                    <button
                      className="user-menu__item"
                      role="menuitem"
                      onClick={() => { signOut(); setUserMenuOpen(false); }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Slide-out Editorial Desk Drawer */}
      {drawerOpen && (
        <div className="app-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside
            className="app-drawer"
            role="dialog"
            aria-label="Navigation Desks"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="app-drawer__header">
              <span className="app-drawer__logo">PRAMĀṆA</span>
              <button
                type="button"
                className="app-drawer__close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation drawer"
              >
                ✕
              </button>
            </div>

            <div className="app-drawer__content">
              <div className="app-drawer__section">
                <span className="app-drawer__section-title">INTELLIGENCE DESKS</span>
                <div className="app-drawer__links">
                  {PRIMARY_CATEGORIES.map((cat) => (
                    <Link
                      key={cat.label}
                      to={cat.path}
                      className="app-drawer__link"
                      onClick={() => setDrawerOpen(false)}
                    >
                      {cat.isLive && <span className="live-pulse-dot" />}
                      {cat.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="app-drawer__section">
                <span className="app-drawer__section-title">SPECIALIZED DOMAINS</span>
                <div className="app-drawer__links app-drawer__links--grid">
                  {MORE_CATEGORIES.map((cat) => (
                    <Link
                      key={cat.label}
                      to={`/explore?category=${cat.category}`}
                      className="app-drawer__link"
                      onClick={() => setDrawerOpen(false)}
                    >
                      {cat.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="app-drawer__section">
                <span className="app-drawer__section-title">RESEARCH &amp; TOOLS</span>
                <div className="app-drawer__links">
                  <Link to="/ask" className="app-drawer__link" onClick={() => setDrawerOpen(false)}>
                    <span>◈</span> Ask / Search Intelligence
                  </Link>
                  <Link to="/ask?mode=fact_check" className="app-drawer__link" onClick={() => setDrawerOpen(false)}>
                    <span>✓</span> Fact Check Verification
                  </Link>
                  <Link to="/live" className="app-drawer__link" onClick={() => setDrawerOpen(false)}>
                    <span>⚡</span> Live Wire Dispatches
                  </Link>
                </div>
              </div>

              <div className="app-drawer__section">
                <span className="app-drawer__section-title">ACCOUNT</span>
                <div className="app-drawer__links">
                  <Link to="/profile" className="app-drawer__link" onClick={() => setDrawerOpen(false)}>
                    <span>👤</span> Account Profile
                  </Link>
                  <Link to="/settings" className="app-drawer__link" onClick={() => setDrawerOpen(false)}>
                    <span>⚙</span> Settings &amp; Preferences
                  </Link>
                  <button
                    type="button"
                    className="app-drawer__link app-drawer__link--btn"
                    onClick={() => { signOut(); setDrawerOpen(false); }}
                  >
                    <span>🚪</span> Sign Out
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
