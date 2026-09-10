import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import useAuthStore from '../stores/authStore.js';
import '../styles/ask-workspace.css';

const STARTER_PROMPTS = [
  { label: 'Nepal Flood Situation', query: 'What is actually happening with the Nepal floods and landslides?' },
  { label: 'European Unity Study', query: 'Explain the background and key findings of the European unity report.' },
  { label: 'Slain Surfers Mexico Trial', query: 'What are the confirmed facts in the Australian surfers homicide trial?' },
  { label: 'Tung Chee-hwa Historical Legacy', query: 'Who was Tung Chee-hwa and what was his historical role in Hong Kong?' },
];

/**
 * Cleanly format text paragraphs, stripping stray markdown headers/rules
 * and safely rendering inline bold text without literal asterisks.
 */
function CleanParagraph({ text }) {
  if (!text) return null;
  const cleaned = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+\s*$/gm, '')
    .replace(/^>\s*/gm, '')
    .trim();

  if (!cleaned) return null;

  // Render inline bold elements cleanly
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="ask-workspace__paragraph">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </p>
  );
}

/**
 * Temporal & Current Status Banner Component
 * Distinguishes whether an event is actively unfolding or a recent/historical dispatch.
 */
function CurrentStatusBanner({ currentStatus }) {
  if (!currentStatus || (!currentStatus.headline && !currentStatus.description)) return null;

  const { isActive, headline, description } = currentStatus;

  return (
    <div className={`ask-workspace__status-banner ${isActive ? 'ask-workspace__status-banner--active' : 'ask-workspace__status-banner--settled'}`}>
      <div className="ask-workspace__status-header">
        <span className="ask-workspace__status-indicator">
          <span className={`ask-workspace__status-dot ${isActive ? 'ask-workspace__status-dot--pulse' : ''}`} />
          {isActive ? 'Actively Developing Event' : 'Recent Event Dispatch / Resolved'}
        </span>
        {headline && <span className="ask-workspace__status-headline">{headline}</span>}
      </div>
      {description && <p className="ask-workspace__status-desc">{description}</p>}
    </div>
  );
}

export default function AskPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'fact-check' ? 'fact_check' : (searchParams.get('mode') || 'ask');
  const urlConvId = searchParams.get('cid');

  const { user } = useAuthStore();

  const [mode, setMode] = useState(initialMode);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState(urlConvId || null);
  const [conversations, setConversations] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const threadEndRef = useRef(null);

  // Sync mode changes with URL query parameter
  const handleModeChange = (newMode) => {
    setMode(newMode);
    const newParams = new URLSearchParams(searchParams);
    if (newMode === 'ask') {
      newParams.delete('mode');
    } else {
      newParams.set('mode', newMode === 'fact_check' ? 'fact-check' : newMode);
    }
    setSearchParams(newParams);
  };

  // Auto-scroll to bottom of thread
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Load conversation list when authenticated
  const fetchConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      return;
    }
    setLoadingConversations(true);
    try {
      const res = await api.get('/ask/conversations');
      setConversations(res.conversations || []);
    } catch (err) {
      console.warn('Could not load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load specific conversation messages
  const loadConversation = async (convId) => {
    if (!convId) return;
    setLoading(true);
    try {
      const res = await api.get(`/ask/conversations/${convId}`);
      setActiveConversationId(convId);
      const newParams = new URLSearchParams(searchParams);
      newParams.set('cid', convId);
      setSearchParams(newParams);

      // Reconstruct UI messages from stored messages
      const loadedMessages = (res.messages || []).map((m) => {
        if (m.role === 'user') {
          return { role: 'user', content: m.content };
        }
        const data = m.structured_data || {};
        return {
          role: 'assistant',
          mode: data.mode || res.conversation?.mode || 'ask',
          answer: data.answer || data.executiveSummary || m.content,
          executiveSummary: data.executiveSummary || m.content,
          currentStatus: data.currentStatus,
          temporalIntent: data.temporalIntent,
          theVerifiedPicture: data.theVerifiedPicture,
          provenance: data.provenance || 'NEWS REPORTING',
          claims: data.claims || [],
          sources: data.sources || [],
          events: data.events || [],
          entities: data.entities || [],
          graphContext: data.graphContext,
          causalChain: data.causalChain,
          timeline: data.timeline || [],
          mlForecast: data.mlForecast,
          videoNote: data.videoNote,
        };
      });

      setMessages(loadedMessages);
      if (res.conversation?.mode) {
        setMode(res.conversation.mode);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load if conversation ID in URL
  useEffect(() => {
    if (urlConvId && user) {
      loadConversation(urlConvId);
    }
  }, [urlConvId, user]);

  // Start fresh conversation
  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInput('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('cid');
    setSearchParams(newParams);
  };

  // Delete conversation
  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    try {
      await api.delete(`/ask/conversations/${convId}`);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        handleNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

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
        conversationId: activeConversationId || undefined,
      };

      const result = await api.post(endpoint, payload);

      if (result.conversationId && result.conversationId !== activeConversationId) {
        setActiveConversationId(result.conversationId);
        const newParams = new URLSearchParams(searchParams);
        newParams.set('cid', result.conversationId);
        setSearchParams(newParams);
        fetchConversations();
      }

      const assistantMsg = {
        role: 'assistant',
        mode: result.mode || mode,
        answer: result.answer,
        executiveSummary: result.executiveSummary || result.answer,
        currentStatus: result.currentStatus,
        temporalIntent: result.temporalIntent,
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
    <div className="ask-layout" role="region" aria-label="AI Research Workspace">
      {/* In-Ask Conversation History Sidebar */}
      <aside className={`ask-sidebar ${sidebarOpen ? 'ask-sidebar--open' : 'ask-sidebar--collapsed'}`} aria-label="Research History">
        <div className="ask-sidebar__header">
          <button
            type="button"
            className="ask-sidebar__new-btn"
            onClick={handleNewChat}
            title="Start fresh research session"
          >
            <span>+</span> New Research Chat
          </button>
        </div>

        <div className="ask-sidebar__list">
          <div className="ask-sidebar__section-title">Saved Conversations</div>
          {loadingConversations ? (
            <div className="ask-sidebar__empty">Loading history...</div>
          ) : conversations.length === 0 ? (
            <div className="ask-sidebar__empty">
              {user ? 'No saved research threads yet.' : 'Sign in to save research threads across sessions.'}
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`ask-sidebar__item ${conv.id === activeConversationId ? 'ask-sidebar__item--active' : ''}`}
                onClick={() => loadConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && loadConversation(conv.id)}
              >
                <div className="ask-sidebar__item-content">
                  <span className="ask-sidebar__item-title">{conv.title || 'Research Thread'}</span>
                  <span className="ask-sidebar__item-meta">
                    {new Date(conv.updated_at || conv.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  className="ask-sidebar__item-del"
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  title="Delete thread"
                  aria-label="Delete thread"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Research Workspace */}
      <div className="ask-workspace">
        {/* Header */}
        <header className="ask-workspace__header">
          <div className="ask-workspace__header-top">
            <h1 className="ask-workspace__title">
              <span>◇</span> Ask PRAMĀṆA
            </h1>
            <button
              type="button"
              className="ask-workspace__sidebar-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title={sidebarOpen ? 'Hide History' : 'Show History'}
              aria-label="Toggle history sidebar"
            >
              <span>{sidebarOpen ? '◀' : '▶'}</span> History
            </button>
          </div>
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
                      {msg.accessState && msg.accessState !== 'DIRECT_QUERY' && (
                        <span style={{
                          fontSize: '0.6875rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#EEF2FF',
                          color: '#4F46E5',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}>
                          {msg.accessState.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'capitalize' }}>
                        Mode: {msg.mode ? msg.mode.replace('_', ' ') : 'ask'}
                      </span>
                    </div>

                    {/* Current Status Banner (Multi-Lane Distinction) */}
                    {msg.currentStatus && (
                      <CurrentStatusBanner currentStatus={msg.currentStatus} />
                    )}

                    {/* Video Metadata Notice if applicable */}
                    {msg.videoNote && (
                      <div className="ask-workspace__video-note">
                        <span>ℹ️</span> {msg.videoNote}
                      </div>
                    )}

                    {/* The Verified Picture Callout (Exactly Once) */}
                    {msg.theVerifiedPicture && (
                      <div className="ask-workspace__verified-callout">
                        <div className="ask-workspace__verified-title">
                          <span>✓</span> The Verified Picture
                        </div>
                        <p className="ask-workspace__verified-text">{msg.theVerifiedPicture}</p>
                      </div>
                    )}

                    {/* Structured Editorial Report Body (No Raw Markdown Headers) */}
                    <div className="ask-workspace__report-body">
                      {(msg.executiveSummary || msg.answer || '')
                        .split('\n\n')
                        .map((paragraph, pIdx) => (
                          <CleanParagraph key={pIdx} text={paragraph} />
                        ))}
                    </div>

                    {/* Causal Reasoning Sequence */}
                    {msg.causalChain?.stages && Object.values(msg.causalChain.stages).some((s) => s.status !== 'MISSING_EVIDENCE') && (
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
                                    {stage.replace(/_/g, ' ')}
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
                              {/* Dimension 1: VERIFICATION STATUS — top-level badge */}
                              <div className="ask-workspace__claim-meta">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                  {/* Explanatory subtext for verification status */}
                                  <span style={{ fontSize: '0.625rem', color: '#9CA3AF', lineHeight: 1.3, marginTop: '1px' }}>
                                    {claim.status === 'VERIFIED'
                                      ? 'Corroborated by independent reporting'
                                      : claim.status === 'CONTRADICTED'
                                      ? 'Contradicted by identified source(s)'
                                      : 'Insufficient independent evidence to verify'}
                                  </span>
                                </div>
                              </div>

                              {/* Claim text */}
                              <p className="ask-workspace__claim-text">
                                &ldquo;{claim.text}&rdquo;
                              </p>

                              {/* Detailed explanation */}
                              {claim.explanation && (
                                <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginTop: '4px' }}>
                                  {claim.explanation}
                                </div>
                              )}

                              {/* Dimension 2: CLAIM TYPE — separate visual group */}
                              {claim.claimType && (
                                <div style={{
                                  marginTop: '6px',
                                  paddingTop: '6px',
                                  borderTop: '1px solid #F3F4F6',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <span style={{
                                    fontSize: '0.625rem',
                                    fontWeight: 600,
                                    color: '#9CA3AF',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                  }}>
                                    Claim Type:
                                  </span>
                                  <span style={{
                                    fontSize: '0.6875rem',
                                    color: '#6D28D9',
                                    background: '#F5F3FF',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    border: '1px solid #EDE9FE',
                                    fontWeight: 500,
                                    textTransform: 'capitalize',
                                  }}>
                                    {(claim.claimType || 'factual').replace(/_/g, ' ')} assertion
                                  </span>
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
                          Related Living Events:
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

                    {/* Corroborating Dispatches (Direct Source Cards) */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="ask-workspace__sources-section">
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
                          Key Evidence Sources ({msg.sources.length}):
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
                              <strong>{src.name || src.publisher}</strong>: {src.headline || src.title ? (src.headline || src.title).slice(0, 50) + '...' : 'Report'}
                            </a>
                          ))}
                        </div>

                        {/* Collapsible Additional Sources */}
                        {msg.moreSources && msg.moreSources.length > 0 && (
                          <details style={{ marginTop: '8px' }}>
                            <summary style={{ fontSize: '0.75rem', color: '#6B7280', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}>
                              + {msg.moreSources.length} additional corroborated sources
                            </summary>
                            <div className="ask-workspace__sources-pills" style={{ marginTop: '6px' }}>
                              {msg.moreSources.map((src, mIdx) => (
                                <a
                                  key={mIdx}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ask-workspace__source-pill"
                                >
                                  <span>📰</span>
                                  <strong>{src.name || src.publisher}</strong>: {src.headline || src.title ? (src.headline || src.title).slice(0, 50) + '...' : 'Report'}
                                </a>
                              ))}
                            </div>
                          </details>
                        )}
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
                  Cross-referencing multi-lane dispatches, evaluating status, and synthesizing report...
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
            <span>History and referents preserved across follow-up queries.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
