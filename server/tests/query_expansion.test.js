import { describe, it, expect } from 'vitest';
import { expandQuery, pruneHypotheses } from '../src/services/research/queryExpander.js';

describe('Query Understanding & Hypothesis Pruning', () => {
  it('deconstructs query into candidate search hypotheses and entities', async () => {
    const result = await expandQuery('Tell me about the Nepal floods and landslides in Kathmandu');

    expect(result.originalQuery).toContain('Nepal floods');
    expect(result.targetEntities.some(e => e.includes('Nepal') || e.includes('Kathmandu'))).toBe(true);
    expect(result.candidateHypotheses.length).toBeGreaterThan(0);
    expect(result.searchKeywords.length).toBeGreaterThan(0);
    expect(result.expandedQueryString).toBeDefined();
  });

  it('prunes unsupported search hypotheses against retrieved dispatches', () => {
    const candidateHypotheses = [
      'monsoon rainfall and river overflow',
      'landslide blocking road transportation',
      'asteroid impact triggering atmospheric wave',
      'coastal storm surge and naval submarine collision',
    ];

    const retrievedArticles = [
      {
        title: 'Nepal Monsoon Floods Kill Dozens as Rivers Overflow in Kathmandu',
        summary: 'Record rainfall caused swollen rivers to breach floodwalls, triggering fatal landslides and blocking highways.',
      },
      {
        title: 'Rescue Operations Underway in Flood-Hit Nepal Settlements',
        summary: 'Emergency services deployed rafts to evacuate stranded families as rain continued.',
      },
    ];

    const retrievedClaims = [
      { text: 'Over 200mm of monsoon rain was recorded within 24 hours in Bagmati province.' },
      { text: 'Multiple landslides obstructed major highways connecting to the capital.' },
    ];

    const { supportedHypotheses, unsupportedHypotheses } = pruneHypotheses(
      candidateHypotheses,
      retrievedArticles,
      retrievedClaims
    );

    // Supported hypotheses should be retained
    const supportedTexts = supportedHypotheses.map(h => h.hypothesis);
    expect(supportedTexts).toContain('monsoon rainfall and river overflow');
    expect(supportedTexts).toContain('landslide blocking road transportation');

    // Unsupported hypotheses must be discarded
    expect(unsupportedHypotheses).toContain('asteroid impact triggering atmospheric wave');
    expect(unsupportedHypotheses).toContain('coastal storm surge and naval submarine collision');
  });

  it('handles empty or malformed queries safely without throwing', async () => {
    const empty = await expandQuery('');
    expect(empty.targetEntities).toEqual([]);
    expect(empty.candidateHypotheses).toEqual([]);

    const prunedEmpty = pruneHypotheses([], []);
    expect(prunedEmpty.supportedHypotheses).toEqual([]);
    expect(prunedEmpty.unsupportedHypotheses).toEqual([]);
  });
});
