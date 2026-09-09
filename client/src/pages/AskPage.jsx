export default function AskPage() {
  return (
    <>
      <h1 className="page-title">Ask PRAMĀṆA</h1>
      <p className="page-subtitle">
        Ask a question. Get an evidence-based answer with sources.
      </p>

      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◇</div>
        <h2 className="empty-state__title">RAG System Not Yet Active</h2>
        <p className="empty-state__text">
          The retrieval-augmented generation system requires configured databases, embeddings,
          and a Gemini API key. It will be activated in Phase 5.
        </p>
      </div>
    </>
  );
}
