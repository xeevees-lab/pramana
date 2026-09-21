import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import '../styles/article-dossier.css';

function formatDate(dateString) {
  if (!dateString) return 'Recent';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return dateString;
  }
}

export default function ArticlePage() {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    api.get(`/articles/${id}`)
      .then((data) => {
        if (!mounted) return;
        setArticle(data.article || data);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to load article details.');
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="loading" style={{ minHeight: '60vh' }}>
        <div className="loading__spinner" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="empty-state" style={{ maxWidth: '640px', margin: '4rem auto', textAlign: 'center' }}>
        <div className="empty-state__icon" aria-hidden="true" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◈</div>
        <h2 className="empty-state__title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>Article Dispatch Unavailable</h2>
        <p className="empty-state__text" style={{ color: 'var(--color-ink-tertiary)' }}>
          {error || 'The requested article could not be found or has not yet been processed.'}
        </p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/explore" className="btn btn--secondary">
            ← Return to Explore
          </Link>
        </div>
      </div>
    );
  }

  const {
    title,
    summary,
    author,
    published_at,
    url: sourceUrl,
    source_name,
    source_reliability,
    image_url,
    image_attribution,
    category,
    event,
    claims = [],
    relatedEvents = [],
  } = article;

  return (
    <article className="article-dossier-wrap" aria-labelledby="article-headline">
      {/* 1. Navigation Breadcrumb */}
      <nav aria-label="Breadcrumb" className="article-dossier__breadcrumb">
        <Link to="/explore" className="article-dossier__back-link">
          ← Back to Living Intelligence
        </Link>
      </nav>

      {/* 2. Article Header */}
      <header className="article-dossier__header">
        <div className="article-dossier__tags">
          {category && (
            <span className={`category-tag category-tag--${category.toLowerCase()}`}>
              {category}
            </span>
          )}
          {source_name && (
            <span className="article-dossier__source-badge">
              {source_name}
            </span>
          )}
          {source_reliability && (
            <span className="article-dossier__reliability">
              {(source_reliability * 100).toFixed(0)}% Reliability
            </span>
          )}
        </div>

        <h1 id="article-headline" className="article-dossier__headline">
          {title}
        </h1>

        <div className="article-dossier__meta-row">
          {author && <span className="article-dossier__meta-author">By <strong>{author}</strong></span>}
          <span>{formatDate(published_at)}</span>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="article-dossier__original-link"
            >
              Original Dispatch Source ↗
            </a>
          )}
        </div>
      </header>

      {/* 3. Article Image (if present) */}
      {image_url && (
        <figure className="article-dossier__figure">
          <img
            src={image_url}
            alt={title}
            className="article-dossier__image"
          />
          {image_attribution && (
            <figcaption className="article-dossier__figcaption">
              {image_attribution}
            </figcaption>
          )}
        </figure>
      )}

      {/* 4. Article Summary / Excerpt */}
      <div className="article-dossier__body">
        <p>{summary}</p>
      </div>

      {/* 5. CONNECTED PRAMĀṆA KNOWLEDGE GRAPH */}
      <section className="article-knowledge-card">
        <div className="article-knowledge-card__header">
          <span className="article-knowledge-card__icon">◈</span>
          <h2 className="article-knowledge-card__title">
            Connected PRAMĀṆA Knowledge Graph
          </h2>
        </div>
        <p className="article-knowledge-card__desc">
          This article has been processed, cross-referenced with global newsfeeds, and clustered into PRAMĀṆA&apos;s living multi-source intelligence model.
        </p>

        {/* Linked Living Event */}
        {event ? (
          <div className="article-linked-event">
            <span className="article-linked-event__label">
              Linked Living Event:
            </span>
            <h3 className="article-linked-event__title">
              <Link to={`/event/${event.id}`}>
                {event.title} ↗
              </Link>
            </h3>
            {event.summary && (
              <p className="article-linked-event__summary">
                {event.summary}
              </p>
            )}
            <div className="article-linked-event__meta">
              <span>Status: <strong>{event.status || 'Verified'}</strong></span>
              <span>·</span>
              <span>Severity: <strong>{event.severity || 'Normal'}</strong></span>
              <span>·</span>
              <span>{event.source_count || 1} corroborating source(s)</span>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-tertiary)', fontStyle: 'italic', marginBottom: '1rem' }}>
            This article is awaiting clustering into an active living event dossier.
          </div>
        )}

        {/* Evaluated Claims Extracted from this Dispatch */}
        {claims.length > 0 && (
          <div className="article-claims-section">
            <span className="article-section-subhead">
              Extracted Assertions &amp; Claim Status ({claims.length}):
            </span>
            <div className="article-claims-list">
              {claims.map((claim, idx) => (
                <div key={claim.id || idx} className="article-claim-item">
                  <span
                    className={`badge ${
                      claim.verification_status === 'VERIFIED'
                        ? 'badge--verified'
                        : claim.verification_status === 'CONTRADICTED'
                        ? 'badge--contradicted'
                        : 'badge--unverified'
                    }`}
                    style={{ fontSize: '0.625rem', flexShrink: 0 }}
                  >
                    {claim.verification_status}
                  </span>
                  <span className="article-claim-text">
                    &ldquo;{claim.claim_text || claim.text}&rdquo;
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Living Events */}
        {relatedEvents.length > 0 && (
          <div className="article-related-events-section">
            <span className="article-section-subhead">
              Related Contextual Events:
            </span>
            <div className="article-related-chips">
              {relatedEvents.map((rel) => (
                <Link
                  key={rel.id}
                  to={`/event/${rel.id}`}
                  className="article-related-chip"
                >
                  {rel.title} ↗
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
