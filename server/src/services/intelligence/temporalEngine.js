/**
 * Build a structured temporal sequence from articles, claims, and event timestamps.
 *
 * Categories:
 * - BEFORE (preconditions, antecedent context)
 * - TRIGGER_POINT (initiating incident)
 * - DURING (ongoing developments)
 * - AFTERMATH (immediate rescue, damage reports)
 * - SUBSEQUENT (policy changes, trials, long-term impacts)
 *
 * @param {object} params
 * @param {object} params.event
 * @param {Array<object>} params.articles
 * @param {Array<object>} params.claims
 * @returns {{
 *   timeline: Array<{
 *     id: string,
 *     timestamp: string,
 *     phase: 'BEFORE'|'TRIGGER_POINT'|'DURING'|'AFTERMATH'|'SUBSEQUENT',
 *     title: string,
 *     description: string,
 *     source: string,
 *     url?: string
 *   }>,
 *   firstEvent: object|null,
 *   latestEvent: object|null
 * }}
 */
export function buildTemporalSequence({
  event = {},
  articles = [],
  claims = [],
}) {
  const rawMilestones = [];

  // 1. Articles with publication dates
  for (const art of articles) {
    if (art.published_at && art.title) {
      rawMilestones.push({
        id: `art-${art.id}`,
        timestamp: new Date(art.published_at).toISOString(),
        title: art.title,
        description: art.summary ? art.summary.slice(0, 200) : '',
        source: art.source_name || 'News Dispatch',
        url: art.url || null,
      });
    }
  }

  // 2. Claims with extraction or documented event dates
  for (const clm of claims) {
    if (clm.extracted_at && clm.text) {
      rawMilestones.push({
        id: `clm-${clm.id}`,
        timestamp: new Date(clm.extracted_at).toISOString(),
        title: clm.text,
        description: `Verified Status: ${clm.verification_status}`,
        source: 'Intelligence Extraction',
        url: null,
      });
    }
  }

  // Sort strictly chronologically (earliest to latest)
  rawMilestones.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (rawMilestones.length === 0) {
    return { timeline: [], firstEvent: null, latestEvent: null };
  }

  const firstTime = new Date(rawMilestones[0].timestamp).getTime();
  const lastTime = new Date(rawMilestones[rawMilestones.length - 1].timestamp).getTime();
  const totalDuration = Math.max(1, lastTime - firstTime);

  // Assign temporal phase based on relative progression
  const timeline = rawMilestones.map((m, idx) => {
    const time = new Date(m.timestamp).getTime();
    const progress = totalDuration === 1 ? 0.5 : (time - firstTime) / totalDuration;

    let phase = 'DURING';
    if (idx === 0) {
      phase = 'TRIGGER_POINT';
    } else if (progress < 0.25) {
      phase = 'BEFORE';
    } else if (progress > 0.85) {
      phase = 'SUBSEQUENT';
    } else if (progress > 0.6) {
      phase = 'AFTERMATH';
    }

    return {
      ...m,
      phase,
    };
  });

  return {
    timeline: timeline.slice(0, 20),
    firstEvent: timeline[0] || null,
    latestEvent: timeline[timeline.length - 1] || null,
  };
}
