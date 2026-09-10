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

/**
 * Provenance Badge with 4 distinct tiers:
 * PRIMARY_SOURCE, SCIENTIFIC_INSTITUTIONAL, HIGH_QUALITY_NEWS, EXTERNAL_FALLBACK
 */
function ProvenanceBadge({ provenance }) {
  const p = (provenance || 'NEWS REPORTING').toUpperCase();
  let modifier = 'news';
  if (p.includes('PRIMARY')) modifier = 'primary';
  else if (p.includes('SCIENTIFIC') || p.includes('INSTITUTIONAL')) modifier = 'scientific';
  else if (p.includes('EXTERNAL')) modifier = 'external';

  return (
    <span className={`ask-workspace__provenance-tag ask-workspace__provenance-tag--${modifier}`}>
      ● {provenance || 'NEWS REPORTING'}
    </span>
  );
}

/**
 * Key Developments Card List (Part 20 & 21)
 * High-confidence bulleted cards with outlet, date, event, and why it matters
 */
function KeyDevelopmentsList({ developments }) {
  if (!developments || developments.length === 0) return null;

  return (
    <div className="ask-workspace__key-developments">
      <div className="ask-workspace__key-devs-heading">
        <span>⚡</span> Key Developments ({developments.length})
      </div>
      <div className="ask-workspace__key-devs-grid">
        {developments.map((dev, dIdx) => {
          const cardContent = (
            <>
              <div className="ask-workspace__key-dev-header">
                <span className="ask-workspace__key-dev-title">{dev.title}</span>
                <div className="ask-workspace__key-dev-meta">
                  {dev.organization && (
                    <span className="ask-workspace__key-dev-org">{dev.organization}</span>
                  )}
                  {dev.date && <span>{dev.date}</span>}
                </div>
              </div>
              {dev.whatHappened && (
                <p className="ask-workspace__key-dev-body">{dev.whatHappened}</p>
              )}
              {dev.whyItMatters && (
                <div className="ask-workspace__key-dev-why">
                  <strong>Context:</strong> {dev.whyItMatters}
                </div>
              )}
            </>
          );

          return dev.url ? (
            <a
              key={dIdx}
              href={dev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ask-workspace__key-dev-card"
            >
              {cardContent}
            </a>
          ) : (
            <div key={dIdx} className="ask-workspace__key-dev-card">
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Sources & Corroborating Dispatches Section
 */
function SourcesSection({ sources, moreSources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="ask-workspace__sources-section">
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280' }}>
        Key Sources ({sources.length}):
      </span>
      <div className="ask-workspace__sources-pills">
        {sources.map((src, sIdx) => (
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

      {moreSources && moreSources.length > 0 && (
        <details style={{ marginTop: '8px' }}>
          <summary style={{ fontSize: '0.75rem', color: '#6B7280', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}>
            + {moreSources.length} additional corroborated sources
          </summary>
          <div className="ask-workspace__sources-pills" style={{ marginTop: '6px' }}>
            {moreSources.map((src, mIdx) => (
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
  );
}

/**
 * Deterministic ML Escalation Forecast Card
 * Explicitly suppressed in Ask mode unless forecast was requested by user query!
 */
function MLForecastCard({ forecast, mode, queryIntent }) {
  if (!forecast || forecast.status !== 'FORECAST_PRODUCED') return null;

  // In Ask mode, suppress forecast unless specifically requested by query intent
  const isRequested = queryIntent?.forecastRequested === true;
  if (mode === 'ask' && !isRequested) {
    return null;
  }

  return (
    <div className="ask-workspace__forecast-card">
      <div className="ask-workspace__forecast-header">
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6D28D9', textTransform: 'uppercase' }}>
          ⚡ Calibrated ML Forecast: {forecast.target}
        </span>
        <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>
          Model: {forecast.modelVersion}
        </span>
      </div>
      <div className="ask-workspace__forecast-meter">
        <div
          className="ask-workspace__forecast-fill"
          style={{ width: `${Math.round(forecast.probability * 100)}%` }}
        />
      </div>
      <div className="ask-workspace__forecast-ci">
        <span>Predicted Probability: <strong>{(forecast.probability * 100).toFixed(1)}%</strong></span>
        <span>95% CI: [{(forecast.uncertaintyLower * 100).toFixed(1)}% – {(forecast.uncertaintyUpper * 100).toFixed(1)}%]</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#4B5563', margin: '6px 0 0 0' }}>
        {forecast.explanation}
      </p>
    </div>
  );
}

/**
 * Collapsible Evidence & Verification Drawer (Part 20)
 * Holds raw claims, verified picture, knowledge graph entities, and living events
 */
function EvidenceDrawer({ msg }) {
  const hasClaims = msg.claims && msg.claims.length > 0;
  const hasEntities = msg.graphContext?.entities && msg.graphContext.entities.length > 0;
  const hasEvents = msg.events && msg.events.length > 0;
  const hasCausal = msg.causalChain?.stages && Object.values(msg.causalChain.stages).some((s) => s.status !== 'MISSING_EVIDENCE');

  if (!hasClaims && !hasEntities && !hasEvents && !hasCausal && !msg.theVerifiedPicture) {
    return null;
  }

  const claimCount = msg.claims?.length || 0;
  const eventCount = msg.events?.length || 0;

  return (
    <details className="ask-workspace__evidence-drawer">
      <summary>
        <span>🔍 Evidence & Verification Details ({claimCount} claim{claimCount === 1 ? '' : 's'}, {eventCount} event{eventCount === 1 ? '' : 's'})</span>
        <span style={{ fontSize: '0.6875rem', color: '#8B5CF6' }}>Toggle verification drawer ▾</span>
      </summary>
      <div className="ask-workspace__evidence-drawer-content">
        {/* The Verified Picture if present inside drawer */}
        {msg.theVerifiedPicture && (
          <div className="ask-workspace__verified-callout">
            <div className="ask-workspace__verified-title">
              <span>✓</span> The Verified Picture
            </div>
            <p className="ask-workspace__verified-text">{msg.theVerifiedPicture}</p>
          </div>
        )}

        {/* Claims & Verification Section */}
        {hasClaims && (
          <div className="ask-workspace__claims-section">
            <div className="ask-workspace__claims-title">
              Evaluated Claims ({msg.claims.length})
            </div>
            <div className="ask-workspace__claims-grid">
              {msg.claims.map((claim, cIdx) => (
                <div key={cIdx} className="ask-workspace__claim-item">
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
                      <span style={{ fontSize: '0.625rem', color: '#9CA3AF', lineHeight: 1.3, marginTop: '1px' }}>
                        {claim.status === 'VERIFIED'
                          ? 'Corroborated by independent reporting'
                          : claim.status === 'CONTRADICTED'
                          ? 'Contradicted by identified source(s)'
                          : 'Insufficient independent evidence to verify'}
                      </span>
                    </div>
                  </div>
                  <p className="ask-workspace__claim-text">&ldquo;{claim.text}&rdquo;</p>
                  {claim.explanation && (
                    <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginTop: '4px' }}>
                      {claim.explanation}
                    </div>
                  )}
                  {claim.claimType && (
                    <div style={{
                      marginTop: '6px',
                      paddingTop: '6px',
                      borderTop: '1px solid #F3F4F6',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
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

        {/* Knowledge Graph Entities */}
        {hasEntities && (
          <div>
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

        {/* Living Events */}
        {hasEvents && (
          <div>
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

        {/* Causal Chain if present */}
        {hasCausal && (
          <div className="ask-workspace__causal-section" style={{ marginTop: '8px' }}>
            <div className="ask-workspace__section-heading">
              <span>⤹</span> Causal Sequence & Mechanism
            </div>
            <div className="ask-workspace__causal-grid">
              {Object.entries(msg.causalChain.stages)
                .filter(([_, data]) => data.status !== 'MISSING_EVIDENCE')
                .map(([stage, data]) => (
                  <div key={stage} className="ask-workspace__causal-card">
                    <div className="ask-workspace__causal-header">
                      <span className="ask-workspace__causal-stage">{stage.replace(/_/g, ' ')}</span>
                      <span className={`ask-workspace__causal-badge ${data.status === 'SUPPORTED' ? 'ask-workspace__causal-badge--supported' : 'ask-workspace__causal-badge--inferred'}`}>
                        {data.status}
                      </span>
                    </div>
                    <p className="ask-workspace__causal-desc">{data.description}</p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </details>
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
          directAnswer: data.directAnswer || data.answer || data.executiveSummary || m.content,
          executiveSummary: data.executiveSummary || m.content,
          keyDevelopments: data.keyDevelopments || [],
          evidenceDrawer: data.evidenceDrawer || null,
          queryIntent: data.queryIntent || null,
          evidenceSufficiency: data.evidenceSufficiency || null,
          currentStatus: data.currentStatus,
          temporalIntent: data.temporalIntent,
          theVerifiedPicture: data.theVerifiedPicture,
          provenance: data.provenance || 'NEWS REPORTING',
          claims: data.claims || [],
          sources: data.sources || [],
          moreSources: data.moreSources || [],
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
        directAnswer: result.directAnswer || result.answer,
        executiveSummary: result.executiveSummary || result.answer,
        keyDevelopments: result.keyDevelopments || [],
        evidenceDrawer: result.evidenceDrawer || null,
        queryIntent: result.queryIntent || null,
        evidenceSufficiency: result.evidenceSufficiency || null,
        currentStatus: result.currentStatus,
        temporalIntent: result.temporalIntent,
        theVerifiedPicture: result.theVerifiedPicture,
        provenance: result.provenance || 'NEWS REPORTING',
        claims: result.claims || [],
        sources: result.sources || [],
        moreSources: result.moreSources || [],
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
                      <ProvenanceBadge provenance={msg.provenance} />
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

                    {/* MODE-SPECIFIC INTELLIGENCE FLOW (Part 20 & 21) */}
                    {msg.mode === 'fact_check' ? (
                      /* ================= FACT CHECK MODE ================= */
                      <>
                        {/* The Verified Picture Callout */}
                        {msg.theVerifiedPicture && (
                          <div className="ask-workspace__verified-callout">
                            <div className="ask-workspace__verified-title">
                              <span>✓</span> The Verified Picture
                            </div>
                            <p className="ask-workspace__verified-text">{msg.theVerifiedPicture}</p>
                          </div>
                        )}

                        {/* Direct editorial synthesis */}
                        <div className="ask-workspace__report-body">
                          {(msg.executiveSummary || msg.answer || '')
                            .split('\n\n')
                            .map((paragraph, pIdx) => (
                              <CleanParagraph key={pIdx} text={paragraph} />
                            ))}
                        </div>

                        {/* Evaluated Claims Grid with Badges */}
                        {msg.claims && msg.claims.length > 0 && (
                          <div className="ask-workspace__claims-section">
                            <div className="ask-workspace__claims-title">
                              Evaluated Claims ({msg.claims.length})
                            </div>
                            <div className="ask-workspace__claims-grid">
                              {msg.claims.map((claim, cIdx) => (
                                <div key={cIdx} className="ask-workspace__claim-item">
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
                                      <span style={{ fontSize: '0.625rem', color: '#9CA3AF', lineHeight: 1.3, marginTop: '1px' }}>
                                        {claim.status === 'VERIFIED'
                                          ? 'Corroborated by independent reporting'
                                          : claim.status === 'CONTRADICTED'
                                          ? 'Contradicted by identified source(s)'
                                          : 'Insufficient independent evidence to verify'}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="ask-workspace__claim-text">&ldquo;{claim.text}&rdquo;</p>
                                  {claim.explanation && (
                                    <div style={{ fontSize: '0.6875rem', color: '#6B7280', marginTop: '4px' }}>
                                      {claim.explanation}
                                    </div>
                                  )}
                                  {claim.claimType && (
                                    <div style={{
                                      marginTop: '6px',
                                      paddingTop: '6px',
                                      borderTop: '1px solid #F3F4F6',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}>
                                      <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
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

                        {/* Sources */}
                        <SourcesSection sources={msg.sources} moreSources={msg.moreSources} />
                      </>
                    ) : msg.mode === 'research' ? (
                      /* ================= RESEARCH MODE ================= */
                      <>
                        {/* Executive Synthesis */}
                        <div className="ask-workspace__report-body">
                          {(msg.executiveSummary || msg.answer || '')
                            .split('\n\n')
                            .map((paragraph, pIdx) => (
                              <CleanParagraph key={pIdx} text={paragraph} />
                            ))}
                        </div>

                        {/* Key Developments */}
                        <KeyDevelopmentsList developments={msg.keyDevelopments} />

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
                                      <span className="ask-workspace__causal-stage">{stage.replace(/_/g, ' ')}</span>
                                      <span className={`ask-workspace__causal-badge ${data.status === 'SUPPORTED' ? 'ask-workspace__causal-badge--supported' : 'ask-workspace__causal-badge--inferred'}`}>
                                        {data.status}
                                      </span>
                                    </div>
                                    <p className="ask-workspace__causal-desc">{data.description}</p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* ML Forecast Card */}
                        <MLForecastCard forecast={msg.mlForecast} mode={msg.mode} queryIntent={msg.queryIntent} />

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

                        {/* Sources */}
                        <SourcesSection sources={msg.sources} moreSources={msg.moreSources} />
                      </>
                    ) : (
                      /* ================= ASK MODE (ANSWER-FIRST HIERARCHY) ================= */
                      <>
                        {/* 1. Direct Answer */}
                        <div className="ask-workspace__report-body">
                          {(msg.directAnswer || msg.executiveSummary || msg.answer || '')
                            .split('\n\n')
                            .map((paragraph, pIdx) => (
                              <CleanParagraph key={pIdx} text={paragraph} />
                            ))}
                        </div>

                        {/* 2. Key Developments Cards */}
                        <KeyDevelopmentsList developments={msg.keyDevelopments} />

                        {/* 3. Primary Evidence Sources */}
                        <SourcesSection sources={msg.sources} moreSources={msg.moreSources} />

                        {/* 4. Collapsible Evidence & Verification Drawer */}
                        <EvidenceDrawer msg={msg} />

                        {/* 5. Forecast ONLY IF user explicitly requested a forecast */}
                        <MLForecastCard forecast={msg.mlForecast} mode={msg.mode} queryIntent={msg.queryIntent} />
                      </>
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
