// ============================================================================
// CURATOR TESTS
// Tests for memory curation logic, parsing, and validation
// ============================================================================

import { describe, test, expect } from 'bun:test'
import { Curator, createCurator } from './curator'

describe('Curator', () => {
  const curator = createCurator()

  describe('parseCurationResponse', () => {
    test('should parse a valid curation response', () => {
      const response = JSON.stringify({
        session_summary: 'We worked on testing',
        interaction_tone: 'collaborative',
        memories: [
          {
            headline: 'Test headline',
            content: 'Use bun:test for unit tests',
            importance_weight: 0.8,
            semantic_tags: ['testing', 'bun'],
            reasoning: 'Important for test coverage',
            context_type: 'technical',
            temporal_class: 'medium_term',
            action_required: false,
            confidence_score: 0.9,
            trigger_phrases: ['writing tests', 'test coverage'],
            question_types: ['how to test'],
            problem_solution_pair: false,
            scope: 'project',
            domain: 'testing',
            feature: 'unit-tests',
          },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.session_summary).toBe('We worked on testing')
      expect(result.interaction_tone).toBe('collaborative')
      expect(result.memories.length).toBe(1)
      expect(result.memories[0].content).toBe('Use bun:test for unit tests')
      expect(result.memories[0].headline).toBe('Test headline')
      expect(result.memories[0].importance_weight).toBe(0.8)
      expect(result.memories[0].context_type).toBe('technical')
      expect(result.memories[0].scope).toBe('project')
      expect(result.memories[0].domain).toBe('testing')
      expect(result.memories[0].feature).toBe('unit-tests')
    })

    test('should parse response with extra text around JSON', () => {
      const response = `Here are the curated memories:
{
  "session_summary": "Debugging session",
  "memories": []
}
That's all!`

      const result = curator.parseCurationResponse(response)
      expect(result.session_summary).toBe('Debugging session')
      expect(result.memories.length).toBe(0)
    })

    test('should return empty result for invalid JSON', () => {
      const result = curator.parseCurationResponse('not json at all')
      expect(result.session_summary).toBe('')
      expect(result.memories.length).toBe(0)
    })

    test('should return empty result for empty string', () => {
      const result = curator.parseCurationResponse('')
      expect(result.session_summary).toBe('')
      expect(result.memories.length).toBe(0)
    })

    test('should apply defaults for missing optional fields', () => {
      const response = JSON.stringify({
        session_summary: 'Quick session',
        memories: [
          {
            content: 'Some content',
          },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories.length).toBe(1)
      const mem = result.memories[0]
      expect(mem.importance_weight).toBe(0.5) // default
      expect(mem.confidence_score).toBe(0.8) // default
      expect(mem.context_type).toBe('technical') // default fallback
      expect(mem.temporal_class).toBe('medium_term') // default
      expect(mem.action_required).toBe(false)
      expect(mem.problem_solution_pair).toBe(false)
      expect(mem.semantic_tags).toEqual([])
      expect(mem.trigger_phrases).toEqual([])
      expect(mem.question_types).toEqual([])
    })

    test('should validate and map context_type values', () => {
      const testCases = [
        { input: 'technical', expected: 'technical' },
        { input: 'debug', expected: 'debug' },
        { input: 'architecture', expected: 'architecture' },
        { input: 'decision', expected: 'decision' },
        { input: 'personal', expected: 'personal' },
        { input: 'philosophy', expected: 'philosophy' },
        { input: 'workflow', expected: 'workflow' },
        { input: 'milestone', expected: 'milestone' },
        { input: 'breakthrough', expected: 'breakthrough' },
        { input: 'unresolved', expected: 'unresolved' },
        { input: 'state', expected: 'state' },
        { input: 'bug', expected: 'debug' },
        { input: 'debugging', expected: 'debug' },
        { input: 'architect', expected: 'architecture' },
        { input: 'todo', expected: 'unresolved' },
        { input: 'pending', expected: 'unresolved' },
        { input: 'preference', expected: 'personal' },
        { input: 'unknown_type', expected: 'technical' }, // fallback
      ]

      for (const { input, expected } of testCases) {
        const response = JSON.stringify({
          session_summary: '',
          memories: [{ content: 'test', context_type: input }],
        })
        const result = curator.parseCurationResponse(response)
        expect(result.memories[0].context_type).toBe(expected)
      }
    })

    test('should validate scope values', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          { content: 'global memory', scope: 'global' },
          { content: 'project memory', scope: 'project' },
          { content: 'bad memory', scope: 'invalid' },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories[0].scope).toBe('global')
      expect(result.memories[1].scope).toBe('project')
      expect(result.memories[2].scope).toBeUndefined()
    })

    test('should validate temporal_class values', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          { content: 'a', temporal_class: 'eternal' },
          { content: 'b', temporal_class: 'long_term' },
          { content: 'c', temporal_class: 'medium_term' },
          { content: 'd', temporal_class: 'short_term' },
          { content: 'e', temporal_class: 'ephemeral' },
          { content: 'f', temporal_class: 'long term' }, // space → underscore
          { content: 'g', temporal_class: 'invalid' }, // fallback to medium_term
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories[0].temporal_class).toBe('eternal')
      expect(result.memories[1].temporal_class).toBe('long_term')
      expect(result.memories[2].temporal_class).toBe('medium_term')
      expect(result.memories[3].temporal_class).toBe('short_term')
      expect(result.memories[4].temporal_class).toBe('ephemeral')
      expect(result.memories[5].temporal_class).toBe('long_term')
      expect(result.memories[6].temporal_class).toBe('medium_term') // default
    })

    test('should clamp importance_weight and confidence_score to 0-1', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          { content: 'high', importance_weight: 2.0, confidence_score: -0.5 },
          { content: 'low', importance_weight: -1.0, confidence_score: 1.5 },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories[0].importance_weight).toBe(1) // clamped to max
      expect(result.memories[0].confidence_score).toBe(0) // clamped to min
      expect(result.memories[1].importance_weight).toBe(0) // clamped to min
      expect(result.memories[1].confidence_score).toBe(1) // clamped to max
    })

    test('should convert comma-separated strings to arrays', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          {
            content: 'test',
            semantic_tags: 'tag1, tag2, tag3',
            trigger_phrases: 'trigger1,trigger2',
          },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories[0].semantic_tags).toEqual(['tag1', 'tag2', 'tag3'])
      expect(result.memories[0].trigger_phrases).toEqual(['trigger1', 'trigger2'])
    })

    test('should filter out memories with empty content and headline', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          { content: 'valid memory', headline: '' },
          { content: '', headline: '' },
          { content: '', headline: '  ' },
          { content: '   ', headline: '' },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories.length).toBe(1)
      expect(result.memories[0].content).toBe('valid memory')
    })

    test('should keep memories with headline but empty content', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          { content: '', headline: 'Valid headline' },
        ],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.memories.length).toBe(1)
      expect(result.memories[0].headline).toBe('Valid headline')
    })

    test('should parse project snapshot', () => {
      const response = JSON.stringify({
        session_summary: 'Work session',
        project_snapshot: {
          current_phase: 'testing',
          recent_achievements: ['wrote tests'],
          active_challenges: ['need more coverage'],
          next_steps: ['add integration tests'],
        },
        memories: [],
      })

      const result = curator.parseCurationResponse(response)
      expect(result.project_snapshot).toBeTruthy()
      expect(result.project_snapshot!.current_phase).toBe('testing')
      expect(result.project_snapshot!.recent_achievements).toEqual(['wrote tests'])
      expect(result.project_snapshot!.active_challenges).toEqual(['need more coverage'])
      expect(result.project_snapshot!.next_steps).toEqual(['add integration tests'])
    })

    test('should handle lifecycle metadata fields', () => {
      const response = JSON.stringify({
        session_summary: '',
        memories: [
          {
            content: 'planned feature',
            awaiting_implementation: true,
            awaiting_decision: true,
            event_date: '2026-04-08',
            supersedes: 'abc123',
            related_files: ['src/core/curator.ts'],
            anti_triggers: ['irrelevant context'],
          },
        ],
      })

      const result = curator.parseCurationResponse(response)
      const mem = result.memories[0]
      expect(mem.awaiting_implementation).toBe(true)
      expect(mem.awaiting_decision).toBe(true)
      expect(mem.event_date).toBe('2026-04-08')
      expect(mem.supersedes).toBe('abc123')
      expect(mem.related_files).toEqual(['src/core/curator.ts'])
      expect(mem.anti_triggers).toEqual(['irrelevant context'])
    })
  })

  describe('buildCurationPrompt', () => {
    test('should include trigger type in prompt', () => {
      const prompt = curator.buildCurationPrompt('session_end')
      expect(prompt).toContain('session_end')
    })

    test('should include trigger type for pre_compact', () => {
      const prompt = curator.buildCurationPrompt('pre_compact')
      expect(prompt).toContain('pre_compact')
    })

    test('should include existing memories when provided', () => {
      const prompt = curator.buildCurationPrompt('session_end', 'Existing: memory one')
      expect(prompt).toContain('Existing: memory one')
      expect(prompt).toContain('EXISTING MEMORIES')
    })

    test('should not include existing memories data section when not provided', () => {
      const prompt = curator.buildCurationPrompt('session_end')
      // The base prompt has Anti-Duplication Rules mentioning EXISTING MEMORIES,
      // but the data section with "already stored" should NOT be present
      expect(prompt).not.toContain('already stored — DO NOT re-extract these')
    })

    test('should include JSON return structure', () => {
      const prompt = curator.buildCurationPrompt('session_end')
      expect(prompt).toContain('"session_summary"')
      expect(prompt).toContain('"memories"')
    })
  })

  describe('personalMemoriesEnabled', () => {
    test('should include personal memories disable instruction when disabled', () => {
      const disabledCurator = createCurator({ personalMemoriesEnabled: false })
      const prompt = disabledCurator.buildCurationPrompt('session_end')
      expect(prompt).toContain('PERSONAL MEMORIES DISABLED')
    })

    test('should not include disable instruction when enabled', () => {
      const enabledCurator = createCurator({ personalMemoriesEnabled: true })
      const prompt = enabledCurator.buildCurationPrompt('session_end')
      expect(prompt).not.toContain('PERSONAL MEMORIES DISABLED')
    })
  })

  describe('constructor', () => {
    test('should create curator with default config', () => {
      const c = createCurator()
      expect(c).toBeInstanceOf(Curator)
    })

    test('should create curator with custom config', () => {
      const c = createCurator({
        apiKey: 'test-key',
        cliType: 'gemini-cli',
        personalMemoriesEnabled: false,
      })
      expect(c).toBeInstanceOf(Curator)
    })
  })
})
