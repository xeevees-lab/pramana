import useAuthStore from '../stores/authStore.js';

export default function LoginPage() {
  const { signIn, loading, error, isConfigured } = useAuthStore();

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <h1 className="login-card__logo">PRAMĀṆA</h1>
          <p className="login-card__tagline">
            Global News Intelligence
          </p>
        </div>

        <div className="login-card__body">
          <p className="login-card__description">
            Real-time news verification, context analysis, narrative intelligence, and forecasting.
          </p>

          {!isConfigured && (
            <div className="login-card__notice">
              <p className="login-card__notice-title">Authentication Not Configured</p>
              <p className="login-card__notice-text">
                Firebase credentials are not set. To enable Google sign-in, add your Firebase
                configuration to the <code>.env</code> file. See <code>SETUP.md</code> for details.
              </p>
            </div>
          )}

          {error && (
            <div className="login-card__error" role="alert">
              <p>{error}</p>
            </div>
          )}

          <button
            className="login-card__google-btn"
            onClick={signIn}
            disabled={loading || !isConfigured}
            aria-label="Sign in with Google"
          >
            <svg className="login-card__google-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {loading ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>

        <div className="login-card__footer">
          <p>By signing in, you agree to the PRAMĀṆA terms of service.</p>
        </div>
      </div>
    </div>
  );
}
