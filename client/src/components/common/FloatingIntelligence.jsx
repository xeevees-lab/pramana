import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import '../../styles/floating-intelligence.css';

/**
 * Global Floating Intelligence Assistant
 * Provides rapid grounded queries from any page using the exact same
 * research intelligence pipeline as the full /ask workspace.
 *
 * CRITICAL CORRECTNESS REQUIREMENTS:
 * - Request sequence protection: out-of-order responses are discarded.
 * - Direct parameter passing: suggestion chips pass query text directly, never through stale closure.
 * - Page context never overrides explicit user query.
 * - Each query starts fresh (no cross-conversation contamination).
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
  // Request sequence ID to prevent out-of-order response overwrites
  const requestIdRef = useRef(0);

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

  /**
   * Execute search with an EXPLICIT query parameter.
   * This eliminates the stale closure bug where suggestion chips would
   * call setQuery() then setTimeout(handleSearch, 50) and read old state.
   *
   * @param {Event|null} e - Form submit event, or null for programmatic calls
   * @param {string} [explicitQuery] - Direct query text (bypasses React state)
   */
  const handleSearch = async (e, explicitQuery = null) => {
    if (e) e.preventDefault();

    // Use explicit parameter if provided, otherwise read current state
    const cleanQuery = (explicitQuery || query).trim();
    if (!cleanQuery || loading) return;

    // Assign a unique request ID BEFORE clearing state
    const thisRequestId = ++requestIdRef.current;

    // Clear previous results immediately to avoid showing stale data
    setLoading(true);
    setError(null);
    setResult(null);

    // Also update the input to reflect the explicit query (for chips)
    if (explicitQuery) {
      setQuery(explicitQuery);
    }

    try {
      // Calls the EXACT same research intelligence pipeline as /ask
      // No page context, no conversation ID — pure explicit user query
      const data = await api.post('/ask/query', {
        query: cleanQuery,
        mode: 'ask',
      });

      // CRITICAL: Discard response if a newer request was sent while this one was in flight
      if (requestIdRef.current !== thisRequestId) {
        console.log('[FloatingIntelligence] Discarding stale response for request', thisRequestId);
        return;
      }

      setResult(data);
    } catch (err) {
      // Only set error if this is still the current request
      if (requestIdRef.current === thisRequestId) {
        setError(err.message || 'Unable to retrieve research briefing. Please try again.');
      }
    } finally {
      // Only clear loading if this is still the current request
      if (requestIdRef.current === thisRequestId) {
        setLoading(false);
      }
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
      {/* Trigger Button — compact icon, not a large pill */}
      {!isOpen && (
        <button
          type="button"
          className="floating-assistant__trigger"
          onClick={() => setIsOpen(true)}
          aria-expanded={false}
          title="Open Pramāṇa Quick Intelligence"
          aria-label="Open Pramāṇa Quick Intelligence"
        >
          <span className="floating-assistant__trigger-icon">◇</span>
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
            <form className="floating-assistant__form" onSubmit={(e) => handleSearch(e)}>
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
                      onClick={() => handleSearch(null, 'What happened with the Nepal floods?')}
                    >
                      Nepal floods status
                    </button>
                    <button
                      type="button"
                      className="floating-assistant__suggestion-chip"
                      onClick={() => handleSearch(null, 'European unity report findings')}
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

                  {/* Key Developments (Part 21 Parity) */}
                  {result.keyDevelopments && result.keyDevelopments.length > 0 && (
                    <div className="floating-assistant__key-devs">
                      <span className="floating-assistant__key-devs-label">⚡ Key Developments:</span>
                      {result.keyDevelopments.slice(0, 3).map((kd, idx) => (
                        <div key={idx} className="floating-assistant__key-dev-item">
                          <strong>{kd.organization ? `${kd.organization} — ` : ''}{kd.title}:</strong>{' '}
                          {kd.whatHappened || kd.whyItMatters}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Verified Picture snippet */}
                  {result.theVerifiedPicture && (!result.keyDevelopments || result.keyDevelopments.length === 0) && (
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
                            📰 {src.name || src.publisher}
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
