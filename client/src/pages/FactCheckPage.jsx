export default function FactCheckPage() {
  return (
    <>
      <h1 className="page-title">Fact Check</h1>
      <p className="page-subtitle">
        Submit a URL, text, or image for claim verification.
      </p>

      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◆</div>
        <h2 className="empty-state__title">Verification System Not Yet Active</h2>
        <p className="empty-state__text">
          The claim verification pipeline requires configured databases, evidence retrieval,
          and the Gemini API. It will be activated in Phase 6.
        </p>
      </div>
    </>
  );
}
