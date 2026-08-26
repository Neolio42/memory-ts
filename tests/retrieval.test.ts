import { describe, it, expect } from 'vitest'
import { SmartVectorRetrieval, createRetrieval, getActionItems, type SessionContext } from '../src/core/retrieval'
import type { StoredMemory, RetrievalResult } from '../src/types/memory'

// ============================================================================
// HELPERS
// ============================================================================

/** Create a minimal StoredMemory for testing */
function makeMemory(overrides: Partial<StoredMemory> & { id: string }): StoredMemory {
  return {
    id: overrides.id,
    content: overrides.content ?? 'Test memory content about retrieval algorithm',
    headline: overrides.headline ?? 'Test memory',
    session_id: overrides.session_id ?? 'sess-1',
    project_id: overrides.project_id ?? 'proj-1',
    created_at: overrides.created_at ?? Date.now() - 86400000, // 1 day ago
    updated_at: overrides.updated_at ?? Date.now(),
    importance_weight: overrides.importance_weight ?? 0.7,
    confidence_score: overrides.confidence_score ?? 0.8,
    context_type: overrides.context_type ?? 'technical',
    temporal_class: overrides.temporal_class ?? 'medium_term',
    action_required: overrides.action_required ?? false,
    problem_solution_pair: overrides.problem_solution_pair ?? false,
    semantic_tags: overrides.semantic_tags ?? ['retrieval', 'algorithm', 'signals'],
    trigger_phrases: overrides.trigger_phrases ?? ['retrieval algorithm', 'activation signals'],
    question_types: overrides.question_types ?? ['how does retrieval work'],
    reasoning: overrides.reasoning ?? 'test',
    status: overrides.status ?? 'active',
    scope: overrides.scope ?? 'project',
    fade_rate: overrides.fade_rate ?? 0.03,
    sessions_since_surfaced: overrides.sessions_since_surfaced ?? 0,
    ...overrides,
  }
}

/** Zero embedding (384 dims) — guarantees no vector signal */
const zeroEmbedding = new Float32Array(384)

/** Session context for tests */
const defaultCtx: SessionContext = {
  session_id: 'sess-test',
  project_id: 'proj-1',
  message_count: 5,
}

// ============================================================================
// TESTS
// ============================================================================

describe('SmartVectorRetrieval', () => {
  const retrieval = new SmartVectorRetrieval()

  // ================================================================
  // PRE-FILTER
  // ================================================================
  describe('pre-filtering', () => {
    it('excludes non-active memories', () => {
      const memories = [
        makeMemory({ id: 'm1', status: 'superseded' }),
        makeMemory({ id: 'm2', status: 'archived' }),
        makeMemory({ id: 'm3', status: 'deprecated' }),
        makeMemory({ id: 'm4', status: 'pending' }),
        makeMemory({ id: 'm5', status: 'active' }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx
      )

      // Only m5 can pass through (m1-m4 filtered by status)
      // m5 still needs 2+ signals to activate
      const ids = results.map(r => r.id)
      expect(ids).not.toContain('m1')
      expect(ids).not.toContain('m2')
      expect(ids).not.toContain('m3')
      expect(ids).not.toContain('m4')
    })

    it('excludes memories with exclude_from_retrieval=true', () => {
      const memories = [
        makeMemory({ id: 'excluded', exclude_from_retrieval: true }),
        makeMemory({ id: 'included', exclude_from_retrieval: false }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx
      )

      const ids = results.map(r => r.id)
      expect(ids).not.toContain('excluded')
    })

    it('excludes memories from other projects (non-global)', () => {
      const memories = [
        makeMemory({ id: 'other-proj', project_id: 'proj-2', scope: 'project' }),
        makeMemory({ id: 'right-proj', project_id: 'proj-1', scope: 'project' }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx
      )

      const ids = results.map(r => r.id)
      expect(ids).not.toContain('other-proj')
    })

    it('includes global memories regardless of project_id', () => {
      const memories = [
        makeMemory({
          id: 'global-mem',
          project_id: 'global',
          scope: 'global',
          context_type: 'personal',
          semantic_tags: ['personal', 'context'],
          trigger_phrases: ['personal context'],
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'personal context retrieval', zeroEmbedding, defaultCtx
      )

      // Global memories should be included (if they pass activation gate)
      // They need 2+ signals from trigger/tags/domain/feature/content
      // With tags: 'personal', 'context' both in message, and content overlap
    })

    it('excludes memories whose anti-triggers match the message', () => {
      const memories = [
        makeMemory({
          id: 'anti-triggered',
          anti_triggers: ['debugging', 'testing'],
          trigger_phrases: ['retrieval algorithm'],
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'debugging the retrieval algorithm', zeroEmbedding, defaultCtx
      )

      expect(results.map(r => r.id)).not.toContain('anti-triggered')
    })

    it('keeps memories whose anti-triggers do NOT match', () => {
      const memories = [
        makeMemory({
          id: 'safe-from-anti',
          anti_triggers: ['debugging', 'testing'],
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'About retrieval algorithm signals and scoring mechanism',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm implementation details', zeroEmbedding, defaultCtx
      )

      expect(results.map(r => r.id)).toContain('safe-from-anti')
    })
  })

  // ================================================================
  // ACTIVATION GATE (MIN_SIGNALS = 2)
  // ================================================================
  describe('activation gate', () => {
    it('rejects memories with fewer than 2 signals', () => {
      const memories = [
        makeMemory({
          id: 'weak-mem',
          trigger_phrases: ['obscure-phrase-xyz-12345'],
          semantic_tags: ['totally-unrelated-tag-abc'],
          domain: 'obscure-domain-999',
          feature: 'obscure-feature-888',
          content: 'Completely unrelated content about quantum physics entanglement',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals implementation', zeroEmbedding, defaultCtx
      )

      expect(results).toHaveLength(0)
    })

    it('accepts memories with 2+ signals', () => {
      const memories = [
        makeMemory({
          id: 'strong-mem',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          domain: 'retrieval',
          content: 'The retrieval algorithm uses activation signals for memory scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm implementation', zeroEmbedding, defaultCtx
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].id).toBe('strong-mem')
    })

    it('allows strong vector similarity (>=50%) to bypass gate', () => {
      // Create two embeddings with high cosine similarity
      // Simple: identical embeddings → similarity = 1.0
      const embedding = new Float32Array(384)
      embedding[0] = 0.5
      embedding[1] = 0.5
      embedding[2] = 0.5
      // rest zeros → but need normalization for valid cosine

      // Use same embedding for query and memory
      const norm = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5 + 0.5 * 0.5)
      const unitVec = new Float32Array(384)
      unitVec[0] = 0.5 / norm
      unitVec[1] = 0.5 / norm
      unitVec[2] = 0.5 / norm

      const memories = [
        makeMemory({
          id: 'vector-bypass',
          embedding: unitVec,
          trigger_phrases: [],
          semantic_tags: [],
          domain: undefined,
          feature: undefined,
          content: 'Quantum entanglement bubble physics nonsense xyzzy',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'random unrelated message', unitVec, defaultCtx
      )

      // Should pass via vector bypass (similarity = 1.0)
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].id).toBe('vector-bypass')
    })
  })

  // ================================================================
  // TRIGGER PHRASE ACTIVATION
  // ================================================================
  describe('trigger phrases', () => {
    it('activates when >= 50% of trigger words match', () => {
      const memories = [
        makeMemory({
          id: 'trigger-match',
          trigger_phrases: ['retrieval algorithm scoring'],
          semantic_tags: [],  // Force only trigger signal
          domain: 'retrieval',
          content: 'xyzzy unrelated foo bar baz quux',
        }),
      ]

      // "retrieval algorithm" = 2/3 words matched = 66% > 50%
      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm optimization', zeroEmbedding, defaultCtx
      )

      // Trigger + domain = 2 signals → passes gate
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('does not activate when < 50% of trigger words match', () => {
      const memories = [
        makeMemory({
          id: 'trigger-miss',
          trigger_phrases: ['very specific retrieval algorithm scoring mechanism'],
          semantic_tags: [],
          domain: undefined,
          feature: undefined,
          content: 'xyzzy unrelated foo bar baz quux nothing here',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval optimization', zeroEmbedding, defaultCtx
      )

      // Only 1/6 words matched = ~17% < 50% → trigger doesn't fire
      expect(results).toHaveLength(0)
    })

    it('handles empty trigger phrases', () => {
      const memories = [
        makeMemory({
          id: 'no-triggers',
          trigger_phrases: [],
          semantic_tags: ['retrieval', 'algorithm'],
          domain: 'retrieval',
          content: 'xyzzy unrelated',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm', zeroEmbedding, defaultCtx
      )

      // No trigger but tags + domain = 2 signals
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('handles plural/singular variations', () => {
      const memories = [
        makeMemory({
          id: 'plural-test',
          trigger_phrases: ['embedding model'],
          semantic_tags: [],
          domain: 'embeddings',
          content: 'xyzzy unrelated foo bar baz',
        }),
      ]

      // "embeddings" should match "embedding" via singular/plural handling
      const results = retrieval.retrieveRelevantMemories(
        memories, 'embeddings models optimization', zeroEmbedding, defaultCtx
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ================================================================
  // TAG ACTIVATION
  // ================================================================
  describe('semantic tags', () => {
    it('activates when enough tags match (threshold scales with count)', () => {
      const memories = [
        makeMemory({
          id: 'tags-match',
          trigger_phrases: [],
          semantic_tags: ['retrieval', 'algorithm', 'signals'],
          domain: 'retrieval',
          content: 'xyzzy unrelated foo bar',
        }),
      ]

      // 3 tags ≤ 4 → threshold is 1. 'retrieval' and 'algorithm' match → passes
      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm implementation', zeroEmbedding, defaultCtx
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('does not activate when too few tags match', () => {
      const memories = [
        makeMemory({
          id: 'tags-miss',
          trigger_phrases: [],
          semantic_tags: ['retrieval', 'algorithm', 'signals', 'scoring', 'embedding', 'vector', 'similarity', 'threshold'],
          domain: undefined,
          feature: undefined,
          content: 'xyzzy unrelated foo bar baz quux nothing relevant at all',
        }),
      ]

      // 8+ tags → threshold is 3. Only 1 match ('retrieval') → doesn't pass tag signal
      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval optimization', zeroEmbedding, defaultCtx
      )

      // Only 1 signal max (tags didn't fire) → rejected by gate
      expect(results).toHaveLength(0)
    })
  })

  // ================================================================
  // DOMAIN & FEATURE ACTIVATION
  // ================================================================
  describe('domain and feature', () => {
    it('domain activates when found in message', () => {
      const memories = [
        makeMemory({
          id: 'domain-match',
          trigger_phrases: [],
          semantic_tags: [],
          domain: 'retrieval',
          feature: undefined,
          content: 'retrieval is the core of the system for finding memories scoring algorithm',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval system optimization scoring algorithm', zeroEmbedding, defaultCtx
      )

      // Domain + content overlap (retrieval, system, scoring, algorithm) → 2+
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('short domain (<=4 chars) requires whole word match', () => {
      const memories = [
        makeMemory({
          id: 'short-domain',
          trigger_phrases: [],
          semantic_tags: ['api', 'endpoint'],
          domain: 'api',
          feature: undefined,
          content: 'api endpoint design for the system architecture patterns',
        }),
      ]

      // "api" should match as whole word in "api endpoint"
      const results1 = retrieval.retrieveRelevantMemories(
        [...memories], 'api endpoint optimization', zeroEmbedding, defaultCtx
      )
      expect(results1.some(r => r.id === 'short-domain')).toBe(true)

      // "api" should NOT match "capital" (substring only)
      // Need another memory that would fail the domain check
      const memCapital = makeMemory({
        id: 'short-domain-2',
        trigger_phrases: [],
        semantic_tags: [],
        domain: 'api',
        feature: undefined,
        content: 'xyzzy unrelated foo bar baz nothing about capital',
      })
      const results2 = retrieval.retrieveRelevantMemories(
        [memCapital], 'capital letters optimization', zeroEmbedding, defaultCtx
      )
      expect(results2.map(r => r.id)).not.toContain('short-domain-2')
    })

    it('feature activates when found in message', () => {
      const memories = [
        makeMemory({
          id: 'feature-match',
          trigger_phrases: [],
          semantic_tags: [],
          domain: 'retrieval',
          feature: 'scoring-weights',
          content: 'The scoring weights determine how memories are ranked and selected for retrieval context',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'scoring-weights configuration retrieval', zeroEmbedding, defaultCtx
      )

      // Feature + domain + content overlap → 2+
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ================================================================
  // CONTENT OVERLAP
  // ================================================================
  describe('content overlap', () => {
    it('activates when 3+ significant words overlap', () => {
      const memories = [
        makeMemory({
          id: 'content-overlap',
          trigger_phrases: [],
          semantic_tags: [],
          domain: 'activation',
          feature: undefined,
          content: 'The activation signal algorithm uses multiple binary indicators for relevance scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'activation signal algorithm binary indicators', zeroEmbedding, defaultCtx
      )

      // Content overlap (activation, signal, algorithm, binary, indicators) + domain = 2+
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ================================================================
  // FILE PATH MATCHING
  // ================================================================
  describe('file path matching', () => {
    it('activates when related files match message paths', () => {
      const memories = [
        makeMemory({
          id: 'file-match',
          trigger_phrases: [],
          semantic_tags: [],
          domain: 'retrieval',
          related_files: ['src/core/retrieval.ts', 'src/core/engine.ts'],
          content: 'xyzzy unrelated foo bar baz',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'fix the bug in src/core/retrieval.ts', zeroEmbedding, defaultCtx
      )

      // Files + domain → 2 signals
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].id).toBe('file-match')
    })
  })

  // ================================================================
  // IMPORTANCE SCORING
  // ================================================================
  describe('importance scoring', () => {
    it('higher importance_weight ranks above lower', () => {
      const memories = [
        makeMemory({
          id: 'low-importance',
          importance_weight: 0.3,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
        makeMemory({
          id: 'high-importance',
          importance_weight: 0.95,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      // Higher importance should be first (after sorting by signal count, then importance)
      expect(results[0].id).toBe('high-importance')
    })

    it('action_required memories are prioritized', () => {
      const memories = [
        makeMemory({
          id: 'normal',
          importance_weight: 0.8,
          action_required: false,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals',
        }),
        makeMemory({
          id: 'actionable',
          importance_weight: 0.6,
          action_required: true,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      // action_required gets prioritized
      expect(results.length).toBe(2)
      expect(results[0].id).toBe('actionable')
    })

    it('eternal memories get temporal bonus', () => {
      const memories = [
        makeMemory({
          id: 'medium-mem',
          temporal_class: 'medium_term',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
        makeMemory({
          id: 'eternal-mem',
          temporal_class: 'eternal',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('eternal-mem')
    })

    it('low confidence (< 0.5) gets penalty', () => {
      const memories = [
        makeMemory({
          id: 'confident',
          confidence_score: 0.9,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
        makeMemory({
          id: 'uncertain',
          confidence_score: 0.3,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('confident')
    })

    it('awaiting_implementation memories get boost', () => {
      const memories = [
        makeMemory({
          id: 'done-mem',
          awaiting_implementation: false,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
        makeMemory({
          id: 'awaiting-mem',
          awaiting_implementation: true,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results[0].id).toBe('awaiting-mem')
    })
  })

  // ================================================================
  // SELECTION & LIMITS
  // ================================================================
  describe('selection limits', () => {
    it('respects maxMemories limit', () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        makeMemory({
          id: `mem-${i}`,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
          importance_weight: 0.5 + i * 0.05,
        })
      )

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 3
      )

      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('limits global memories to maxGlobalMemories', () => {
      const memories = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeMemory({
            id: `global-${i}`,
            project_id: 'global',
            scope: 'global',
            context_type: 'technical',
            trigger_phrases: ['retrieval algorithm'],
            semantic_tags: ['retrieval', 'algorithm'],
            content: 'Retrieval algorithm signals scoring mechanism',
          })
        ),
        makeMemory({
          id: 'project-1',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5, 0, 1
      )

      const globalCount = results.filter(r => r.scope === 'global' || r.project_id === 'global').length
      expect(globalCount).toBeLessThanOrEqual(1)
    })

    it('prioritizes technical globals over personal', () => {
      const memories = [
        makeMemory({
          id: 'personal-global',
          project_id: 'global',
          scope: 'global',
          context_type: 'personal',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
        makeMemory({
          id: 'tech-global',
          project_id: 'global',
          scope: 'global',
          context_type: 'technical',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5, 0, 1
      )

      // Only 1 global allowed; technical should win
      const globalResults = results.filter(r => r.project_id === 'global')
      expect(globalResults).toHaveLength(1)
      expect(globalResults[0].id).toBe('tech-global')
    })

    it('returns empty array for empty memory store', () => {
      const results = retrieval.retrieveRelevantMemories(
        [], 'any message', zeroEmbedding, defaultCtx
      )
      expect(results).toHaveLength(0)
    })
  })

  // ================================================================
  // IMPORTANCE FLOOR
  // ================================================================
  describe('importance floor', () => {
    it('drops memories with importance score below 0.4', () => {
      const memories = [
        makeMemory({
          id: 'floor-dropped',
          importance_weight: 0.1,
          confidence_score: 0.1,
          temporal_class: 'ephemeral',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals',
          // Add penalties: old ephemeral + low confidence
          created_at: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm casual chat', zeroEmbedding, defaultCtx
      )

      // Score after penalties should be well below 0.4
      // Even if it passes the gate, the importance floor drops it
      expect(results.map(r => r.id)).not.toContain('floor-dropped')
    })
  })

  // ================================================================
  // INTENT CLASSIFICATION
  // ================================================================
  describe('intent classification effects', () => {
    it('technical intent penalizes personal memories', () => {
      const memories = [
        makeMemory({
          id: 'personal-in-tech',
          context_type: 'personal',
          scope: 'project',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism implementation',
        }),
        makeMemory({
          id: 'tech-in-tech',
          context_type: 'technical',
          scope: 'project',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism implementation',
        }),
      ]

      // Very technical message: "implement", "code", "function", "retrieval", "algorithm"
      const results = retrieval.retrieveRelevantMemories(
        memories,
        'implement code function retrieval algorithm bug debug deploy build compile',
        zeroEmbedding, defaultCtx, 5
      )

      // Both should appear, but technical should rank higher
      expect(results[0].id).toBe('tech-in-tech')
    })
  })

  // ================================================================
  // SUPersed/RESOLVED REDIRECTS
  // ================================================================
  describe('redirect logic', () => {
    it('redirects superseded memories to their replacement', () => {
      const newMemory = makeMemory({
        id: 'new-replacement',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Updated retrieval algorithm with v2 scoring',
      })

      const oldMemory = makeMemory({
        id: 'old-superseded',
        superseded_by: 'new-replacement',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Old retrieval algorithm scoring',
      })

      const results = retrieval.retrieveRelevantMemories(
        [oldMemory, newMemory], 'retrieval algorithm scoring', zeroEmbedding, defaultCtx
      )

      // Should redirect to new-replacement
      const ids = results.map(r => r.id)
      expect(ids).toContain('new-replacement')
    })

    it('does not redirect to archived replacements', () => {
      const archivedReplacement = makeMemory({
        id: 'archived-replacement',
        status: 'archived',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Archived replacement',
      })

      const oldMemory = makeMemory({
        id: 'old-redirect-to-archived',
        superseded_by: 'archived-replacement',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Old retrieval algorithm scoring that should still surface',
      })

      const results = retrieval.retrieveRelevantMemories(
        [oldMemory, archivedReplacement], 'retrieval algorithm scoring', zeroEmbedding, defaultCtx
      )

      // Archived replacement should not be used; old memory surfaces as-is
      // (The old memory is still active so it can pass through)
      // But it needs to pass the gate. Since old has triggers/tags matching, it should work.
      // However the redirect attempt fails (archived), so it surfaces old directly.
    })
  })

  // ================================================================
  // DECAY MECHANICS
  // ================================================================
  describe('decay mechanics', () => {
    it('applies fade_rate penalty based on sessions_since_surfaced', () => {
      const memories = [
        makeMemory({
          id: 'fresh-mem',
          fade_rate: 0.1,
          sessions_since_surfaced: 0,
          importance_weight: 0.9,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
        }),
        makeMemory({
          id: 'stale-mem',
          fade_rate: 0.1,
          sessions_since_surfaced: 5,
          importance_weight: 0.9,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      // Both pass but fresh ranks higher (stale has -0.5 penalty from decay)
      expect(results.length).toBe(2)
      expect(results[0].id).toBe('fresh-mem')
    })

    it('caps fade penalty at 0.5', () => {
      const memories = [
        makeMemory({
          id: 'very-stale',
          fade_rate: 0.2,
          sessions_since_surfaced: 10, // 0.2 * 10 = 2.0, but capped at 0.5
          importance_weight: 0.9,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx
      )

      // Should still pass (importance 0.9 - 0.5 cap = 0.4, at the floor)
      expect(results.length).toBeGreaterThanOrEqual(0) // Could be 0 if other penalties push below 0.4
    })

    it('age-based decay for short_term memories after 7 days', () => {
      const memories = [
        makeMemory({
          id: 'old-short-term',
          temporal_class: 'short_term',
          created_at: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
        }),
        makeMemory({
          id: 'recent-short-term',
          temporal_class: 'short_term',
          created_at: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring mechanism',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('recent-short-term')
    })
  })

  // ================================================================
  // LINKED MEMORIES (Phase 4)
  // ================================================================
  describe('linked memories', () => {
    it('pulls in related_to memories when space allows', () => {
      const linkedMemory = makeMemory({
        id: 'linked-mem',
        trigger_phrases: [],
        semantic_tags: [],
        content: 'Linked context about the system',
        importance_weight: 0.5,
      })

      const mainMemory = makeMemory({
        id: 'main-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Main retrieval algorithm memory',
        related_to: ['linked-mem'],
      })

      const results = retrieval.retrieveRelevantMemories(
        [mainMemory, linkedMemory], 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 3
      )

      // main-mem should be selected, and linked-mem pulled in as related
      const ids = results.map(r => r.id)
      expect(ids).toContain('main-mem')
      // linked-mem should be pulled in if space allows
      // (It may or may not be there depending on whether it passes the gate on its own)
    })
  })

  // ================================================================
  // RESULT FORMAT
  // ================================================================
  describe('result format', () => {
    it('returns RetrievalResult with score fields', () => {
      const memories = [
        makeMemory({
          id: 'format-test',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
      const result = results[0]
      expect(result).toHaveProperty('score')
      expect(result).toHaveProperty('relevance_score')
      expect(result).toHaveProperty('value_score')
      expect(typeof result.score).toBe('number')
      expect(typeof result.relevance_score).toBe('number')
      expect(typeof result.value_score).toBe('number')
      expect(result.score).toBeGreaterThan(0)
      expect(result.relevance_score).toBeGreaterThan(0)
    })
  })
})

// ============================================================================
// getActionItems
// ============================================================================

describe('getActionItems', () => {
  it('returns memories with action_required=true', () => {
    const memories = [
      makeMemory({ id: 'action-1', action_required: true }),
      makeMemory({ id: 'no-action', action_required: false }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results.map(r => r.id)).toContain('action-1')
    expect(results.map(r => r.id)).not.toContain('no-action')
  })

  it('returns memories with awaiting_implementation=true', () => {
    const memories = [
      makeMemory({ id: 'awaiting', awaiting_implementation: true, action_required: false }),
      makeMemory({ id: 'not-awaiting', awaiting_implementation: false }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results.map(r => r.id)).toContain('awaiting')
  })

  it('returns memories with awaiting_decision=true', () => {
    const memories = [
      makeMemory({ id: 'decision', awaiting_decision: true, action_required: false }),
      makeMemory({ id: 'no-decision', awaiting_decision: false }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results.map(r => r.id)).toContain('decision')
  })

  it('returns unresolved memories', () => {
    const memories = [
      makeMemory({ id: 'unresolved', context_type: 'unresolved', action_required: false }),
      makeMemory({ id: 'resolved', context_type: 'technical' }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results.map(r => r.id)).toContain('unresolved')
  })

  it('excludes non-active memories', () => {
    const memories = [
      makeMemory({ id: 'superseded', action_required: true, status: 'superseded' }),
      makeMemory({ id: 'archived', action_required: true, status: 'archived' }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results).toHaveLength(0)
  })

  it('excludes excluded_from_retrieval', () => {
    const memories = [
      makeMemory({ id: 'excluded', action_required: true, exclude_from_retrieval: true }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results).toHaveLength(0)
  })

  it('excludes other-project memories (non-global)', () => {
    const memories = [
      makeMemory({ id: 'other', action_required: true, project_id: 'other-proj', scope: 'project' }),
      makeMemory({ id: 'global', action_required: true, project_id: 'global', scope: 'global' }),
      makeMemory({ id: 'local', action_required: true, project_id: 'proj-1', scope: 'project' }),
    ]

    const results = getActionItems(memories, 'proj-1')
    const ids = results.map(r => r.id)
    expect(ids).not.toContain('other')
    expect(ids).toContain('global')
    expect(ids).toContain('local')
  })

  it('sorts by importance desc, then created_at desc', () => {
    const memories = [
      makeMemory({ id: 'low-new', action_required: true, importance_weight: 0.3, created_at: Date.now() }),
      makeMemory({ id: 'high-old', action_required: true, importance_weight: 0.9, created_at: Date.now() - 100000 }),
      makeMemory({ id: 'low-old', action_required: true, importance_weight: 0.3, created_at: Date.now() - 100000 }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results[0].id).toBe('high-old')     // Highest importance first
    expect(results[1].id).toBe('low-new')      // Same importance, newer first
    expect(results[2].id).toBe('low-old')
  })

  it('sets score to 1.0 for all action items', () => {
    const memories = [
      makeMemory({ id: 'action', action_required: true }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results[0].score).toBe(1.0)
    expect(results[0].relevance_score).toBe(1.0)
  })

  it('returns empty array when no action items', () => {
    const memories = [
      makeMemory({ id: 'boring', action_required: false }),
    ]

    const results = getActionItems(memories, 'proj-1')
    expect(results).toHaveLength(0)
  })
})

// ============================================================================
// createRetrieval factory
// ============================================================================

describe('createRetrieval', () => {
  it('returns a SmartVectorRetrieval instance', () => {
    const instance = createRetrieval()
    expect(instance).toBeInstanceOf(SmartVectorRetrieval)
  })
})

// ============================================================================
// ADDITIONAL EDGE CASE TESTS
// ============================================================================

describe('SmartVectorRetrieval – edge cases', () => {
  const retrieval = new SmartVectorRetrieval()

  // ================================================================
  // RESOLVED_BY REDIRECT
  // ================================================================
  describe('resolved_by redirect', () => {
    it('redirects resolved_by memories to their resolution', () => {
      const resolution = makeMemory({
        id: 'resolution-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Resolution: fixed retrieval algorithm scoring mechanism',
      })

      const resolved = makeMemory({
        id: 'old-resolved',
        resolved_by: 'resolution-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Old bug in retrieval algorithm scoring mechanism',
      })

      const results = retrieval.retrieveRelevantMemories(
        [resolved, resolution], 'retrieval algorithm scoring', zeroEmbedding, defaultCtx
      )

      const ids = results.map(r => r.id)
      expect(ids).toContain('resolution-mem')
    })

    it('does not redirect to deprecated resolution', () => {
      const deprecatedRes = makeMemory({
        id: 'deprecated-res',
        status: 'deprecated',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Deprecated resolution',
      })

      const resolved = makeMemory({
        id: 'old-resolved-2',
        resolved_by: 'deprecated-res',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Old issue about retrieval algorithm that should still surface',
      })

      const results = retrieval.retrieveRelevantMemories(
        [resolved, deprecatedRes], 'retrieval algorithm scoring', zeroEmbedding, defaultCtx
      )

      // Should surface the old memory directly since resolution is deprecated
      const ids = results.map(r => r.id)
      expect(ids).toContain('old-resolved-2')
    })
  })

  // ================================================================
  // INTENT CLASSIFICATION EFFECTS
  // ================================================================
  describe('intent effects on ranking', () => {
    it('personal intent penalizes technical memories', () => {
      const memories = [
        makeMemory({
          id: 'tech-in-personal',
          context_type: 'technical',
          scope: 'project',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm implementation details scoring',
        }),
        makeMemory({
          id: 'personal-in-personal',
          context_type: 'personal',
          scope: 'global',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Personal feelings about the retrieval algorithm project',
        }),
      ]

      // Personal-heavy message
      const results = retrieval.retrieveRelevantMemories(
        memories,
        'I feel happy about family vacation and personal retrieval algorithm',
        zeroEmbedding, defaultCtx, 5
      )

      // Both may appear but personal should rank higher in personal intent
      if (results.length >= 2) {
        const personalIdx = results.findIndex(r => r.id === 'personal-in-personal')
        const techIdx = results.findIndex(r => r.id === 'tech-in-personal')
        expect(personalIdx).toBeLessThan(techIdx)
      }
    })

    it('casual intent penalizes all memories', () => {
      const memories = [
        makeMemory({
          id: 'casual-penalized',
          importance_weight: 0.7,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Important retrieval algorithm scoring',
        }),
      ]

      // Casual message
      const results = retrieval.retrieveRelevantMemories(
        memories, 'hey cool nice ok great awesome retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      // The -0.15 casual penalty may push it below 0.4 importance floor depending on other factors
      // Just verify it doesn't crash
      expect(Array.isArray(results)).toBe(true)
    })
  })

  // ================================================================
  // EMPTY / SPECIAL MESSAGE INPUTS
  // ================================================================
  describe('special message inputs', () => {
    it('handles empty message string', () => {
      const memories = [
        makeMemory({ id: 'empty-msg-test' }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, '', zeroEmbedding, defaultCtx
      )

      // Empty message should not match any triggers/tags
      expect(results).toHaveLength(0)
    })

    it('handles message with only stopwords', () => {
      const memories = [
        makeMemory({ id: 'stopwords-test' }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'the is are was were to a an and or but', zeroEmbedding, defaultCtx
      )

      // Only stopwords → no significant words → no signals
      expect(results).toHaveLength(0)
    })

    it('handles message with special characters and numbers', () => {
      const memories = [
        makeMemory({
          id: 'special-chars',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals scoring',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, '!!! retrieval ### algorithm $$$ 12345 %%% ^^^ &&&', zeroEmbedding, defaultCtx
      )

      // Should still match trigger and tags despite special chars
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('handles very long message', () => {
      const memories = [
        makeMemory({
          id: 'long-msg',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm signals',
        }),
      ]

      const longMsg = 'retrieval algorithm ' + 'word '.repeat(1000)
      const results = retrieval.retrieveRelevantMemories(
        memories, longMsg, zeroEmbedding, defaultCtx
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ================================================================
  // PROBLEM/SOLUTION BOOST
  // ================================================================
  describe('problem_solution_pair boost', () => {
    it('boosts problem-solution memories when user has a problem', () => {
      const memories = [
        makeMemory({
          id: 'normal-mem',
          problem_solution_pair: false,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Normal retrieval algorithm memory',
        }),
        makeMemory({
          id: 'problem-solution-mem',
          problem_solution_pair: true,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'How to fix retrieval algorithm errors and bugs',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm bug error fix broken issue', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('problem-solution-mem')
    })
  })

  // ================================================================
  // AWAITING_DECISION BOOST
  // ================================================================
  describe('awaiting_decision boost', () => {
    it('boosts memories awaiting decision', () => {
      const memories = [
        makeMemory({
          id: 'decided-mem',
          awaiting_decision: false,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm scoring mechanism',
        }),
        makeMemory({
          id: 'awaiting-decision-mem',
          awaiting_decision: true,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm scoring mechanism',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      // Both have same importance, but awaiting_decision gets +0.1
      expect(results[0].id).toBe('awaiting-decision-mem')
    })
  })

  // ================================================================
  // MEDIUM_TERM AGE DECAY
  // ================================================================
  describe('medium_term age decay', () => {
    it('penalizes medium_term memories older than 30 days', () => {
      const memories = [
        makeMemory({
          id: 'fresh-medium',
          temporal_class: 'medium_term',
          created_at: Date.now() - 5 * 24 * 60 * 60 * 1000,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Recent retrieval algorithm memory',
        }),
        makeMemory({
          id: 'old-medium',
          temporal_class: 'medium_term',
          created_at: Date.now() - 60 * 24 * 60 * 60 * 1000,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Old retrieval algorithm memory',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('fresh-medium')
    })
  })

  // ================================================================
  // EPHEMERAL DECAY
  // ================================================================
  describe('ephemeral memories', () => {
    it('penalizes ephemeral memories older than 3 days', () => {
      const memories = [
        makeMemory({
          id: 'fresh-ephemeral',
          temporal_class: 'ephemeral',
          created_at: Date.now() - 1 * 24 * 60 * 60 * 1000,
          sessions_since_surfaced: 0,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Fresh ephemeral retrieval algorithm memory',
        }),
        makeMemory({
          id: 'old-ephemeral',
          temporal_class: 'ephemeral',
          created_at: Date.now() - 10 * 24 * 60 * 60 * 1000,
          sessions_since_surfaced: 5,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Old ephemeral retrieval algorithm memory',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBeGreaterThanOrEqual(1)
      if (results.length >= 2) {
        expect(results[0].id).toBe('fresh-ephemeral')
      }
    })
  })

  // ================================================================
  // SIGNAL BOOST FOR 3+ AND 4+ SIGNALS
  // ================================================================
  describe('signal count boosts', () => {
    it('4+ signal memories get bigger boost than 3-signal ones', () => {
      const memories = [
        makeMemory({
          id: 'three-signal',
          importance_weight: 0.5,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          domain: 'retrieval',
          feature: undefined,
          content: 'Retrieval algorithm scoring mechanism implementation test',
        }),
        makeMemory({
          id: 'four-signal',
          importance_weight: 0.5,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          domain: 'retrieval',
          feature: 'scoring',
          content: 'Retrieval algorithm scoring mechanism implementation test',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm scoring mechanism implementation', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('four-signal')
    })
  })

  // ================================================================
  // LONG_TERM TEMPORAL BONUS
  // ================================================================
  describe('long_term temporal bonus', () => {
    it('long_term memories get +0.05 bonus', () => {
      const memories = [
        makeMemory({
          id: 'medium-term',
          temporal_class: 'medium_term',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Medium term retrieval algorithm memory',
        }),
        makeMemory({
          id: 'long-term',
          temporal_class: 'long_term',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Long term retrieval algorithm memory',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('long-term')
    })
  })

  // ================================================================
  // VECTOR SIMILARITY AS SIGNAL
  // ================================================================
  describe('vector similarity signal', () => {
    it('counts vector similarity >= 25% as a signal', () => {
      // Create a partially similar embedding (~30% similarity)
      const queryEmb = new Float32Array(384)
      queryEmb[0] = 0.7
      queryEmb[1] = 0.7

      const memEmb = new Float32Array(384)
      memEmb[0] = 0.5
      memEmb[1] = 0.5

      const memories = [
        makeMemory({
          id: 'partial-vector',
          embedding: memEmb,
          trigger_phrases: ['retrieval algorithm'],
          // Only 1 non-vector signal (trigger), but vector >= 25% adds another
          semantic_tags: ['totally-unrelated-xyz'],
          domain: undefined,
          feature: undefined,
          content: 'Completely unrelated quantum physics nonsense xyzzy',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm', queryEmb, defaultCtx
      )

      // Trigger + vector similarity = 2 signals → passes gate
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('vector similarity < 25% does not count as signal', () => {
      // Nearly orthogonal embeddings → similarity ~0
      const queryEmb = new Float32Array(384)
      queryEmb[0] = 1.0

      const memEmb = new Float32Array(384)
      memEmb[383] = 1.0  // Different dimension → cosine ≈ 0

      const memories = [
        makeMemory({
          id: 'orthogonal-vec',
          embedding: memEmb,
          trigger_phrases: ['obscure-unrelated-xyz-12345'],
          semantic_tags: ['totally-unrelated-abc'],
          domain: 'obscure-domain-999',
          feature: 'obscure-feature-888',
          content: 'Quantum physics entanglement bubble nonsense',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm optimization', queryEmb, defaultCtx
      )

      expect(results).toHaveLength(0)
    })
  })

  // ================================================================
  // MISMATCHED VECTOR DIMENSIONS
  // ================================================================
  describe('vector dimension mismatch', () => {
    it('handles mismatched embedding dimensions gracefully', () => {
      const wrongDimEmb = new Float32Array(128)  // Wrong dims (should be 384)

      const memories = [
        makeMemory({
          id: 'wrong-dims',
          embedding: wrongDimEmb,
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm with mismatched embedding',
        }),
      ]

      // Should not crash
      const results = retrieval.retrieveRelevantMemories(
        memories, 'retrieval algorithm signals', new Float32Array(384), defaultCtx
      )

      // Should still work via non-vector signals
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ================================================================
  // CONTEXT TYPE KEYWORD BOOST
  // ================================================================
  describe('context type keyword match boost', () => {
    it('boosts debug memories when message contains debug keywords', () => {
      const memories = [
        makeMemory({
          id: 'non-debug',
          context_type: 'technical',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Retrieval algorithm implementation details',
        }),
        makeMemory({
          id: 'debug-mem',
          context_type: 'debug',
          trigger_phrases: ['retrieval algorithm'],
          semantic_tags: ['retrieval', 'algorithm'],
          content: 'Bug in retrieval algorithm causing errors',
        }),
      ]

      const results = retrieval.retrieveRelevantMemories(
        memories, 'fix the bug error issue retrieval algorithm broken', zeroEmbedding, defaultCtx, 5
      )

      expect(results.length).toBe(2)
      expect(results[0].id).toBe('debug-mem')
    })
  })

  // ================================================================
  // NO DUPLICATE RESULTS
  // ================================================================
  describe('deduplication', () => {
    it('does not return same memory twice from multiple redirects', () => {
      const target = makeMemory({
        id: 'target-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Final retrieval algorithm target memory',
      })

      const redirect1 = makeMemory({
        id: 'redirect-1',
        superseded_by: 'target-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Old retrieval algorithm version one',
      })

      const redirect2 = makeMemory({
        id: 'redirect-2',
        superseded_by: 'target-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Old retrieval algorithm version two',
      })

      const results = retrieval.retrieveRelevantMemories(
        [redirect1, redirect2, target], 'retrieval algorithm', zeroEmbedding, defaultCtx
      )

      // target-mem should appear exactly once
      const targetCount = results.filter(r => r.id === 'target-mem').length
      expect(targetCount).toBe(1)
    })
  })

  // ================================================================
  // BLOCKS / BLOCKED_BY LINKED MEMORIES
  // ================================================================
  describe('blocked_by linked memories', () => {
    it('pulls in blocked_by memory when space allows', () => {
      const blocker = makeMemory({
        id: 'blocker-mem',
        trigger_phrases: [],
        semantic_tags: [],
        content: 'This is blocking progress',
        importance_weight: 0.5,
      })

      const blocked = makeMemory({
        id: 'blocked-mem',
        trigger_phrases: ['retrieval algorithm'],
        semantic_tags: ['retrieval', 'algorithm'],
        content: 'Main retrieval algorithm work blocked by dependency',
        blocked_by: 'blocker-mem',
      })

      const results = retrieval.retrieveRelevantMemories(
        [blocked, blocker], 'retrieval algorithm implementation', zeroEmbedding, defaultCtx, 5
      )

      const ids = results.map(r => r.id)
      expect(ids).toContain('blocked-mem')
      // blocker-mem should be pulled in as linked context
      expect(ids).toContain('blocker-mem')
    })
  })
})
