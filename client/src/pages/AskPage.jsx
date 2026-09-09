import { useState, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import '../styles/ask-workspace.css';

const STARTER_PROMPTS = [
  { label: 'Nepal Flood Situation', query: 'What is actually happening with the Nepal floods and landslides?' },
  { label: 'European Unity Study', query: 'Explain the background and key findings of the European unity report.' },
  { label: 'Slain Surfers Mexico Trial', query: 'What are the confirmed facts in the Australian surfers homicide trial?' },
  { label: 'Tung Chee-hwa Historical Legacy', query: 'Who was Tung Chee-hwa and what was his historical role in Hong Kong?' },
];

export default function AskPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'fact-check' ? 'fact_check' : (searchParams.get('mode') || 'ask');

  const [mode, setMode] = useState(initialMode);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const threadEndRef = useRef(null);

  // Sync mode changes with URL query parameter
  const handleModeChange = (newMode) => {
    setMode(newMode);
    setSearchParams(newMode === 'ask' ? {} : { mode: newMode === 'fact_check' ? 'fact-check' : newMode });
  };

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e, forcedQuery = null) => {
    if (e) e.preventDefault();
    const queryToSend = (forcedQuery || input).trim();
    if (!queryToSend || loading) return;

    // Add user message to thread
    const userMsg = { role: 'user', content: queryToSend, mode };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build conversation history for context preservation
    const conversationHistory = messages.map((m) => ({
      role: m.role,
      content: m.content || m.answer || '',
    }));

    try {
      const endpoint = mode === 'fact_check' ? '/ask/fact-check' : '/ask/query';
      const payload = {
        query: queryToSend,
        mode,
        conversationHistory,
      };

      const result = await api.post(endpoint, payload);

      const assistantMsg = {
        role: 'assistant',
        mode: result.mode || mode,
        answer: result.answer,
        theVerifiedPicture: result.theVerifiedPicture,
        provenance: result.provenance || 'NEWS REPORTING',
        claims: result.claims || [],
        sources: result.sources || [],
        events: result.events || [],
        entities: result.entities || [],
        graphContext: result.graphContext,
        causalChain: result.causalChain,
        timeline: result.timeline || [],
        mlForecast: result.mlForecast,
        videoNote: result.videoNote,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          mode,
          answer: err.message || 'An error occurred while researching this query. Please check connection and try again.',
          provenance: 'PUBLIC SIGNAL',
          claims: [],
          sources: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ask-workspace" role="region" aria-label="AI Research Workspace">
      {/* Header */}
      <header className="ask-workspace__header">
        <h1 className="ask-workspace__title">
          <span>◇</span> Ask PRAMĀṆA
        </h1>
        <p className="ask-workspace__subtitle">
          Grounded conversational intelligence, cross-source research, and claim verification powered by real dispatches.
        </p>

        {/* Mode Selector */}
        <div className="ask-workspace__modes" role="tablist" aria-label="Research Modes">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'ask'}
            className={`ask-workspace__mode-btn ${mode === 'ask' ? 'ask-workspace__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('ask')}
          >
            <span>💬</span> Ask
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'fact_check'}
            className={`ask-workspace__mode-btn ${mode === 'fact_check' ? 'ask-workspace__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('fact_check')}
          >
            <span>⚖️</span> Fact Check
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'research'}
            className={`ask-workspace__mode-btn ${mode === 'research' ? 'ask-workspace__mode-btn--active' : ''}`}
            onClick={() => handleModeChange('research')}
          >
            <span>🔬</span> Research
          </button>
        </div>
      </header>

      {/* Conversation Thread */}
      <div className="ask-workspace__thread">
        {messages.length === 0 ? (
          <div className="ask-workspace__welcome">
            <div className="ask-workspace__welcome-icon" aria-hidden="true">
              {mode === 'fact_check' ? '⚖️' : mode === 'research' ? '🔬' : '◇'}
            </div>
            <h2 className="ask-workspace__welcome-title">
              {mode === 'fact_check'
                ? 'Verify Claims & Statements'
                : mode === 'research'
                ? 'Deep Investigative Analysis'
                : 'What would you like to investigate?'}
            </h2>
            <p className="ask-workspace__welcome-desc">
              {mode === 'fact_check'
                ? 'Paste an article URL, video link, or text statement to cross-examine claims against real-time reporting.'
                : 'Enter a question, topic, article URL, or public video link. Follow up with contextual questions without repeating yourself.'}
            </p>

            {/* Starter Prompts */}
            <div className="ask-workspace__starters">
              {STARTER_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  className="ask-workspace__starter-card"
                  onClick={() => handleSubmit(null, prompt.query)}
                >
                  <div>
                    <strong>{prompt.label}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '2px' }}>{prompt.query}</div>
                  </div>
                  <span style={{ color: '#8B5CF6' }}>→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`ask-workspace__msg ${msg.role === 'user' ? 'ask-workspace__msg--user' : 'ask-workspace__msg--assistant'}`}
            >
              {msg.role === 'user' ? (
                <div className="ask-workspace__msg-bubble">
                  {msg.content}
                </div>
              ) : (
                <div className="ask-workspace__report-card">
                  {/* Report Header */}
                  <div className="ask-workspace__report-header">
                    <span className="ask-workspace__provenance-tag">
                      ● {msg.provenance || 'NEWS REPORTING'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'capitalize' }}>
                      Mode: {msg.mode.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Video Metadata Notice if applicable */}
                  {msg.videoNote && (
                    <div className="ask-workspace__video-note">
                      <span>ℹ️</span> {msg.videoNote}
                    </div>
                  )}

                  {/* The Verified Picture Callout */}
                  {msg.theVerifiedPicture && (
                    <div className="ask-workspace__verified-callout">
                      <div className="ask-workspace__verified-title">
                        <span>✓</span> The Verified Picture
                      </div>
                      <p className="ask-workspace__verified-text">{msg.theVerifiedPicture}</p>
                    </div>
                  )}

                  {/* Report Body */}
                  <div className="ask-workspace__report-body">
                    {msg.answer.split('\n\n').map((paragraph, pIdx) => {
                      if (paragraph.startsWith('### ')) {
                        return (
                          <h3 key={pIdx} style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: '1rem 0 0.35rem 0', fontFamily: 'var(--font-serif)' }}>
                            {paragraph.replace('### ', '')}
                          </h3>
                        );
                      }
                      if (paragraph.startsWith('**') && paragraph.includes('**\n')) {
                        const parts = paragraph.split('\n');
                        return (
                          <div key={pIdx}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: '0.75rem 0 0.25rem 0' }}>
                              {parts[0].replace(/\*\*/g, '')}
                            </h3>
                            <p>{parts.slice(1).join('\n')}</p>
                          </div>
                        );
                      }
                      return <p key={pIdx}>{paragraph}</p>;
                    })}
                  </div>

                  {/* Causal Reasoning Sequence */}
                  {msg.causalChain?.stages && Object.values(msg.causalChain.stages).some(s => s.status !== 'MISSING_EVIDENCE') && (
                    <div className="ask-workspace__causal-section">
                      <div className="ask-workspace__section-heading">
                        <span>⤹</span> Causal Sequence & Mechanism
                      </div>
                      <div className="ask-workspace__causal-grid">
                        {Object.entries(msg.causalChain.stages)
                          .filter(([_, data]) => data.status !== 'MISSING_EVIDENCE')
                          .map(([stage, data]) => (
                            <div key={stage} className="ask-workspace__causal-card">
                              <div className="ask-workspace__causal-header">
                                <span className="ask-workspace__causal-stage">
                                  {stage.replace('_', ' ')}
                                </span>
                                <span
                                  className={`ask-workspace__causal-badge ${
                                    data.status === 'SUPPORTED'
                                      ? 'ask-workspace__causal-badge--supported'
                                      : 'ask-workspace__causal-badge--inferred'
                                  }`}
                                >
                                  {data.status}
                                </span>
                              </div>
                              <p className="ask-workspace__causal-desc">{data.description}</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Deterministic ML Escalation Forecast */}
                  {msg.mlForecast && msg.mlForecast.status === 'FORECAST_PRODUCED' && (
                    <div className="ask-workspace__forecast-card">
                      <div className="ask-workspace__forecast-header">
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase' }}>
                          ⚡ Calibrated ML Forecast: {msg.mlForecast.target}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>
                          Model: {msg.mlForecast.modelVersion}
                        </span>
                      </div>
                      <div className="ask-workspace__forecast-meter">
                        <div
                          className="ask-workspace__forecast-fill"
                          style={{ width: `${Math.round(msg.mlForecast.probability * 100)}%` }}
                        />
                      </div>
                      <div className="ask-workspace__forecast-ci">
                        <span>Predicted Probability: <strong>{(msg.mlForecast.probability * 100).toFixed(1)}%</strong></span>
                        <span>95% CI: [{(msg.mlForecast.uncertaintyLower * 100).toFixed(1)}% – {(msg.mlForecast.uncertaintyUpper * 100).toFixed(1)}%]</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#4B5563', margin: '6px 0 0 0' }}>
                        {msg.mlForecast.explanation}
                      </p>
                    </div>
                  )}

                  {/* Claims & Verification Section */}
                  {msg.claims && msg.claims.length > 0 && (
                    <div className="ask-workspace__claims-section">
                      <div className="ask-workspace__claims-title">
                        Evaluated Claims ({msg.claims.length})
                      </div>
                      <div className="ask-workspace__claims-grid">
                        {msg.claims.map((claim, cIdx) => (
                          <div key={cIdx} className="ask-workspace__claim-item">
                            <div className="ask-workspace__claim-meta">
                              <span
                                className={`badge ${
                                  claim.status === 'VERIFIED'
                                    ? 'badge--verified'
                                    : claim.status === 'CONTRADICTED'
                                    ? 'badge--contradicted'
                                    : 'badge--unverified'
                                }`}
                              >
                                {claim.badgeLabel || claim.status}
                              </span>
                              {claim.independentSourceCount > 0 && (
                                <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>
                                  {claim.independentSourceCount} indep. outlet(s)
                                </span>
                              )}
                            </div>
                            <p className="ask-workspace__claim-text">
                              &ldquo;{claim.text}&rdquo;
                            </p>
                            {claim.explanation && (
                              <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginTop: '4px' }}>
                                {claim.explanation}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Connected Knowledge Graph Entities */}
                  {msg.graphContext?.entities && msg.graphContext.entities.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #F3F4F6' }}>
                      <span className="ask-workspace__section-heading">
                        <span>🕸</span> Knowledge Graph Entities
                      </span>
                      <div className="ask-workspace__entities-grid">
                        {msg.graphContext.entities.slice(0, 8).map((ent, eIdx) => (
                          <div key={eIdx} className="ask-workspace__entity-chip">
                            <strong>{ent.name}</strong>
                            <span className="ask-workspace__entity-role">({ent.role})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Associated Living Events */}
                  {msg.events && msg.events.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #F3F4F6' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4B5563', textTransform: 'uppercase' }}>
                        Related Events:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {msg.events.map((ev) => (
                          <Link
                            key={ev.id}
                            to={`/event/${ev.id}`}
                            style={{
                              fontSize: '0.75rem',
                              color: '#6D28D9',
                              background: '#F5F3FF',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              textDecoration: 'none',
                              border: '1px solid #DDD6FE',
                            }}
                          >
                            {ev.title} ↗
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sources Ledger */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="ask-workspace__sources-section">
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
                        Corroborating Dispatches ({msg.sources.length}):
                      </span>
                      <div className="ask-workspace__sources-pills">
                        {msg.sources.map((src, sIdx) => (
                          <a
                            key={sIdx}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ask-workspace__source-pill"
                          >
                            <span>📰</span>
                            <strong>{src.name}</strong>: {src.title ? src.title.slice(0, 45) + '...' : 'Report'}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="ask-workspace__msg ask-workspace__msg--assistant">
            <div className="ask-workspace__report-card" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="loading__spinner" style={{ width: '20px', height: '20px' }} />
              <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                Cross-referencing dispatches, verifying claims, and synthesizing report...
              </span>
            </div>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Persistent Bottom Input Bar */}
      <form className="ask-workspace__input-container" onSubmit={handleSubmit}>
        <div className="ask-workspace__input-row">
          <input
            type="text"
            className="ask-workspace__input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'fact_check'
                ? 'Paste an article URL, video link, or statement to fact-check...'
                : mode === 'research'
                ? 'Enter deep investigative query or topic...'
                : 'Ask a question, paste an article URL, or video URL...'
            }
            aria-label="Research query or URL input"
            disabled={loading}
          />
          <button
            type="submit"
            className="ask-workspace__submit-btn"
            disabled={!input.trim() || loading}
          >
            {loading ? 'Researching...' : 'Research →'}
          </button>
        </div>
        <div className="ask-workspace__input-hint">
          <span>Accepts text questions, topics, public article URLs, and video URLs.</span>
          <span>Context is preserved across follow-up questions.</span>
        </div>
      </form>
    </div>
  );
}
