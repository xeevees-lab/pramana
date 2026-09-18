import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore.js';
import { api } from '../services/api.js';
import '../styles/profile-settings.css';

export default function ProfilePage() {
  const { user, firebaseUser, updateProfile, fetchStats, signOut, deleteAccount } = useAuthStore();
  const navigate = useNavigate();

  // Profile form state
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customAvatarUrl, setCustomAvatarUrl] = useState(user?.custom_avatar_url || '');

  // Search settings sidebar filter
  const [settingsFilter, setSettingsFilter] = useState('');

  // Account stats
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Form feedback
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Modal dialog state for destructive actions
  const [activeModal, setActiveModal] = useState(null); // 'logout_all' | 'clear_history' | 'delete_account' | null
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setBio(user.bio || '');
      setCustomAvatarUrl(user.custom_avatar_url || '');
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function loadStats() {
      try {
        const data = await fetchStats();
        if (mounted) {
          setStats(data);
          setLoadingStats(false);
        }
      } catch (err) {
        if (mounted) setLoadingStats(false);
      }
    }
    loadStats();
    return () => { mounted = false; };
  }, [fetchStats]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!displayName.trim()) {
      setErrorMsg('Display name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        custom_avatar_url: customAvatarUrl.trim() || null,
      });
      setSuccessMsg('Account profile updated successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  // 1. Logout of all devices action
  const handleLogoutAll = async () => {
    setModalLoading(true);
    setModalError('');
    try {
      await signOut();
      setActiveModal(null);
      navigate('/');
    } catch (err) {
      setModalError(err.message || 'Failed to sign out of all devices.');
      setModalLoading(false);
    }
  };

  // 2. Clear all research history action
  const handleClearHistory = async () => {
    setModalLoading(true);
    setModalError('');
    try {
      await api.delete('/ask/conversations');
      setActiveModal(null);
      setSuccessMsg('All research history and saved conversations have been cleared.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setModalError(err.message || 'Failed to clear research history.');
    } finally {
      setModalLoading(false);
    }
  };

  // 3. Delete account action (requires explicit 'DELETE')
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== 'DELETE') {
      setModalError('Please type DELETE in capital letters to confirm.');
      return;
    }

    setModalLoading(true);
    setModalError('');
    try {
      await deleteAccount();
      setActiveModal(null);
      navigate('/');
    } catch (err) {
      setModalError(err.message || 'Failed to delete account.');
      setModalLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Active';
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
      }).format(new Date(dateString));
    } catch (e) {
      return dateString;
    }
  };

  const currentAvatar = customAvatarUrl.trim() || firebaseUser?.photoURL || user?.photo_url;
  const initial = (displayName || user?.email || 'U')[0].toUpperCase();

  return (
    <div className="ps-split-layout">
      {/* Wireframe 2.3 Left Sidebar: Settings Navigation */}
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
          <Link to="/settings" className="ps-sidebar__nav-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Preferences</span>
          </Link>

          <Link to="/profile" className="ps-sidebar__nav-item ps-sidebar__nav-item--active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Account</span>
          </Link>
        </nav>
      </aside>

      {/* Main Account Content Area */}
      <main className="ps-main-panel">
        <div className="ps-header">
          <p className="ps-header__eyebrow">IDENTITY &amp; AUTHENTICATION</p>
          <h1 className="ps-header__title">Account Profile</h1>
          <p className="ps-header__subtitle">
            Manage your researcher identity, public affiliations, and account security.
          </p>
        </div>

        {successMsg && <div className="alert alert--success" style={{ marginBottom: '1.5rem' }}>{successMsg}</div>}
        {errorMsg && <div className="alert alert--error" style={{ marginBottom: '1.5rem' }}>{errorMsg}</div>}

        {/* ========================================================
            WIREFRAME 2.3: USER PROFILE DETAILS
           ======================================================== */}
        <section className="ps-card" aria-labelledby="profile-info-heading">
          <div className="ps-card__header">
            <div>
              <h2 id="profile-info-heading" className="ps-card__title">Researcher Profile</h2>
              <p className="ps-card__desc">Your identity visible on research notes and verification dossiers.</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave}>
            {/* Avatar Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="ps-avatar-lg">
                {currentAvatar ? (
                  <img
                    src={currentAvatar}
                    alt={displayName || 'User'}
                    className="ps-avatar-lg__img"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="ps-avatar-lg__fallback">{initial}</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" htmlFor="avatar-url-input">Custom Avatar Image URL</label>
                <input
                  id="avatar-url-input"
                  type="url"
                  className="form-input"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
                <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>
                  Paste a direct link to any PNG or JPG avatar, or leave empty to use Google profile picture.
                </span>
              </div>
            </div>

            {/* Name and Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="display-name-input">Full Name</label>
                <input
                  id="display-name-input"
                  type="text"
                  className="form-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="email-input">Email Address</label>
                <input
                  id="email-input"
                  type="email"
                  className="form-input"
                  value={user?.email || ''}
                  disabled
                  style={{ background: 'var(--color-surface-secondary, #F9FAFB)', color: '#6B7280' }}
                />
              </div>
            </div>

            {/* Researcher Bio */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="bio-input">Researcher Bio / Focus Areas</label>
              <textarea
                id="bio-input"
                className="form-input"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="e.g. Geopolitical risk analyst focusing on South Asia and emerging technologies..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving}
                style={{ minWidth: '140px' }}
              >
                {saving ? 'Updating...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>

        {/* ========================================================
            ACCOUNT METRICS & STATUS
           ======================================================== */}
        <section className="ps-card" aria-labelledby="status-heading">
          <div className="ps-card__header">
            <div>
              <h2 id="status-heading" className="ps-card__title">Account Information &amp; Stats</h2>
              <p className="ps-card__desc">Current subscription level, session metadata, and research activity.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="ps-metric-card">
              <span className="ps-metric-card__value">
                {loadingStats ? '—' : stats?.conversationsCount ?? 0}
              </span>
              <span className="ps-metric-card__label">Research Threads</span>
            </div>

            <div className="ps-metric-card">
              <span className="ps-metric-card__value">
                {loadingStats ? '—' : stats?.eventsViewedCount ?? 'Active'}
              </span>
              <span className="ps-metric-card__label">Living Events Tracked</span>
            </div>

            <div className="ps-metric-card">
              <span className="ps-metric-card__value" style={{ color: '#16A34A' }}>
                Verified
              </span>
              <span className="ps-metric-card__label">Account Tier</span>
            </div>
          </div>

          <div style={{ fontSize: '0.8125rem', color: '#6B7280', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>Member since: <strong>{formatDate(user?.created_at)}</strong></span>
            <span>Authentication: <strong>Google OAuth (Firebase)</strong></span>
            <span>Session: <strong>Encrypted JWT Cookie</strong></span>
          </div>
        </section>

        {/* ========================================================
            WIREFRAME 2.3: DESTRUCTIVE ACTIONS (WITH CONFIRMATION DIALOGS)
           ======================================================== */}
        <section className="ps-card ps-card--danger" aria-labelledby="danger-heading">
          <div className="ps-card__header">
            <div>
              <h2 id="danger-heading" className="ps-card__title" style={{ color: '#DC2626' }}>
                Account Actions &amp; Danger Zone
              </h2>
              <p className="ps-card__desc">
                Session termination, research history purge, and permanent account deletion.
              </p>
            </div>
          </div>

          <div className="ps-danger-actions-list">
            {/* 1. Log out of current session */}
            <div className="ps-danger-row">
              <div>
                <span className="ps-danger-row__title">Sign Out</span>
                <p className="ps-danger-row__desc">Sign out of the current browser session.</p>
              </div>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={signOut}
              >
                Sign Out
              </button>
            </div>

            {/* 2. Log out of all devices (Wireframe 2.3) */}
            <div className="ps-danger-row">
              <div>
                <span className="ps-danger-row__title">Log Out of All Devices</span>
                <p className="ps-danger-row__desc">Invalidates active tokens and logs out all existing browser sessions.</p>
              </div>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setActiveModal('logout_all')}
              >
                Log Out All
              </button>
            </div>

            {/* 3. Delete Chat / History (Wireframe 2.3) */}
            <div className="ps-danger-row">
              <div>
                <span className="ps-danger-row__title">Clear Research History</span>
                <p className="ps-danger-row__desc">Permanently remove all previous research threads, questions, and notes.</p>
              </div>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ color: '#D97706', borderColor: '#FDE68A' }}
                onClick={() => setActiveModal('clear_history')}
              >
                Clear History
              </button>
            </div>

            {/* 4. Delete Account (Wireframe 2.3) */}
            <div className="ps-danger-row">
              <div>
                <span className="ps-danger-row__title" style={{ color: '#DC2626' }}>Delete Account</span>
                <p className="ps-danger-row__desc">
                  Permanently delete your PRAMĀṆA profile and all associated data. This action cannot be reversed.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  setDeleteConfirmText('');
                  setModalError('');
                  setActiveModal('delete_account');
                }}
              >
                Delete Account
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================
          CONFIRMATION MODALS FOR DESTRUCTIVE ACTIONS
         ======================================================== */}
      {activeModal && (
        <div className="ps-modal-backdrop" onClick={() => !modalLoading && setActiveModal(null)}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {activeModal === 'logout_all' && (
              <>
                <h3 className="ps-modal__title">Log Out of All Devices?</h3>
                <p className="ps-modal__desc">
                  This will immediately invalidate your active sessions on all browsers and devices. You will need to sign in again.
                </p>
                {modalError && <div className="alert alert--error">{modalError}</div>}
                <div className="ps-modal__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={modalLoading}
                    onClick={() => setActiveModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={modalLoading}
                    onClick={handleLogoutAll}
                  >
                    {modalLoading ? 'Logging out...' : 'Confirm Log Out All'}
                  </button>
                </div>
              </>
            )}

            {activeModal === 'clear_history' && (
              <>
                <h3 className="ps-modal__title">Clear All Research History?</h3>
                <p className="ps-modal__desc">
                  Are you sure you want to permanently clear all your saved research threads and conversations? This cannot be undone.
                </p>
                {modalError && <div className="alert alert--error">{modalError}</div>}
                <div className="ps-modal__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={modalLoading}
                    onClick={() => setActiveModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={modalLoading}
                    onClick={handleClearHistory}
                  >
                    {modalLoading ? 'Clearing...' : 'Clear All History'}
                  </button>
                </div>
              </>
            )}

            {activeModal === 'delete_account' && (
              <>
                <h3 className="ps-modal__title" style={{ color: '#DC2626' }}>
                  Permanently Delete Account?
                </h3>
                <p className="ps-modal__desc">
                  This action is irreversible. All your profile data, research threads, and preferences will be permanently wiped.
                </p>
                <div style={{ margin: '1rem 0' }}>
                  <label className="form-label" htmlFor="delete-confirm-input">
                    Type <strong>DELETE</strong> in all caps to confirm:
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    className="form-input"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    autoFocus
                  />
                </div>
                {modalError && <div className="alert alert--error">{modalError}</div>}
                <div className="ps-modal__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={modalLoading}
                    onClick={() => setActiveModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={modalLoading || deleteConfirmText.trim() !== 'DELETE'}
                    onClick={handleDeleteAccount}
                  >
                    {modalLoading ? 'Deleting...' : 'Delete Account Forever'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
