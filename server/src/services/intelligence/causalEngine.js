import { getGeminiClient, isGeminiConfigured } from '../gemini.js';

/**
 * Valid causal sequence stage keys.
 */
export const CAUSAL_STAGES = [
  'preconditions',
  'trigger',
  'mechanism',
  'chain_reaction',
  'amplifiers',
  'immediate_consequences',
  'human_response',
  'secondary_effects',
  'current_state',
];

/**
 * Assemble a structured causal chain from retrieved articles, claims, and database links.
 * Strictly distinguishes directly supported relationships from inferred relationships.
 * If evidence is missing for a stage, it explicitly reports that evidence is missing.
 *
 * @param {object} params
 * @param {object} params.event - Target event (if available)
 * @param {Array<object>} params.articles - Retrieved articles
 * @param {Array<object>} params.claims - Extracted claims
 * @param {Array<object>} [params.existingCausalLinks=[]] - Pre-recorded database causal links
 * @returns {Promise<{
 *   stages: Record<string, {
 *     status: 'SUPPORTED'|'INFERRED'|'MISSING_EVIDENCE',
 *     description: string,
 *     evidenceRefs: Array<{source: string, excerpt: string}>,
 *     confidence: number
 *   }>,
 *   summaryCausalChain: string
 * }>}
 */
export async function assembleCausalChain({
  event = {},
  articles = [],
  claims = [],
  existingCausalLinks = [],
  skipLlm = false,
}) {
  const stages = {
    preconditions: {
      status: 'MISSING_EVIDENCE',
      description: 'Pre-existing environmental, structural, or geopolitical conditions are not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    trigger: {
      status: 'MISSING_EVIDENCE',
      description: 'The specific initiating trigger is not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    mechanism: {
      status: 'MISSING_EVIDENCE',
      description: 'The underlying physical, economic, or social mechanism is not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    chain_reaction: {
      status: 'MISSING_EVIDENCE',
      description: 'Cascading subsequent developments are not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    amplifiers: {
      status: 'MISSING_EVIDENCE',
      description: 'Specific amplifying or compounding factors are not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    immediate_consequences: {
      status: 'MISSING_EVIDENCE',
      description: 'Immediate direct consequences are not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    human_response: {
      status: 'MISSING_EVIDENCE',
      description: 'Emergency, governmental, or institutional responses are not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    secondary_effects: {
      status: 'MISSING_EVIDENCE',
      description: 'Broader secondary infrastructural, economic, or political effects are not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
    current_state: {
      status: 'MISSING_EVIDENCE',
      description: 'Present on-the-ground operational status is not documented in current dispatches.',
      evidenceRefs: [],
      confidence: 0,
    },
  };

  // 1. Populate from pre-recorded verified causal links in database
  for (const cl of existingCausalLinks) {
    const relType = (cl.relationship_type || cl.relType || '').toLowerCase();
    const stageKey = CAUSAL_STAGES.includes(relType) ? relType : (
      relType === 'consequence' ? 'immediate_consequences' :
      relType === 'amplifier' ? 'amplifiers' : null
    );

    if (stageKey && stages[stageKey]) {
      stages[stageKey] = {
        status: cl.is_directly_supported || cl.isDirect ? 'SUPPORTED' : 'INFERRED',
        description: `${cl.cause_text || cl.cause} &rarr; ${cl.effect_text || cl.effect}`,
        evidenceRefs: Array.isArray(cl.evidence_refs) ? cl.evidence_refs : [],
        confidence: cl.confidence || 0.8,
      };
    }
  }

  // 2. Scan causal claims in retrieved dispatches
  const causalClaims = claims.filter(c => c.claim_type === 'causal' || c.information_class === 'context');
  for (const c of causalClaims) {
    const textLower = c.text.toLowerCase();
    if (textLower.includes('cause') || textLower.includes('trigger') || textLower.includes('began')) {
      if (stages.trigger.status === 'MISSING_EVIDENCE') {
        stages.trigger = {
          status: 'SUPPORTED',
          description: c.text,
          evidenceRefs: [{ source: 'Extracted Claim', excerpt: c.text }],
          confidence: 0.85,
        };
      }
    } else if (textLower.includes('result') || textLower.includes('damage') || textLower.includes('kill') || textLower.includes('flood')) {
      if (stages.immediate_consequences.status === 'MISSING_EVIDENCE') {
        stages.immediate_consequences = {
          status: 'SUPPORTED',
          description: c.text,
          evidenceRefs: [{ source: 'Extracted Claim', excerpt: c.text }],
          confidence: 0.85,
        };
      }
    }
  }

  // 3. Grounded causal extraction via Gemini if available, requested, and articles present
  if (!skipLlm && isGeminiConfigured() && articles.length > 0) {
    const client = getGeminiClient();
    if (client) {
      const snippets = articles.slice(0, 4).map(a =>
        `[${a.source_name || 'Source'}] ${a.title}\n${a.summary || ''}`
      ).join('\n---\n');

      const prompt = `You are a causal reasoning intelligence analyst at Pramāṇa.
Analyze the following news reporting and extract the real, evidence-grounded causal sequence.
CRITICAL RULES:
1. Every stage must be strictly derived from the provided snippets.
2. If evidence for a stage is missing or not mentioned, you MUST set description to null. DO NOT guess or invent plausible background.
3. For each stage where evidence exists, indicate whether the relationship is "DIRECTLY_SUPPORTED" (explicitly reported as causal) or "INFERRED" (chronologically correlated).
4. Include the direct source outlet and excerpt in evidenceRefs.

Snippets:
${snippets}

Respond strictly in valid JSON:
{
  "preconditions": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "trigger": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "mechanism": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "chain_reaction": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "amplifiers": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "immediate_consequences": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "human_response": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "secondary_effects": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" },
  "current_state": { "description": "string or null", "isDirect": true/false, "source": "string", "excerpt": "string" }
}

JSON:`;

      try {
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
        const callPromise = client.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('LLM call timeout')), 2500)
        );
        const response = await Promise.race([callPromise, timeoutPromise]);

        const parsed = JSON.parse(response.text.trim());
        for (const stage of CAUSAL_STAGES) {
          const item = parsed[stage];
          if (item && item.description && typeof item.description === 'string' && item.description.trim()) {
            stages[stage] = {
              status: item.isDirect ? 'SUPPORTED' : 'INFERRED',
              description: item.description.trim(),
              evidenceRefs: item.source ? [{ source: item.source, excerpt: item.excerpt || '' }] : [],
              confidence: item.isDirect ? 0.9 : 0.65,
            };
          }
        }
      } catch (err) {
        // Deterministic fallback preserved
      }
    }
  }

  // Generate executive causal chain summary from supported stages
  const populatedStages = CAUSAL_STAGES
    .filter(k => stages[k].status !== 'MISSING_EVIDENCE')
    .map(k => `${k.toUpperCase().replace('_', ' ')} (${stages[k].status}): ${stages[k].description}`);

  const summaryCausalChain = populatedStages.length > 0
    ? populatedStages.join('\n&rarr; ')
    : 'Evidence for a complete causal sequence is not currently available in verified dispatches.';

  return {
    stages,
    summaryCausalChain,
  };
}
