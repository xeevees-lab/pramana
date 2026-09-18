import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore.js';
import '../styles/profile-settings.css';

export default function SettingsPage() {
  const { user, fetchSettings, updateSettings } = useAuthStore();

  // Search settings filter
  const [settingsFilter, setSettingsFilter] = useState('');

  // Theme & Appearance state
  const [theme, setTheme] = useState(() => localStorage.getItem('pramana_theme') || 'system');
  const [chatFont, setChatFont] = useState(() => localStorage.getItem('pramana_chat_font') || 'sans');

  // AI & Research Form state
  const [aiModel, setAiModel] = useState(user?.settings?.ai?.model || 'gemini-2.5-flash');
  const [temperature, setTemperature] = useState(user?.settings?.ai?.temperature ?? 0.3);
  const [researchDepth, setResearchDepth] = useState(user?.settings?.research?.research_depth || 'standard');
  const [responseDepth, setResponseDepth] = useState(user?.settings?.research?.response_depth || 'detailed');
  const [citationStyle, setCitationStyle] = useState(user?.settings?.research?.citation_style || 'inline');
  const [saveHistory, setSaveHistory] = useState(user?.settings?.privacy?.save_search_history ?? true);
  const [analyticsOptIn, setAnalyticsOptIn] = useState(user?.settings?.privacy?.analytics_opt_in ?? false);

  const [availableModels, setAvailableModels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Apply theme immediately
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('pramana_theme', newTheme);
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  };

  // Apply font immediately
  const handleFontChange = (newFont) => {
    setChatFont(newFont);
    localStorage.setItem('pramana_chat_font', newFont);
    document.documentElement.setAttribute('data-chat-font', newFont);
  };

  // Load server settings & available models
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const data = await fetchSettings();
        if (mounted && data) {
          if (data.system?.available_models) {
            setAvailableModels(data.system.available_models);
          }
          if (data.settings) {
            setAiModel(data.settings.ai?.model || 'gemini-2.5-flash');
            setTemperature(data.settings.ai?.temperature ?? 0.3);
            setResearchDepth(data.settings.research?.research_depth || 'standard');
            setResponseDepth(data.settings.research?.response_depth || 'detailed');
            setCitationStyle(data.settings.research?.citation_style || 'inline');
            setSaveHistory(data.settings.privacy?.save_search_history ?? true);
            setAnalyticsOptIn(data.settings.privacy?.analytics_opt_in ?? false);
          }
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [fetchSettings]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      await updateSettings({
        appearance: {
          theme,
          chat_font: chatFont,
        },
        ai: {
          provider: 'gemini',
          model: aiModel,
          temperature: parseFloat(temperature),
        },
        research: {
          research_depth: researchDepth,
          response_depth: responseDepth,
          citation_style: citationStyle,
        },
        privacy: {
          save_search_history: saveHistory,
          analytics_opt_in: analyticsOptIn,
        },
      });

      setSuccessMsg('Preferences saved and synchronized across your PRAMĀṆA profile.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const matchesFilter = (text) => {
    if (!settingsFilter.trim()) return true;
    return text.toLowerCase().includes(settingsFilter.toLowerCase());
  };

  return (
    <div className="ps-split-layout">
      {/* Wireframe 2.2 Left Sidebar: Settings Navigation */}
      <aside className="ps-sidebar" aria-label="Settings navigation">
        <div className="ps-sidebar__title-block">
          <h2 className="ps-sidebar__main-title">Settings</h2>
          <span className="ps-sidebar__sub-title">System &amp; Workspace</span>
        </div>

        {/* Search setting filter */}
        <div className="ps-sidebar__search-wrap">
          <svg className="ps-sidebar__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Search settings..."
            value={settingsFilter}
            onChange={(e) => setSettingsFilter(e.target.value)}
            className="ps-sidebar__search-input"
            aria-label="Search settings"
          />
        </div>

        {/* Sidebar Nav Items (Preferences & Account) */}
        <nav className="ps-sidebar__nav">
          <Link to="/settings" className="ps-sidebar__nav-item ps-sidebar__nav-item--active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Preferences</span>
          </Link>

          <Link to="/profile" className="ps-sidebar__nav-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Account</span>
          </Link>
        </nav>
      </aside>

      {/* Main Preferences Content Area */}
      <main className="ps-main-panel">
        <div className="ps-header">
          <p className="ps-header__eyebrow">WORKSPACE &amp; RESEARCH CONTROLS</p>
          <h1 className="ps-header__title">Preferences</h1>
          <p className="ps-header__subtitle">
            Configure appearance, reading typography, intelligence model parameters, and privacy defaults.
          </p>
        </div>

        {successMsg && <div className="alert alert--success" style={{ marginBottom: '1.5rem' }}>{successMsg}</div>}
        {errorMsg && <div className="alert alert--error" style={{ marginBottom: '1.5rem' }}>{errorMsg}</div>}

        <form onSubmit={handleSaveSettings}>
          {/* ========================================================
              WIREFRAME 2.2: APPEARANCE (THEME: LIGHT / DARK / SYSTEM)
             ======================================================== */}
          {matchesFilter('theme appearance color dark light system') && (
            <section className="ps-card" aria-labelledby="theme-heading">
              <div className="ps-card__header">
                <div>
                  <h2 id="theme-heading" className="ps-card__title">Appearance &amp; Theme</h2>
                  <p className="ps-card__desc">Choose your preferred visual mode. Changes take effect immediately.</p>
                </div>
              </div>

              <div className="ps-tiles-grid">
                {/* Light Mode Tile */}
                <button
                  type="button"
                  className={`ps-theme-tile ${theme === 'light' ? 'ps-theme-tile--active' : ''}`}
                  onClick={() => handleThemeChange('light')}
                >
                  <div className="ps-theme-tile__preview ps-theme-tile__preview--light">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/>
                      <line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/>
                      <line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  </div>
                  <span className="ps-theme-tile__label">Light</span>
                  <span className="ps-theme-tile__sub">Editorial bright</span>
                </button>

                {/* Dark Mode Tile */}
                <button
                  type="button"
                  className={`ps-theme-tile ${theme === 'dark' ? 'ps-theme-tile--active' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                >
                  <div className="ps-theme-tile__preview ps-theme-tile__preview--dark">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  </div>
                  <span className="ps-theme-tile__label">Dark</span>
                  <span className="ps-theme-tile__sub">Slate intelligence</span>
                </button>

                {/* System Mode Tile */}
                <button
                  type="button"
                  className={`ps-theme-tile ${theme === 'system' ? 'ps-theme-tile--active' : ''}`}
                  onClick={() => handleThemeChange('system')}
                >
                  <div className="ps-theme-tile__preview ps-theme-tile__preview--system">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/>
                      <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                  </div>
                  <span className="ps-theme-tile__label">System</span>
                  <span className="ps-theme-tile__sub">Match OS preference</span>
                </button>
              </div>
            </section>
          )}

          {/* ========================================================
              WIREFRAME 2.2: CHAT & READING FONT
             ======================================================== */}
          {matchesFilter('font typography reading chat serif mono') && (
            <section className="ps-card" aria-labelledby="font-heading">
              <div className="ps-card__header">
                <div>
                  <h2 id="font-heading" className="ps-card__title">Chat &amp; Reading Font</h2>
                  <p className="ps-card__desc">Choose the typography for reading news reports and research dossiers.</p>
                </div>
              </div>

              <div className="ps-tiles-grid">
                {/* Sans-serif */}
                <button
                  type="button"
                  className={`ps-font-tile ${chatFont === 'sans' ? 'ps-font-tile--active' : ''}`}
                  onClick={() => handleFontChange('sans')}
                >
                  <div className="ps-font-tile__sample" style={{ fontFamily: 'var(--font-sans)' }}>
                    Aa
                  </div>
                  <span className="ps-font-tile__name">Sans-serif</span>
                  <span className="ps-font-tile__sub">Inter (Modern &amp; Clean)</span>
                </button>

                {/* Serif */}
                <button
                  type="button"
                  className={`ps-font-tile ${chatFont === 'serif' ? 'ps-font-tile--active' : ''}`}
                  onClick={() => handleFontChange('serif')}
                >
                  <div className="ps-font-tile__sample" style={{ fontFamily: 'var(--font-serif)' }}>
                    Aa
                  </div>
                  <span className="ps-font-tile__name">Serif</span>
                  <span className="ps-font-tile__sub">Source Serif 4 (Editorial)</span>
                </button>

                {/* Monospace */}
                <button
                  type="button"
                  className={`ps-font-tile ${chatFont === 'mono' ? 'ps-font-tile--active' : ''}`}
                  onClick={() => handleFontChange('mono')}
                >
                  <div className="ps-font-tile__sample" style={{ fontFamily: 'var(--font-mono)' }}>
                    {'{ }'}
                  </div>
                  <span className="ps-font-tile__name">Monospace</span>
                  <span className="ps-font-tile__sub">JetBrains Mono (Technical)</span>
                </button>
              </div>
            </section>
          )}

          {/* ========================================================
              WIREFRAME 2.2: AI MODEL & RESEARCH CONTROLS
             ======================================================== */}
          {matchesFilter('model ai temperature gemini research depth') && (
            <section className="ps-card" aria-labelledby="ai-heading">
              <div className="ps-card__header">
                <div>
                  <h2 id="ai-heading" className="ps-card__title">AI Intelligence Model</h2>
                  <p className="ps-card__desc">Select default model routing and reasoning parameters for research queries.</p>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="ai-model-select">Primary Reasoning Model</label>
                <select
                  id="ai-model-select"
                  className="form-input"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map((m) => (
                      <option key={m.id || m} value={m.id || m}>
                        {m.name || m}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Balanced speed &amp; synthesis)</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast dispatches)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Deep contextual reasoning)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="form-label" htmlFor="temperature-slider" style={{ margin: 0 }}>
                    Temperature (Determinism vs Creativity)
                  </label>
                  <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                    {temperature}
                  </span>
                </div>
                <input
                  id="temperature-slider"
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#9CA3AF' }}>
                  <span>0.0 (Strictly factual)</span>
                  <span>1.0 (Exploratory)</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="research-depth">Research Depth</label>
                  <select
                    id="research-depth"
                    className="form-input"
                    value={researchDepth}
                    onChange={(e) => setResearchDepth(e.target.value)}
                  >
                    <option value="quick">Quick (Top 3-5 sources)</option>
                    <option value="standard">Standard (Comprehensive synthesis)</option>
                    <option value="deep">Deep (Exhaustive graph &amp; causal traversal)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="response-depth">Response Detail</label>
                  <select
                    id="response-depth"
                    className="form-input"
                    value={responseDepth}
                    onChange={(e) => setResponseDepth(e.target.value)}
                  >
                    <option value="concise">Concise (Executive summary)</option>
                    <option value="detailed">Detailed (Standard reporting)</option>
                    <option value="exhaustive">Exhaustive (Full multi-lane evidence)</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* ========================================================
              WIREFRAME 2.2: PRIVACY & HISTORY
             ======================================================== */}
          {matchesFilter('privacy history save analytics search') && (
            <section className="ps-card" aria-labelledby="privacy-heading">
              <div className="ps-card__header">
                <div>
                  <h2 id="privacy-heading" className="ps-card__title">Privacy &amp; History</h2>
                  <p className="ps-card__desc">Manage research thread retention and anonymous telemetry.</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={saveHistory}
                    onChange={(e) => setSaveHistory(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-ink)' }}>
                      Save Search &amp; Research History
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-secondary)', margin: 0 }}>
                      When enabled, your queries and synthesis threads appear in your Recents list.
                    </p>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={analyticsOptIn}
                    onChange={(e) => setAnalyticsOptIn(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-ink)' }}>
                      Anonymous Performance Telemetry
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-secondary)', margin: 0 }}>
                      Help improve verification accuracy by sharing anonymized latency metrics.
                    </p>
                  </div>
                </label>
              </div>
            </section>
          )}

          {/* Submit Action */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={saving}
              style={{ minWidth: '160px' }}
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
