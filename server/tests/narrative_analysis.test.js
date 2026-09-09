import { describe, it, expect } from 'vitest';
import { analyzeNarratives } from '../src/services/intelligence/narrativeAnalyzer.js';

describe('Cross-Source Narrative Analysis', () => {
  it('identifies observable framing differences between reporting outlets', async () => {
    const articles = [
      {
        source_name: 'Reuters',
        title: 'Torrential Monsoon Rainfall Breaches Dams in Kathmandu Valley',
        summary: 'Heavy rainfall and climate patterns trigger worst flooding in decades.',
      },
      {
        source_name: 'The Himalayan Times',
        title: 'Over 60 Dead as Landslides Bury Homes Across Central Districts',
        summary: 'Death toll rises as rescue workers sift through debris.',
      },
      {
        source_name: 'Kathmandu Post',
        title: 'Experts Criticize Government for Ignoring Early Flood Warnings and Poor Drainage',
        summary: 'Failure to prepare and river encroachment worsened the catastrophe.',
      },
    ];

    const result = await analyzeNarratives(articles);

    expect(result.framingDistribution.length).toBeGreaterThan(0);
    expect(result.sourceFramingComparison.length).toBe(3);
    expect(result.framingObservation).toBeDefined();

    // Verify neutral observation without forbidden words
    const lower = result.framingObservation.toLowerCase();
    expect(lower).not.toContain('biased');
    expect(lower).not.toContain('propaganda');
    expect(lower).not.toContain('fake news');
  }, 15000);

  it('handles single-source or empty articles safely', async () => {
    const empty = await analyzeNarratives([]);
    expect(empty.framingDistribution).toEqual([]);
    expect(empty.framingObservation).toContain('Insufficient');
  });
});
