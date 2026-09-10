import { describe, it, expect } from 'vitest';
import { detectQueryIntent, expandQuery } from '../src/services/research/queryExpander.js';
import { classifyTextTaxonomy, EVENT_TAXONOMY, TAXONOMY_CATEGORIES } from '../src/services/intelligence/eventTaxonomy.js';
import {
  extractRankerFeatures,
  scoreCandidatePair,
  rankCandidates,
  setRankerStrategy,
} from '../src/services/ml/newsRanker.js';
import {
  evaluateEvidenceSufficiency,
  determineSourceTier,
} from '../src/services/research/externalResearcher.js';
import { processResearchQuery } from '../src/services/research/askEngine.js';

describe('Trainable News Intelligence & Multi-Source Synthesis', () => {
  describe('Query Intent Engine (Part 6 & 7)', () => {
    it('detects PRODUCT_LAUNCH and MODEL_RELEASE intents with expected event types', () => {
      const intent1 = detectQueryIntent('Did Apple launch the new M4 MacBook Pro?');
      expect(intent1.primaryIntent).toBe('PRODUCT_LAUNCH');
      expect(intent1.expectedEventTypes).toContain('PRODUCT_LAUNCH');

      const intent2 = detectQueryIntent('OpenAI released new reasoning model weights');
      expect(intent2.primaryIntent).toBe('MODEL_RELEASE');
      expect(intent2.expectedEventTypes).toContain('MODEL_RELEASE');
    });

    it('detects LATEST_NEWS intent and marks isBroadNewsQuery for broad overviews', () => {
      const intent = detectQueryIntent('What is the latest news in AI technology?');
      expect(intent.primaryIntent).toBe('LATEST_NEWS');
      expect(intent.isBroadNewsQuery).toBe(true);
      expect(intent.expectedEventTypes).toContain('PRODUCT_LAUNCH');
      expect(intent.expectedEventTypes).toContain('MODEL_RELEASE');
    });

    it('detects FORECAST intent and flags forecastRequested', () => {
      const intent = detectQueryIntent('Will the river flooding worsen tomorrow in Kathmandu?');
      expect(intent.forecastRequested).toBe(true);
      expect(intent.primaryIntent).toBe('FORECAST');
    });

    it('detects DISASTER_STATUS and CASUALTY intents', () => {
      const intent = detectQueryIntent('How many casualties in the Japan earthquake damage update?');
      expect(intent.intents).toContain('DISASTER_STATUS');
      expect(intent.expectedEventTypes).toContain('DISASTER');
    });

    it('detects RESEARCH_FINDING intent', () => {
      const intent = detectQueryIntent('New study researchers published on European political integration');
      expect(intent.intents).toContain('RESEARCH_FINDING');
      expect(intent.expectedEventTypes).toContain('RESEARCH_FINDING');
    });

    it('integrates intent detection cleanly into expandQuery', async () => {
      const expanded = await expandQuery('Has Google released Gemini 2.0 officially?');
      expect(expanded.queryIntent).toBeDefined();
      expect(expanded.queryIntent.expectedEventTypes).toBeDefined();
      expect(expanded.queryIntent.expectedEventTypes.length).toBeGreaterThan(0);
    });
  });

  describe('News Event Taxonomy (Part 3 & 4)', () => {
    it('contains all 26 required taxonomy categories', () => {
      expect(TAXONOMY_CATEGORIES.length).toBe(26);
      expect(Object.keys(EVENT_TAXONOMY).length).toBe(26);
      expect(TAXONOMY_CATEGORIES).toContain('PRODUCT_LAUNCH');
      expect(TAXONOMY_CATEGORIES).toContain('MODEL_RELEASE');
      expect(TAXONOMY_CATEGORIES).toContain('RESEARCH_FINDING');
      expect(TAXONOMY_CATEGORIES).toContain('POLICY');
      expect(TAXONOMY_CATEGORIES).toContain('DISASTER');
    });

    it('classifies product launch dispatches accurately', () => {
      const result = classifyTextTaxonomy(
        'Apple unveils M4 chip and introduces new MacBook Pro models',
        'The company officially released its latest hardware lineup with pre-orders beginning today.'
      );
      expect(result.eventTypes).toContain('PRODUCT_LAUNCH');
      expect(result.eventTypeScores.PRODUCT_LAUNCH).toBeGreaterThan(0);
    });

    it('classifies model release dispatches accurately', () => {
      const result = classifyTextTaxonomy(
        'Anthropic releases Claude 3.5 Sonnet frontier AI model',
        'The new model architecture improves reasoning benchmarks and open weights are now available for developers via API.'
      );
      expect(result.eventTypes).toContain('MODEL_RELEASE');
    });

    it('distinguishes scientific research findings from disaster reports', () => {
      const research = classifyTextTaxonomy(
        'Study reveals new biomarkers for cognitive decline in clinical trials',
        'Researchers published peer-reviewed findings in the journal Nature demonstrating correlation.'
      );
      expect(research.eventTypes).toContain('RESEARCH_FINDING');
      expect(research.eventTypes).not.toContain('DISASTER');

      const disaster = classifyTextTaxonomy(
        'Death toll rises as massive landslides destroy homes in Kathmandu valley',
        'Rescue teams recovered victims from collapsed buildings following monsoon floods.'
      );
      expect(disaster.eventTypes).toContain('DISASTER');
    });
  });

  describe('Trainable Relevance Model & Ranker (Part 8, 9, 10, 11)', () => {
    const mockQuery = {
      originalQuery: 'Apple M4 MacBook launch date and specs',
      keywords: ['apple', 'm4', 'macbook', 'specs'],
      targetEntities: ['Apple', 'MacBook'],
      queryIntent: {
        primaryIntent: 'PRODUCT_LAUNCH',
        expectedEventTypes: ['PRODUCT_LAUNCH', 'MODEL_RELEASE'],
        demotedEventTypes: ['COURT_DECISION'],
      },
    };

    const relevantLaunchArticle = {
      id: 1,
      title: 'Apple Announces New MacBook Pro Powered by Next-Gen M4 Processor',
      summary: 'Apple today launched its upgraded MacBook line with high-performance M4 silicon and expanded memory options.',
      content: 'Full details of the launch announcement and pricing.',
      source_name: 'Reuters',
      reliability_score: 0.95,
      source_tier: 'PRIMARY_SOURCE',
      published_at: new Date().toISOString(),
      event_types: ['PRODUCT_LAUNCH'],
      event_type_scores: { PRODUCT_LAUNCH: 0.9 },
      vector_similarity: 0.85,
    };

    const offTopicArticle = {
      id: 2,
      title: 'Antitrust Lawsuit Filed Against Tech Giants Regarding App Store Policies',
      summary: 'Regulators filed legal complaint alleging anti-competitive practices in mobile store distribution.',
      content: 'Court filings and hearing dates.',
      source_name: 'Blog News',
      reliability_score: 0.50,
      source_tier: 'SECONDARY_ANALYSIS',
      published_at: '2023-01-01T00:00:00Z',
      event_types: ['COURT_DECISION'],
      event_type_scores: { COURT_DECISION: 0.8 },
      vector_similarity: 0.40,
    };

    it('extracts all 16 normalized feature values', () => {
      const features = extractRankerFeatures(mockQuery, relevantLaunchArticle);
      expect(Object.keys(features).length).toBe(16);
      for (const [name, val] of Object.entries(features)) {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
      expect(features.event_type_match).toBeGreaterThan(0.5);
    });

    it('scores relevant product launch higher than off-topic article', () => {
      const scoreHigh = scoreCandidatePair(mockQuery, relevantLaunchArticle);
      const scoreLow = scoreCandidatePair(mockQuery, offTopicArticle);

      expect(scoreHigh).toBeGreaterThan(scoreLow);
    });

    it('ranks candidate list correctly and attaches ranker score', () => {
      const candidates = [offTopicArticle, relevantLaunchArticle];
      const ranked = rankCandidates(mockQuery, candidates);

      expect(ranked[0].id).toBe(relevantLaunchArticle.id);
      expect(ranked[0].ranker_score).toBeGreaterThan(ranked[1].ranker_score);
    });

    it('supports feature flag fallback to LEGACY_RANKER strategy safely', () => {
      setRankerStrategy('LEGACY_RANKER');
      const rankedLegacy = rankCandidates(mockQuery, [offTopicArticle, relevantLaunchArticle]);
      expect(rankedLegacy.length).toBe(2);

      setRankerStrategy('NEW_NEWS_RANKER');
      const rankedNew = rankCandidates(mockQuery, [offTopicArticle, relevantLaunchArticle]);
      expect(rankedNew.length).toBe(2);
      expect(rankedNew[0].id).toBe(relevantLaunchArticle.id);
    });
  });

  describe('Authoritative External Research & Sufficiency Gate (Part 12, 13, 14)', () => {
    it('evaluates sufficiency correctly', () => {
      const emptyResult = evaluateEvidenceSufficiency('What happened in the accident?', []);
      expect(emptyResult.isSufficient).toBe(false);
      expect(emptyResult.reason).toBe('NO_LOCAL_EVIDENCE');

      const lowQualityArticles = [
        { title: 'Random unrelated note', summary: 'unrelated', _rankScore: 0.2 },
      ];
      const lowResult = evaluateEvidenceSufficiency('What happened in the accident?', lowQualityArticles);
      expect(lowResult.isSufficient).toBe(false);

      const goodArticles = [
        { title: 'Accident reported on highway', summary: 'Emergency response on scene', _rankScore: 0.85 },
        { title: 'Police confirm two vehicles in highway collision', summary: 'Traffic diverted', _rankScore: 0.80 },
      ];
      const sufficientResult = evaluateEvidenceSufficiency('What happened in the accident?', goodArticles);
      expect(sufficientResult.isSufficient).toBe(true);
    });

    it('determines source tiers accurately', () => {
      expect(determineSourceTier({ source_name: 'Reuters', reliability_score: 0.95 })).toBe('PRIMARY_SOURCE');
      expect(determineSourceTier({ url: 'https://nature.com/articles/123' })).toBe('SCIENTIFIC_INSTITUTIONAL');
      expect(determineSourceTier({ url: 'https://who.int/emergencies/disease-outbreak-news' })).toBe('SCIENTIFIC_INSTITUTIONAL');
      expect(determineSourceTier({ source_name: 'BBC News', reliability_score: 0.90 })).toBe('HIGH_QUALITY_NEWS');
    });
  });

  describe('Ask Engine & Answer-First Synthesis (Part 15, 16, 20)', () => {
    it('suppresses ML forecast in Ask mode for non-predictive query', async () => {
      const result = await processResearchQuery({
        query: 'What are the key facts about the Nepal landslides?',
        mode: 'ask',
      });

      expect(result.mode).toBe('ask');
      expect(result.directAnswer).toBeDefined();
      expect(result.keyDevelopments).toBeDefined();
      expect(Array.isArray(result.keyDevelopments)).toBe(true);
      expect(result.evidenceDrawer).toBeDefined();

      // Forecast MUST be suppressed for non-predictive Ask queries
      expect(result.mlForecast.status).toBe('NO_FORECAST_JUSTIFIED');
    });

    it('generates honest insufficiency message when query has zero supported evidence', async () => {
      const result = await processResearchQuery({
        query: 'Did QuantumSupercorp launch their teleportation device today?',
        mode: 'ask',
      });

      expect(result.evidenceSufficiency).toBeDefined();
      if (!result.evidenceSufficiency.isSufficient) {
        expect(
          result.directAnswer.toLowerCase().includes('no sufficiently supported') ||
          result.directAnswer.toLowerCase().includes('insufficient') ||
          result.directAnswer.toLowerCase().includes('not available') ||
          result.directAnswer.toLowerCase().includes('unsupported')
        ).toBe(true);
      }
    }, 35000);
  });
});
