import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">404</div>
      <h1 className="empty-state__title">Page Not Found</h1>
      <p className="empty-state__text">
        The page you're looking for doesn't exist.
      </p>
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Link to="/" className="btn btn--primary">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
