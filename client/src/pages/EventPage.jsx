import { useParams } from 'react-router-dom';

export default function EventPage() {
  const { id } = useParams();

  return (
    <>
      <div className="empty-state">
        <div className="empty-state__icon" aria-hidden="true">◎</div>
        <h2 className="empty-state__title">Event Not Found</h2>
        <p className="empty-state__text">
          Event "{id}" does not exist in the database. Events are created through the
          ingestion pipeline when real news sources are processed.
        </p>
      </div>
    </>
  );
}
