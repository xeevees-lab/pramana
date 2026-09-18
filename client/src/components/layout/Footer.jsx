import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer__container">
        {/* Main 4-Column Grid */}
        <div className="app-footer__grid">
          {/* Column 1: PRAMĀṆA */}
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">PRAMĀṆA</h3>
            <ul className="app-footer__list">
              <li><Link to="/explore">About Us</Link></li>
              <li><Link to="/explore?archive=true">News Archive</Link></li>
              <li><a href="/api/sources" target="_blank" rel="noopener noreferrer">RSS Feed & Sources</a></li>
              <li><Link to="/settings">Subscriptions & API</Link></li>
            </ul>
          </div>

          {/* Column 2: POPULAR */}
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">POPULAR</h3>
            <ul className="app-footer__list">
              <li><Link to="/explore?category=election">Election</Link></li>
              <li><Link to="/explore?category=all">Latest News</Link></li>
              <li><Link to="/explore?category=business">Business</Link></li>
              <li><Link to="/explore?category=sports">Sports</Link></li>
              <li><Link to="/explore?category=india">India</Link></li>
              <li><Link to="/explore?category=world">World</Link></li>
              <li><Link to="/explore?category=technology">Tech</Link></li>
            </ul>
          </div>

          {/* Column 3: RESEARCH */}
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">RESEARCH</h3>
            <ul className="app-footer__list">
              <li><Link to="/ask?mode=fact_check">Fact Check</Link></li>
              <li><Link to="/ask?mode=research">Investigative Research</Link></li>
              <li><Link to="/explore">Living Events</Link></li>
              <li><Link to="/live">Real-Time Wire</Link></li>
              <li><Link to="/ask">Verification Methodology</Link></li>
            </ul>
          </div>

          {/* Column 4: COMPANY */}
          <div className="app-footer__col">
            <h3 className="app-footer__col-title">COMPANY</h3>
            <ul className="app-footer__list">
              <li><Link to="/profile">Contact Us</Link></li>
              <li><Link to="/settings">Privacy Policy</Link></li>
              <li><Link to="/settings">Terms of Service</Link></li>
              <li><Link to="/settings">Editorial Guidelines</Link></li>
            </ul>
          </div>
        </div>

        {/* Social Icons Bar */}
        <div className="app-footer__social-row">
          <div className="app-footer__social-links" aria-label="Social media channels">
            {/* WhatsApp */}
            <a
              href="https://whatsapp.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="app-footer__social-icon"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </a>

            {/* X / Twitter */}
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              className="app-footer__social-icon"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
                <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
              </svg>
            </a>

            {/* Facebook */}
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="app-footer__social-icon"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
              </svg>
            </a>

            {/* Instagram */}
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="app-footer__social-icon"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </a>

            {/* LinkedIn */}
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="app-footer__social-icon"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
                <rect x="2" y="9" width="4" height="12"/>
                <circle cx="4" cy="4" r="2"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom Tagline & Meta */}
        <div className="app-footer__bottom">
          <div className="app-footer__brand-statement">
            <span className="app-footer__logo-mark">PRAMĀṆA</span>
            <p className="app-footer__tagline">
              Global Real-Time News Intelligence, Verification, Context &amp; Living Knowledge Graph.
            </p>
          </div>
          <div className="app-footer__copyright">
            © {new Date().getFullYear()} PRAMĀṆA Systems Inc. All rights reserved. Powered by PostgreSQL, pgvector &amp; Neo4j.
          </div>
        </div>
      </div>
    </footer>
  );
}
