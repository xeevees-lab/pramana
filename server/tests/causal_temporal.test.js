import { describe, it, expect } from 'vitest';
import { assembleCausalChain, CAUSAL_STAGES } from '../src/services/intelligence/causalEngine.js';
import { buildTemporalSequence } from '../src/services/intelligence/temporalEngine.js';

describe('Causal & Temporal Reasoning Engine', () => {
  it('initializes all 9 causal stages and explicitly reports missing evidence', async () => {
    const { stages, summaryCausalChain } = await assembleCausalChain({
      articles: [],
      claims: [],
    });

    for (const stage of CAUSAL_STAGES) {
      expect(stages[stage]).toBeDefined();
      expect(stages[stage].status).toBe('MISSING_EVIDENCE');
      expect(stages[stage].description).toContain('not documented');
    }

    expect(summaryCausalChain).toContain('Evidence for a complete causal sequence is not currently available');
  });

  it('populates directly supported causal relationships from pre-recorded evidence', async () => {
    const existingCausalLinks = [
      {
        relationship_type: 'trigger',
        cause_text: 'Monsoon cloudburst dumping 240mm rain',
        effect_text: 'Bagmati river breaches concrete floodwalls',
        is_directly_supported: true,
        confidence: 0.95,
        evidence_refs: [{ source: 'Meteorological Division' }],
      },
      {
        relationship_type: 'amplifier',
        cause_text: 'Unplanned urban expansion encroaching on river floodplains',
        effect_text: 'Drainage blockage worsening neighborhood inundation',
        is_directly_supported: false,
        confidence: 0.7,
        evidence_refs: [],
      },
    ];

    const { stages } = await assembleCausalChain({
      existingCausalLinks,
      articles: [],
    });

    expect(stages.trigger.status).toBe('SUPPORTED');
    expect(stages.trigger.description).toContain('Monsoon cloudburst');

    expect(stages.amplifiers.status).toBe('INFERRED');
    expect(stages.amplifiers.description).toContain('Unplanned urban expansion');
  });

  it('orders temporal milestones chronologically and categorizes phases', () => {
    const articles = [
      {
        id: 'art-1',
        title: 'Emergency Flood Relief Distributed to Families',
        summary: 'Red Cross delivers tarpaulins.',
        published_at: '2026-09-09T10:00:00Z',
        source_name: 'Reuters',
      },
      {
        id: 'art-2',
        title: 'Torrential Rain Triggers Flash Floods',
        summary: 'Cloudburst begins at midnight.',
        published_at: '2026-09-09T01:00:00Z',
        source_name: 'AP',
      },
      {
        id: 'art-3',
        title: 'Meteorological Warning Issued for Heavy Rainfall',
        summary: 'Weather department advises caution.',
        published_at: '2026-09-08T18:00:00Z',
        source_name: 'Met Dept',
      },
    ];

    const { timeline, firstEvent, latestEvent } = buildTemporalSequence({ articles });

    expect(timeline.length).toBe(3);
    // Chronological order: Met Dept first, then AP, then Reuters
    expect(firstEvent.title).toContain('Meteorological Warning');
    expect(firstEvent.phase).toBe('TRIGGER_POINT');
    expect(latestEvent.title).toContain('Emergency Flood Relief');
    expect(['AFTERMATH', 'SUBSEQUENT']).toContain(latestEvent.phase);
  });
});
