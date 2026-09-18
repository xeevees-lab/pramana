import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';

const REGIONS = [
  {
    id: 'north_america',
    name: 'North America',
    x: 165,
    y: 95,
    keywords: ['us', 'usa', 'united states', 'america', 'american', 'canada', 'trump', 'biden', 'washington', 'clancy', 'ford'],
  },
  {
    id: 'latin_america',
    name: 'Latin America',
    x: 235,
    y: 195,
    keywords: ['latin america', 'brazil', 'mexico', 'colombia', 'argentina', 'venezuela', 'cuba', 'chile'],
  },
  {
    id: 'europe_uk',
    name: 'Europe & UK',
    x: 375,
    y: 85,
    keywords: ['europe', 'uk', 'britain', 'british', 'france', 'french', 'germany', 'london', 'ireland', 'italy', 'spain', 'eu', 'parliament'],
  },
  {
    id: 'eastern_europe',
    name: 'Eastern Europe',
    x: 430,
    y: 75,
    keywords: ['russia', 'russian', 'ukraine', 'ukrainian', 'poland', 'moscow', 'kyiv', 'belarus'],
  },
  {
    id: 'middle_east',
    name: 'Middle East',
    x: 440,
    y: 120,
    keywords: ['middle east', 'iran', 'iranian', 'israel', 'israeli', 'gaza', 'syria', 'jordan', 'yemen', 'saudi', 'iraq', 'lebanon', 'palestine', 'west bank'],
  },
  {
    id: 'africa',
    name: 'Africa',
    x: 390,
    y: 160,
    keywords: ['africa', 'african', 'nigeria', 'nigerian', 'sudan', 'kenya', 'south africa', 'congo', 'ethiopia', 'sharpeville'],
  },
  {
    id: 'south_asia',
    name: 'India & South Asia',
    x: 495,
    y: 130,
    keywords: ['india', 'indian', 'delhi', 'mumbai', 'pakistan', 'bangladesh', 'nepal', 'sri lanka', 'modi', 'brics'],
  },
  {
    id: 'east_asia',
    name: 'East Asia',
    x: 550,
    y: 105,
    keywords: ['china', 'chinese', 'beijing', 'japan', 'japanese', 'tokyo', 'korea', 'taiwan', 'hong kong'],
  },
  {
    id: 'southeast_asia',
    name: 'Southeast Asia',
    x: 545,
    y: 165,
    keywords: ['indonesia', 'vietnam', 'philippines', 'singapore', 'thailand', 'malaysia', 'myanmar'],
  },
  {
    id: 'oceania',
    name: 'Oceania',
    x: 610,
    y: 215,
    keywords: ['australia', 'australian', 'sydney', 'new zealand', 'pacific'],
  },
];

export default function GlobalActivityMap({ events = [] }) {
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'

  // Match real events to regions based on verified entity/text mention
  const regionalData = useMemo(() => {
    return REGIONS.map((region) => {
      const matchingEvents = events.filter((e) => {
        const text = `${e.title || ''} ${e.summary || ''} ${e.location_name || ''} ${e.country_code || ''}`.toLowerCase();
        return region.keywords.some((kw) => {
          // Word boundary regex to avoid partial substring false positives
          const regex = new RegExp(`\\b${kw}\\b`, 'i');
          return regex.test(text);
        });
      });

      return {
        ...region,
        events: matchingEvents,
        count: matchingEvents.length,
      };
    });
  }, [events]);

  const activeRegions = regionalData.filter((r) => r.count > 0);
  const selectedRegion = regionalData.find((r) => r.id === selectedRegionId) || (activeRegions[0] || null);

  return (
    <div className="global-activity-card">
      <div className="global-activity-header">
        <div>
          <div className="global-activity-label">GEOGRAPHIC SIGNALS</div>
          <h3 className="global-activity-title">Global Activity</h3>
        </div>
        <div className="global-activity-controls">
          <span className="global-activity-badge">
            {activeRegions.length} Active Regions
          </span>
          <div className="global-activity-tabs" role="tablist">
            <button
              type="button"
              className={`global-activity-tab ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
              aria-label="World Map View"
            >
              Map
            </button>
            <button
              type="button"
              className={`global-activity-tab ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="Regional List View"
            >
              Regional List
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'map' ? (
        <div className="global-activity-map-container">
          <svg
            viewBox="0 0 720 320"
            className="global-activity-svg"
            role="img"
            aria-label="Minimalist Global Activity Map"
          >
            <defs>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Ocean background */}
            <rect width="720" height="320" fill="var(--color-surface)" />

            {/* Subtle grid latitude/longitude lines */}
            <line x1="0" y1="80" x2="720" y2="80" stroke="var(--color-border-light)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1="0" y1="160" x2="720" y2="160" stroke="var(--color-border)" strokeWidth="0.8" strokeDasharray="4 4" />
            <line x1="0" y1="240" x2="720" y2="240" stroke="var(--color-border-light)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1="180" y1="0" x2="180" y2="320" stroke="var(--color-border-light)" strokeWidth="0.5" strokeDasharray="3 3" />
            <line x1="360" y1="0" x2="360" y2="320" stroke="var(--color-border)" strokeWidth="0.8" strokeDasharray="4 4" />
            <line x1="540" y1="0" x2="540" y2="320" stroke="var(--color-border-light)" strokeWidth="0.5" strokeDasharray="3 3" />

            {/* Minimalist World Continents (Light Grey Outline) */}
            <g fill="var(--color-surface-tertiary)" stroke="var(--color-border)" strokeWidth="1" strokeLinejoin="round">
              {/* North America */}
              <path d="M 80 40 L 140 35 L 210 45 L 240 70 L 220 100 L 190 120 L 170 145 L 145 140 L 130 115 L 105 105 L 85 75 Z" />
              {/* Greenland */}
              <path d="M 250 25 L 290 20 L 295 45 L 260 55 Z" />
              {/* South America */}
              <path d="M 190 155 L 230 160 L 260 190 L 250 240 L 230 280 L 210 270 L 200 210 L 185 175 Z" />
              {/* Europe & Western Eurasia */}
              <path d="M 340 50 L 375 40 L 410 45 L 440 60 L 420 85 L 395 95 L 360 90 L 345 75 Z" />
              {/* United Kingdom & Ireland */}
              <path d="M 330 60 L 342 55 L 340 70 L 332 72 Z" />
              {/* Africa */}
              <path d="M 345 105 L 405 100 L 440 140 L 430 190 L 400 240 L 375 235 L 340 160 L 335 125 Z" />
              {/* Asia / Russia */}
              <path d="M 440 45 L 530 40 L 610 50 L 650 75 L 620 110 L 565 110 L 530 135 L 485 120 L 450 90 Z" />
              {/* India / South Asia */}
              <path d="M 470 125 L 515 125 L 505 165 L 485 160 Z" />
              {/* Southeast Asia */}
              <path d="M 540 140 L 575 145 L 585 175 L 550 180 Z" />
              {/* Japan */}
              <path d="M 625 90 L 640 85 L 635 110 L 620 112 Z" />
              {/* Australia & New Zealand */}
              <path d="M 570 200 L 635 195 L 650 240 L 585 245 Z" />
              <path d="M 660 235 L 670 230 L 665 255 Z" />
            </g>

            {/* Regional Event Markers (Real Data Grounded) */}
            {regionalData.map((reg) => {
              if (reg.count === 0) return null;
              const isSelected = selectedRegionId === reg.id;
              const radius = Math.min(10, Math.max(5, 4 + Math.sqrt(reg.count) * 2));

              return (
                <g
                  key={reg.id}
                  className="global-activity-marker-group"
                  onClick={() => setSelectedRegionId(isSelected ? null : reg.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Subtle pulsing outer ripple */}
                  <circle
                    cx={reg.x}
                    cy={reg.y}
                    r={radius + 4}
                    fill="var(--color-accent)"
                    opacity="0.15"
                    className="marker-pulse"
                  />
                  {/* Marker point */}
                  <circle
                    cx={reg.x}
                    cy={reg.y}
                    r={radius}
                    fill={isSelected ? 'var(--color-accent-hover)' : 'var(--color-accent)'}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    filter="url(#glow)"
                  />
                  {/* Marker label */}
                  <text
                    x={reg.x}
                    y={reg.y - radius - 4}
                    textAnchor="middle"
                    fill="var(--color-ink-secondary)"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="var(--font-sans)"
                  >
                    {reg.count}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Interactive Inspection Drawer/Card */}
          {selectedRegion && selectedRegion.count > 0 && (
            <div className="global-activity-popover">
              <div className="global-activity-popover-header">
                <div>
                  <span className="global-activity-popover-tag">REGIONAL CLUSTER</span>
                  <h4 className="global-activity-popover-title">{selectedRegion.name}</h4>
                </div>
                <span className="global-activity-popover-count">
                  {selectedRegion.count} verified event{selectedRegion.count === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="global-activity-popover-list">
                {selectedRegion.events.slice(0, 3).map((ev) => (
                  <li key={ev.id} className="global-activity-popover-item">
                    <Link to={`/event/${ev.id}`} className="global-activity-popover-link">
                      <span className="popover-bullet">●</span>
                      <span className="popover-text">{ev.title}</span>
                      <span className="popover-meta">{ev.source_count || 1} sources</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        /* Regional Breakdown List View */
        <div className="global-activity-list-container">
          <table className="global-activity-table">
            <thead>
              <tr>
                <th>REGION</th>
                <th>EVENTS</th>
                <th>PRIMARY SIGNAL</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {regionalData.map((reg) => (
                <tr key={reg.id} className={reg.count > 0 ? 'active-row' : 'empty-row'}>
                  <td className="region-name-cell">
                    <span className={`status-indicator ${reg.count > 0 ? 'active' : 'idle'}`} />
                    {reg.name}
                  </td>
                  <td className="region-count-cell">
                    <strong>{reg.count}</strong>
                  </td>
                  <td className="region-signal-cell">
                    {reg.count > 0 ? (
                      <span className="region-signal-title">
                        {reg.events[0]?.title}
                      </span>
                    ) : (
                      <span className="region-signal-none">No active dossiers</span>
                    )}
                  </td>
                  <td>
                    {reg.count > 0 && reg.events[0] && (
                      <Link to={`/event/${reg.events[0].id}`} className="btn-table-link">
                        View Dossier &rarr;
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
