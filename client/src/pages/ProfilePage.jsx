import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../stores/authStore.js';
import '../styles/profile-settings.css';

export default function ProfilePage() {
  const { user, firebaseUser, updateProfile, fetchStats } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customAvatarUrl, setCustomAvatarUrl] = useState(user?.custom_avatar_url || '');

  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync state if user updates
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setBio(user.bio || '');
      setCustomAvatarUrl(user.custom_avatar_url || '');
    }
  }, [user]);

  // Load real account stats
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

  const handleSave = async (e) => {
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
      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = customAvatarUrl.trim() || firebaseUser?.photoURL || user?.photo_url;
  const initial = (user?.display_name || user?.email || 'U')[0].toUpperCase();

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(dateString));
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="ps-container">
      {/* Header */}
      <div className="ps-header">
        <p className="ps-header__eyebrow">Pramāṇa Intelligence Account</p>
        <h1 className="ps-header__title">Profile</h1>
        <p className="ps-header__subtitle">
          Manage your personal identity, researcher affiliation, and public display preferences.
        </p>
      </div>

      {/* Navigation tabs */}
      <nav className="ps-nav-tabs" aria-label="Account navigation">
        <Link to="/profile" className="ps-nav-tab ps-nav-tab--active" aria-current="page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Profile
        </Link>
        <Link to="/settings" className="ps-nav-tab">
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

      {/* Profile Card */}
      <div className="ps-card">
        <div className="profile-hero">
          <div className="profile-avatar-wrap">
            {currentAvatar ? (
              <img
                src={currentAvatar}
                alt={user?.display_name || 'Profile'}
                className="profile-avatar"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="profile-avatar-fallback">{initial}</div>
            )}
          </div>
          <div className="profile-meta">
            <h2 className="profile-meta__name">
              {user?.display_name || 'Anonymous Analyst'}
            </h2>
            <p className="profile-meta__email">{user?.email}</p>
            <div className="profile-meta__badges">
              <span className="badge badge--verified">
                ✓ Google Verified
              </span>
              <span className="badge" style={{ backgroundColor: '#f5f0ff', color: '#6b21a8', borderColor: '#d8c8f0' }}>
                {user?.role === 'admin' ? 'Administrator' : 'Analyst'}
              </span>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave}>
          <div className="ps-field-grid">
            <div className="ps-field">
              <label htmlFor="pf-name" className="ps-field__label">
                Display Name <span style={{ color: 'var(--color-contradicted)' }}>*</span>
              </label>
              <input
                id="pf-name"
                type="text"
                className="ps-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                placeholder="Your full name or analyst handle"
                required
              />
              <span className="ps-field__hint">
                Visible across collaborative fact-checks, reports, and team workspaces. (Max 100 characters)
              </span>
            </div>

            <div className="ps-field">
              <label htmlFor="pf-email" className="ps-field__label">
                Email Address
              </label>
              <input
                id="pf-email"
                type="email"
                className="ps-input"
                value={user?.email || ''}
                disabled
              />
              <span className="ps-field__hint">
                Supplied and verified by Google OAuth 2.0. To change this address, use your Google Account.
              </span>
            </div>

            <div className="ps-field">
              <label htmlFor="pf-bio" className="ps-field__label">
                Bio & Affiliation
              </label>
              <textarea
                id="pf-bio"
                className="ps-textarea"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                placeholder="Briefly describe your journalistic or research background, subject-matter expertise, or institutional affiliation."
              />
              <span className="ps-field__hint">
                {bio.length}/500 characters
              </span>
            </div>

            <div className="ps-field">
              <label htmlFor="pf-avatar" className="ps-field__label">
                Custom Avatar URL (Optional)
              </label>
              <input
                id="pf-avatar"
                type="url"
                className="ps-input"
                value={customAvatarUrl}
                onChange={(e) => setCustomAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
              <span className="ps-field__hint">
                Leave empty to automatically use your default Google profile photo.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving}
              >
                {saving ? 'Saving changes…' : 'Save Profile'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Real Account Statistics Card */}
      <div className="ps-card">
        <div className="ps-card__header">
          <div>
            <h3 className="ps-card__title">Account Ledger & Statistics</h3>
            <p className="ps-card__desc">Verified records associated with your Pramāṇa analyst account.</p>
          </div>
        </div>

        {loadingStats ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            Loading ledger records…
          </div>
        ) : (
          <div className="ps-stats-grid">
            <div className="ps-stat-box">
              <div className="ps-stat-box__label">Fact Checks Submitted</div>
              <div className="ps-stat-box__value">{stats?.fact_checks_submitted ?? 0}</div>
              <div className="ps-stat-box__desc">Total forensic claims investigated</div>
            </div>

            <div className="ps-stat-box">
              <div className="ps-stat-box__label">Member Since</div>
              <div className="ps-stat-box__value" style={{ fontSize: 'var(--text-base)' }}>
                {formatDate(stats?.member_since || user?.created_at)}
              </div>
              <div className="ps-stat-box__desc">Initial account enrollment</div>
            </div>

            <div className="ps-stat-box">
              <div className="ps-stat-box__label">Last Active Session</div>
              <div className="ps-stat-box__value" style={{ fontSize: 'var(--text-base)' }}>
                {formatDate(stats?.last_active || user?.last_login_at)}
              </div>
              <div className="ps-stat-box__desc">Recent authentication token</div>
            </div>

            <div className="ps-stat-box">
              <div className="ps-stat-box__label">Identity Authority</div>
              <div className="ps-stat-box__value" style={{ fontSize: 'var(--text-base)' }}>
                {stats?.auth_provider || 'Google OAuth 2.0'}
              </div>
              <div className="ps-stat-box__desc">Federated authentication</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
