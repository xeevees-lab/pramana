import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import '../../styles/floating-intelligence.css';

/**
 * Global Floating Intelligence Assistant
 * Provides rapid grounded queries from any page using the exact same
 * research intelligence pipeline as the full /ask workspace.
 */
export default function FloatingIntelligence() {
  const location = useLocation();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const panelRef = useRef(null);
  const inputRef = useRef(null);

  // Hide floating widget if user is already on the dedicated /ask workspace
  const isAskPage = location.pathname.startsWith('/ask');

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isAskPage) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isAskPage]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (isAskPage) {
    return null;
  }

  const handleSearch = async (e) => {
    e?.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || loading) return;

    setLoading(true);
    setError(null);

    try {
      // Calls the EXACT same research intelligence pipeline as /ask
      const data = await api.post('/ask/query', {
        query: cleanQuery,
        mode: 'ask',
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Unable to retrieve research briefing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFullAsk = () => {
    if (result?.conversationId) {
      navigate(`/ask?cid=${result.conversationId}`);
    } else if (query.trim()) {
      navigate(`/ask`);
    } else {
      navigate('/ask');
    }
    setIsOpen(false);
  };

  return (
    <div className="floating-assistant" role="complementary" aria-label="Quick Intelligence Assistant">
      {/* Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          className="floating-assistant__trigger"
          onClick={() => setIsOpen(true)}
          aria-expanded={false}
          title="Open Pramāṇa Quick Intelligence"
        >
          <span className="floating-assistant__trigger-icon">◇</span>
          <span className="floating-assistant__trigger-label">Ask Pramāṇa</span>
        </button>
      )}

      {/* Popup Dialog Panel */}
      {isOpen && (
        <div className="floating-assistant__panel" ref={panelRef}>
          {/* Header */}
          <div className="floating-assistant__header">
            <div className="floating-assistant__header-title">
              <span className="floating-assistant__header-icon">◇</span>
              <div>
                <strong>PRAMĀṆA Intelligence</strong>
                <span className="floating-assistant__header-sub">Quick Dispatch Briefing</span>
              </div>
            </div>
            <button
              type="button"
              className="floating-assistant__close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close Assistant"
              title="Close"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="floating-assistant__body">
            {/* Input form */}
            <form className="floating-assistant__form" onSubmit={handleSearch}>
              <div className="floating-assistant__input-wrapper">
                <input
                  ref={inputRef}
                  type="text"
                  className="floating-assistant__input"
                  placeholder="Ask a question or topic..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  aria-label="Quick question input"
                />
                <button
                  type="submit"
                  className="floating-assistant__send-btn"
                  disabled={!query.trim() || loading}
                  aria-label="Submit search"
                >
                  {loading ? '...' : '→'}
                </button>
              </div>
            </form>

            {/* Results Area */}
            <div className="floating-assistant__content">
              {loading && (
                <div className="floating-assistant__loading">
                  <div className="loading__spinner" style={{ width: '18px', height: '18px' }} />
                  <span>Synthesizing intelligence dispatches...</span>
                </div>
              )}

              {error && (
                <div className="floating-assistant__error">
                  {error}
                </div>
              )}

              {!loading && !result && !error && (
                <div className="floating-assistant__placeholder">
                  <p>Inquire about developing events, cross-verify claims, or inspect source dispatches across the knowledge base.</p>
                  <div className="floating-assistant__suggestions">
                    <button
                      type="button"
                      className="floating-assistant__suggestion-chip"
                      onClick={() => {
                        setQuery('What happened with the Nepal floods?');
                        setTimeout(() => handleSearch(), 50);
                      }}
                    >
                      Nepal floods status
                    </button>
                    <button
                      type="button"
                      className="floating-assistant__suggestion-chip"
                      onClick={() => {
                        setQuery('European unity report findings');
                        setTimeout(() => handleSearch(), 50);
                      }}
                    >
                      European unity report
                    </button>
                  </div>
                </div>
              )}

              {!loading && result && (
                <div className="floating-assistant__result">
                  {/* Status Banner */}
                  {result.currentStatus && (
                    <div
                      className={`floating-assistant__status ${
                        result.currentStatus.isActive
                          ? 'floating-assistant__status--active'
                          : 'floating-assistant__status--settled'
                      }`}
                    >
                      <span className="floating-assistant__status-dot" />
                      <span>{result.currentStatus.isActive ? 'Actively Developing' : 'Recent Event Dispatch'}</span>
                      {result.currentStatus.headline && (
                        <div className="floating-assistant__status-title">
                          {result.currentStatus.headline}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Concise Executive Summary */}
                  <div className="floating-assistant__summary">
                    <p>
                      {(result.executiveSummary || result.answer || '')
                        .replace(/^#{1,6}\s+/gm, '')
                        .replace(/\*\*/g, '')
                        .split('\n\n')[0]}
                    </p>
                  </div>

                  {/* Verified Picture snippet */}
                  {result.theVerifiedPicture && (
                    <div className="floating-assistant__verified">
                      <strong>✓ Verified Picture:</strong> {result.theVerifiedPicture}
                    </div>
                  )}

                  {/* Top Sources */}
                  {result.sources && result.sources.length > 0 && (
                    <div className="floating-assistant__sources">
                      <span className="floating-assistant__sources-label">Sources ({result.sources.length}):</span>
                      <div className="floating-assistant__sources-list">
                        {result.sources.slice(0, 3).map((src, i) => (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="floating-assistant__source-item"
                          >
                            📰 {src.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Link to Full /ask Workspace */}
                  <button
                    type="button"
                    className="floating-assistant__expand-btn"
                    onClick={handleOpenFullAsk}
                  >
                    Open Full Research in Ask Workspace →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
