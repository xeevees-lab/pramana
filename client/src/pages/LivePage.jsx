export default function LivePage() {
  return (
    <>
      <h1 className="page-title">Live</h1>
      <p className="page-subtitle">
        Real-time changes in the information environment.
      </p>

      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◉</div>
        <h2 className="empty-state__title">No Live Updates</h2>
        <p className="empty-state__text">
          Live updates will appear here as new events, evidence, claim changes, and narrative
          shifts are detected by the ingestion pipeline.
        </p>
      </div>
    </>
  );
}
