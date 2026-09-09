import { describe, it, expect } from 'vitest';
import {
  classifySourceHierarchy,
  detectWireService,
  checkSourceIndependence,
  getIndependentSourceClusters,
  verifyClaim,
} from '../src/services/intelligence/claimVerifier.js';

describe('Source Independence & Deterministic Claim Verification', () => {
  it('detects wire service syndication from article content and authors', () => {
    const apArticle = {
      title: 'Monsoon Floods Swell Nepal Rivers (AP)',
      author: 'Binaj Gurubacharya / Associated Press',
      source_name: 'The Hindu',
    };
    expect(detectWireService(apArticle)).toBe('Associated Press');

    const reutersArticle = {
      title: 'Global Markets Rebound After Rate Cut',
      summary: 'LONDON, Sept 9 (Reuters) - European equities climbed...',
      source_name: 'Yahoo Finance',
    };
    expect(detectWireService(reutersArticle)).toBe('Reuters');
  });

  it('rejects wire-copy duplicates as independent corroboration', () => {
    const article1 = {
      id: 'art-1',
      title: 'Rescue Efforts Underway in Kathmandu Floods (AP)',
      summary: 'Heavy monsoon rains battered Nepal for a third straight day, causing major rivers to breach floodwalls.',
      source_name: 'Outlet Alpha',
      wire_service: 'Associated Press',
    };

    const article2 = {
      id: 'art-2',
      title: 'Nepal Floods Cause Havoc in Kathmandu',
      summary: 'Heavy monsoon rains battered Nepal for a third straight day, causing major rivers to breach floodwalls (AP).',
      source_name: 'Outlet Beta',
      wire_service: 'Associated Press',
    };

    const independence = checkSourceIndependence(article1, article2);
    expect(independence.isIndependent).toBe(false);
    expect(independence.reason).toContain('syndicated wire service');

    const clusters = getIndependentSourceClusters([article1, article2]);
    expect(clusters.length).toBe(1); // Collapsed to 1 cluster

    // Verifying claim with only syndicated reprints must remain UNVERIFIED
    const result = verifyClaim({ text: 'Floods breached Kathmandu walls' }, [article1, article2]);
    expect(result.status).toBe('UNVERIFIED');
    expect(result.independentSourceCount).toBe(1);
  });

  it('verifies claim when corroborated by 2+ genuinely independent news outlets', () => {
    const bbcArticle = {
      id: 'art-10',
      title: 'Nepal Floods: Death Toll Rises in Capital',
      summary: 'BBC correspondent reporting live from Kathmandu confirms 40 casualties.',
      source_name: 'BBC News',
      type: 'rss',
    };

    const dwArticle = {
      id: 'art-11',
      title: 'Deadly Landslides Sweep Nepal as Monsoon Intensifies',
      summary: 'DW South Asia bureau reports dozens dead and key highways severed.',
      source_name: 'Deutsche Welle',
      type: 'rss',
    };

    const result = verifyClaim({ text: 'Dozens killed in Nepal floods' }, [bbcArticle, dwArticle]);
    expect(result.status).toBe('VERIFIED');
    expect(result.independentSourceCount).toBe(2);
    expect(result.badgeLabel).toBe('VERIFIED');
  });

  it('verifies claim from an authoritative primary government document', () => {
    const govReport = {
      id: 'gov-1',
      title: 'Ministry of Home Affairs Situation Report on Monsoon Disasters',
      summary: 'Official bulletin confirms opening of emergency flood shelters.',
      source_name: 'Nepal Ministry of Home Affairs',
      type: 'official',
      url: 'https://moha.gov.np/bulletin',
    };

    const result = verifyClaim({ text: 'Emergency flood shelters opened' }, [govReport]);
    expect(result.status).toBe('VERIFIED');
    expect(result.provenance).toBe('PRIMARY SOURCE');
  });

  it('labels contradicted claim as CONTRADICTED BY [SOURCE] and NEVER uses FALSE', () => {
    const contradictor = {
      source_name: 'Reuters Fact Check',
      summary: 'Satellite imagery and meteorological records confirm no dam collapse occurred.',
    };

    const result = verifyClaim(
      { text: 'Hydroelectric dam collapsed in eastern province' },
      [],
      [contradictor]
    );

    expect(result.status).toBe('CONTRADICTED');
    expect(result.badgeLabel).toBe('CONTRADICTED BY REUTERS FACT CHECK');
    expect(result.status).not.toBe('FALSE');
  });

  it('prevents public/social signals from independently verifying claims', () => {
    const socialPost1 = {
      source_name: 'X / Twitter Post',
      type: 'social',
      summary: 'Hearing rumors that airport is closed.',
    };
    const socialPost2 = {
      source_name: 'Reddit Megathread',
      type: 'social',
      summary: 'Multiple users reporting airport is closed.',
    };

    const result = verifyClaim({ text: 'Kathmandu airport closed' }, [socialPost1, socialPost2]);
    expect(result.status).toBe('UNVERIFIED');
    expect(result.provenance).toBe('PUBLIC SIGNAL');
    expect(result.badgeLabel).toContain('PUBLIC SIGNAL ONLY');
  });
});
