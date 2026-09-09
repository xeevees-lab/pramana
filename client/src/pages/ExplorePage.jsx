export default function ExplorePage() {
  return (
    <>
      <h1 className="page-title">Explore</h1>
      <p className="page-subtitle">
        Browse by topic, region, entity, or event.
      </p>

      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◈</div>
        <h2 className="empty-state__title">Nothing to Explore Yet</h2>
        <p className="empty-state__text">
          Topics, entities, and regions will be indexed here as the knowledge graph is populated
          through news ingestion.
        </p>
      </div>
    </>
  );
}
