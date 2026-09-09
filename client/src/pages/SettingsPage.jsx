import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore.js';
import '../styles/profile-settings.css';

export default function SettingsPage() {
  const { user, fetchSettings, updateSettings, signOut, deleteAccount } = useAuthStore();
  const navigate = useNavigate();

  // Settings form state
  const [aiModel, setAiModel] = useState(user?.settings?.ai?.model || 'gemini-2.5-flash');
  const [temperature, setTemperature] = useState(user?.settings?.ai?.temperature ?? 0.3);
  const [researchDepth, setResearchDepth] = useState(user?.settings?.research?.research_depth || 'standard');
  const [responseDepth, setResponseDepth] = useState(user?.settings?.research?.response_depth || 'detailed');
  const [citationStyle, setCitationStyle] = useState(user?.settings?.research?.citation_style || 'inline');
  const [saveHistory, setSaveHistory] = useState(user?.settings?.privacy?.save_search_history ?? true);
  const [analyticsOptIn, setAnalyticsOptIn] = useState(user?.settings?.privacy?.analytics_opt_in ?? false);

  const [availableModels, setAvailableModels] = useState([]);
  const [systemInfo, setSystemInfo] = useState(null);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Load server settings & capabilities
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const data = await fetchSettings();
        if (mounted && data) {
          if (data.system) {
            setSystemInfo(data.system);
            setAvailableModels(data.system.available_models || []);
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

      setSuccessMsg('Settings saved successfully and synchronized with your account.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmInput.trim() !== 'DELETE') {
      setDeleteError('Please type DELETE exactly to proceed.');
      return;
    }

    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="ps-container">
      {/* Header */}
      <div className="ps-header">
        <p className="ps-header__eyebrow">Pramāṇa Preferences</p>
        <h1 className="ps-header__title">Settings</h1>
        <p className="ps-header__subtitle">
          Configure real-time intelligence models, research depth, output styling, and privacy controls.
        </p>
      </div>

      {/* Navigation tabs */}
      <nav className="ps-nav-tabs" aria-label="Account navigation">
        <Link to="/profile" className="ps-nav-tab">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Profile
        </Link>
        <Link to="/settings" className="ps-nav-tab ps-nav-tab--active" aria-current="page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </Link>
      </nav>

      {/* Alerts */}
      {successMsg && (
        <div className="ps-alert ps-alert--success" role="status">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}
      {errorMsg && (
        <div className="ps-alert ps-alert--error" role="alert">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <form onSubmit={handleSaveSettings}>
        {/* Section 1: Account Overview */}
        <div className="ps-card">
          <div className="ps-card__header">
            <div>
              <h2 className="ps-card__title">Account Identity</h2>
              <p className="ps-card__desc">Your current analyst credentials and authentication provider.</p>
            </div>
            <Link to="/profile" className="btn btn--secondary" style={{ fontSize: 'var(--text-xs)' }}>
              Edit Profile →
            </Link>
          </div>

          <div className="ps-field-grid">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0' }}>
              <div>
                <strong style={{ fontSize: 'var(--text-sm)' }}>{user?.display_name || 'User'}</strong>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>{user?.email}</p>
              </div>
              <span className="badge badge--verified">
                Active Session
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: AI Engine Configuration */}
        <div className="ps-card">
          <div className="ps-card__header">
            <div>
              <h2 className="ps-card__title">AI Engine & Synthesis Model</h2>
              <p className="ps-card__desc">Choose the foundation model powering real-time event synthesis and claim corroboration.</p>
            </div>
            <span className="badge" style={{ backgroundColor: '#e8f5e9', color: '#1a7d37', borderColor: '#c8e6c9' }}>
              ● Gemini Live
            </span>
          </div>

          <div className="ps-field-grid">
            <div className="ps-field">
              <span className="ps-field__label">Active AI Provider</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink)' }}>
                  Google Gemini (Official Cloud API)
                </strong>
                <span className="badge" style={{ fontSize: '10px' }}>
                  {systemInfo?.gemini_configured ? 'Key Verified' : 'Standard'}
                </span>
              </div>
              <span className="ps-field__hint">
                Fully operational for embeddings and narrative extraction. Local models (Ollama) remain scheduled for a future release.
              </span>
            </div>

            <div className="ps-field">
              <span className="ps-field__label">Synthesis Model Selection</span>
              <div className="ps-choice-group">
                <div
                  className={`ps-choice-card ${aiModel === 'gemini-2.5-flash' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setAiModel('gemini-2.5-flash')}
                  role="radio"
                  aria-checked={aiModel === 'gemini-2.5-flash'}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setAiModel('gemini-2.5-flash'); }}
                >
                  <div className="ps-choice-card__title">
                    <span>Gemini 2.5 Flash</span>
                    <span className="badge badge--verified" style={{ fontSize: '10px' }}>Default</span>
                  </div>
                  <p className="ps-choice-card__desc">
                    High throughput, sub-second latency. Optimized for continuous wire ingestion and high-velocity event clustering.
                  </p>
                </div>

                <div
                  className={`ps-choice-card ${aiModel === 'gemini-2.5-pro' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setAiModel('gemini-2.5-pro')}
                  role="radio"
                  aria-checked={aiModel === 'gemini-2.5-pro'}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setAiModel('gemini-2.5-pro'); }}
                >
                  <div className="ps-choice-card__title">
                    <span>Gemini 2.5 Pro</span>
                    <span className="badge" style={{ fontSize: '10px', backgroundColor: '#f5f0ff', color: '#6b21a8' }}>Deep Reasoning</span>
                  </div>
                  <p className="ps-choice-card__desc">
                    Advanced reasoning capabilities for forensic discrepancy detection, multi-source contradiction tracing, and complex dossiers.
                  </p>
                </div>
              </div>
            </div>

            <div className="ps-field">
              <label htmlFor="st-temp" className="ps-field__label">
                Synthesis Temperature: {temperature}
              </label>
              <input
                id="st-temp"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', maxWidth: '320px', accentColor: 'var(--color-accent)' }}
              />
              <span className="ps-field__hint">
                Lower values (0.1–0.3) provide strict, deterministic factual accuracy. Higher values allow broader narrative exploration.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Research & Output Preferences */}
        <div className="ps-card">
          <div className="ps-card__header">
            <div>
              <h2 className="ps-card__title">Research & Dossier Preferences</h2>
              <p className="ps-card__desc">Tailor how intelligence dossiers and fact-check responses are formatted.</p>
            </div>
          </div>

          <div className="ps-field-grid">
            <div className="ps-field">
              <span className="ps-field__label">Corroboration Depth</span>
              <div className="ps-choice-group">
                <div
                  className={`ps-choice-card ${researchDepth === 'standard' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setResearchDepth('standard')}
                  role="radio"
                  aria-checked={researchDepth === 'standard'}
                  tabIndex={0}
                >
                  <div className="ps-choice-card__title">Standard News Synthesis</div>
                  <p className="ps-choice-card__desc">
                    Reconciles primary wire feeds and reports core verified facts quickly.
                  </p>
                </div>

                <div
                  className={`ps-choice-card ${researchDepth === 'deep' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setResearchDepth('deep')}
                  role="radio"
                  aria-checked={researchDepth === 'deep'}
                  tabIndex={0}
                >
                  <div className="ps-choice-card__title">Deep Triangulation</div>
                  <p className="ps-choice-card__desc">
                    Cross-references GDELT geopolitical events, knowledge graph relations, and corroborating citations.
                  </p>
                </div>
              </div>
            </div>

            <div className="ps-field">
              <span className="ps-field__label">Response Form Factor</span>
              <div className="ps-choice-group">
                <div
                  className={`ps-choice-card ${responseDepth === 'detailed' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setResponseDepth('detailed')}
                  role="radio"
                  aria-checked={responseDepth === 'detailed'}
                  tabIndex={0}
                >
                  <div className="ps-choice-card__title">Comprehensive Dossier</div>
                  <p className="ps-choice-card__desc">
                    Complete multi-perspective breakdown including timelines, source reliability, and narrative actors.
                  </p>
                </div>

                <div
                  className={`ps-choice-card ${responseDepth === 'concise' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setResponseDepth('concise')}
                  role="radio"
                  aria-checked={responseDepth === 'concise'}
                  tabIndex={0}
                >
                  <div className="ps-choice-card__title">Executive Brief</div>
                  <p className="ps-choice-card__desc">
                    High-level factual conclusions, key verified claims, and immediate takeaways in bullet form.
                  </p>
                </div>
              </div>
            </div>

            <div className="ps-field">
              <span className="ps-field__label">Citation Display Format</span>
              <div className="ps-choice-group">
                <div
                  className={`ps-choice-card ${citationStyle === 'inline' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setCitationStyle('inline')}
                  role="radio"
                  aria-checked={citationStyle === 'inline'}
                  tabIndex={0}
                >
                  <div className="ps-choice-card__title">Inline Citations</div>
                  <p className="ps-choice-card__desc">
                    Displays [Source: Reuters, 92%] directly alongside claims in paragraphs.
                  </p>
                </div>

                <div
                  className={`ps-choice-card ${citationStyle === 'footnote' ? 'ps-choice-card--active' : ''}`}
                  onClick={() => setCitationStyle('footnote')}
                  role="radio"
                  aria-checked={citationStyle === 'footnote'}
                  tabIndex={0}
                >
                  <div className="ps-choice-card__title">Footnote Ledger</div>
                  <p className="ps-choice-card__desc">
                    Collects all corroborating evidence at the bottom in a structured evidence ledger.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Privacy Controls */}
        <div className="ps-card">
          <div className="ps-card__header">
            <div>
              <h2 className="ps-card__title">Privacy & Data Governance</h2>
              <p className="ps-card__desc">Control what analytical session history is stored with your analyst identity.</p>
            </div>
          </div>

          <div className="ps-toggle-row">
            <div className="ps-toggle-info">
              <div className="ps-toggle-title">Save Investigation & Search History</div>
              <p className="ps-toggle-desc">
                When enabled, your query queries and fact-check inquiries are saved for quick retrieval across devices.
              </p>
            </div>
            <label className="ps-switch" aria-label="Save Search History">
              <input
                type="checkbox"
                checked={saveHistory}
                onChange={(e) => setSaveHistory(e.target.checked)}
              />
              <span className="ps-slider" />
            </label>
          </div>

          <div className="ps-toggle-row">
            <div className="ps-toggle-info">
              <div className="ps-toggle-title">Anonymous Performance Telemetry</div>
              <p className="ps-toggle-desc">
                Share anonymized latency and query response metrics to help calibrate AI hallucination filters.
              </p>
            </div>
            <label className="ps-switch" aria-label="Anonymous Telemetry">
              <input
                type="checkbox"
                checked={analyticsOptIn}
                onChange={(e) => setAnalyticsOptIn(e.target.checked)}
              />
              <span className="ps-slider" />
            </label>
          </div>
        </div>

        {/* Save Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-6)' }}>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saving}
            style={{ minWidth: '160px', justifyContent: 'center' }}
          >
            {saving ? 'Saving changes…' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Section 5: Security & Session */}
      <div className="ps-card">
        <div className="ps-card__header">
          <div>
            <h2 className="ps-card__title">Security & Active Sessions</h2>
            <p className="ps-card__desc">Manage your authentication session and sign-out controls.</p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-ink)' }}>
              Signed in via Google OAuth
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-secondary)' }}>
              Identity: {user?.email} • Token verified on server
            </p>
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => signOut()}
          >
            Sign out of all sessions
          </button>
        </div>
      </div>

      {/* Section 6: Danger Zone — Account Deletion */}
      <div className="ps-card ps-card--danger">
        <div className="ps-card__header" style={{ borderBottomColor: '#fecaca' }}>
          <div>
            <h2 className="ps-card__title">Danger Zone</h2>
            <p className="ps-card__desc">Irreversible actions regarding your Pramāṇa analyst account.</p>
          </div>
        </div>

        <div className="ps-danger-box">
          <div className="ps-danger-text">
            <h4>Delete Account & Erase Analyst Records</h4>
            <p>
              Permanently deletes your account record, custom settings, and personal fact-check inquiries. This action is immediate and cannot be undone.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              setConfirmInput('');
              setDeleteError('');
              setShowDeleteModal(true);
            }}
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Deletion Confirmation Modal */}
      {showDeleteModal && (
        <div className="ps-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-del-title">
          <div className="ps-modal">
            <h3 id="modal-del-title" className="ps-modal__title">Confirm Account Deletion</h3>
            <p className="ps-modal__desc">
              This will permanently delete your analyst profile (<strong>{user?.email}</strong>), your custom preferences, and your submitted investigative claims from the database.
            </p>

            <div className="ps-field" style={{ marginBottom: 'var(--space-4)' }}>
              <label htmlFor="confirm-del-input" className="ps-field__label">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                id="confirm-del-input"
                type="text"
                className="ps-input"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </div>

            {deleteError && (
              <div className="ps-alert ps-alert--error" style={{ marginBottom: 'var(--space-3)' }}>
                {deleteError}
              </div>
            )}

            <div className="ps-modal__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleDeleteAccount}
                disabled={confirmInput.trim() !== 'DELETE' || deleting}
              >
                {deleting ? 'Deleting account…' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
