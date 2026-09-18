import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer__container">
        {/* Top Brand & Links Bar */}
        <div className="app-footer__main">
          <div className="app-footer__brand">
            <Link to="/explore" className="app-footer__logo-mark" aria-label="PRAMĀṆA Intelligence">
              PRAMĀṆA
            </Link>
            <p className="app-footer__tagline">
              Global News Intelligence, Multi-Source Corroboration &amp; Living Research Graph.
            </p>
          </div>

          <nav className="app-footer__nav" aria-label="Footer Navigation">
            <Link to="/explore" className="app-footer__link">About</Link>
            <Link to="/explore?category=news" className="app-footer__link">News</Link>
            <Link to="/ask" className="app-footer__link">Research</Link>
            <a href="/api/sources" target="_blank" rel="noopener noreferrer" className="app-footer__link">Sources</a>
            <Link to="/ask?mode=fact_check" className="app-footer__link">Methodology</Link>
            <Link to="/profile" className="app-footer__link">Contact</Link>
            <Link to="/settings" className="app-footer__link">Privacy</Link>
            <Link to="/settings" className="app-footer__link">Terms</Link>
          </nav>
        </div>

        {/* Bottom Metadata & Social */}
        <div className="app-footer__bottom">
          <div className="app-footer__copyright">
            &copy; {new Date().getFullYear()} PRAMĀṆA Intelligence Platform. Analytical, transparent, and multi-source corroborated.
          </div>

          <div className="app-footer__social-links" aria-label="Intelligence channels">
            {/* WhatsApp */}
            <a href="https://whatsapp.com" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="app-footer__social-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </a>
            {/* X / Twitter */}
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="app-footer__social-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
                <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
              </svg>
            </a>
            {/* Facebook */}
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="app-footer__social-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
              </svg>
            </a>
            {/* LinkedIn */}
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="app-footer__social-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                <rect x="2" y="9" width="4" height="12"/>
                <circle cx="4" cy="4" r="2"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
