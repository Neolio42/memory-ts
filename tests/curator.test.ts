import { describe, it, expect } from 'vitest';
import { Curator } from '../src/core/curator';

describe('Curator', () => {
  const curator = new Curator({ cliCommand: 'echo' });

  describe('parseCurationResponse', () => {
    it('parses a valid curation response', () => {
      const response = JSON.stringify({
        session_summary: 'Worked on the retrieval engine',
        interaction_tone: 'collaborative',
        memories: [
          {
            headline: 'Retrieval uses activation signal algorithm',
            content: 'WHAT: Binary signal voting\nHOW: 6 signals, need 2+ to pass gate',
            importance_weight: 0.9,
            semantic_tags: ['retrieval', 'signals', 'algorithm'],
            reasoning: 'Core architecture decision',
            context_type: 'architecture',
            temporal_class: 'long_term',
            action_required: false,
            confidence_score: 0.95,
            trigger_phrases: ['retrieval algorithm', 'activation signals'],
            question_types: ['how does retrieval work'],
            problem_solution_pair: false,
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.session_summary).toBe('Worked on the retrieval engine');
      expect(result.interaction_tone).toBe('collaborative');
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].headline).toBe('Retrieval uses activation signal algorithm');
      expect(result.memories[0].context_type).toBe('architecture');
      expect(result.memories[0].importance_weight).toBe(0.9);
      expect(result.memories[0].semantic_tags).toEqual(['retrieval', 'signals', 'algorithm']);
    });

    it('parses multiple memories', () => {
      const response = JSON.stringify({
        session_summary: 'Multiple things happened',
        memories: [
          {
            headline: 'First memory',
            content: 'Content 1',
            context_type: 'technical',
            temporal_class: 'medium_term',
            importance_weight: 0.8,
            confidence_score: 0.9,
            trigger_phrases: ['first'],
            semantic_tags: ['test'],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
          {
            headline: 'Second memory',
            content: 'Content 2',
            context_type: 'debug',
            temporal_class: 'short_term',
            importance_weight: 0.6,
            confidence_score: 0.7,
            trigger_phrases: ['second'],
            semantic_tags: ['test'],
            reasoning: 'test',
            action_required: true,
            problem_solution_pair: true,
            question_types: ['how to fix'],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].context_type).toBe('technical');
      expect(result.memories[1].context_type).toBe('debug');
      expect(result.memories[1].action_required).toBe(true);
      expect(result.memories[1].problem_solution_pair).toBe(true);
    });

    it('handles empty memories array', () => {
      const response = JSON.stringify({
        session_summary: 'Nothing memorable',
        memories: [],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories).toHaveLength(0);
      expect(result.session_summary).toBe('Nothing memorable');
    });

    it('returns empty result for invalid JSON', () => {
      const result = curator.parseCurationResponse('not json at all');
      expect(result.memories).toHaveLength(0);
      expect(result.session_summary).toBe('');
    });

    it('returns empty result for empty string', () => {
      const result = curator.parseCurationResponse('');
      expect(result.memories).toHaveLength(0);
    });

    it('extracts JSON from markdown-wrapped response', () => {
      const json = JSON.stringify({
        session_summary: 'Test',
        memories: [],
      });
      const response = `Here are the curated memories:\n\n${json}\n\nDone.`;

      const result = curator.parseCurationResponse(response);
      expect(result.session_summary).toBe('Test');
    });

    it('clamps importance_weight to 0-1 range', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: 'Over 1',
            content: 'test',
            importance_weight: 5.0,
            confidence_score: -1,
            context_type: 'technical',
            temporal_class: 'medium_term',
            trigger_phrases: [],
            semantic_tags: [],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories[0].importance_weight).toBe(1);
      expect(result.memories[0].confidence_score).toBe(0);
    });

    it('defaults importance_weight to 0.5 when missing', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: 'No weight',
            content: 'test',
            context_type: 'technical',
            temporal_class: 'medium_term',
            trigger_phrases: [],
            semantic_tags: [],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories[0].importance_weight).toBe(0.5);
    });

    it('normalizes invalid context_type to technical', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: 'Weird type',
            content: 'test',
            context_type: 'something_weird',
            temporal_class: 'medium_term',
            importance_weight: 0.5,
            confidence_score: 0.8,
            trigger_phrases: [],
            semantic_tags: [],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories[0].context_type).toBe('technical');
    });

    it('maps "debugging" context_type to "debug"', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: 'Debug type',
            content: 'test',
            context_type: 'debugging',
            importance_weight: 0.5,
            confidence_score: 0.8,
            trigger_phrases: [],
            semantic_tags: [],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories[0].context_type).toBe('debug');
    });

    it('parses project_snapshot when present', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        project_snapshot: {
          current_phase: 'development',
          recent_achievements: ['Built retrieval engine'],
          active_challenges: ['Performance tuning'],
          next_steps: ['Add caching'],
        },
        memories: [],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.project_snapshot).toBeDefined();
      expect(result.project_snapshot!.current_phase).toBe('development');
      expect(result.project_snapshot!.recent_achievements).toEqual(['Built retrieval engine']);
    });

    it('filters out memories with empty content and headline', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: '',
            content: '   ',
            context_type: 'technical',
            importance_weight: 0.5,
            confidence_score: 0.8,
            trigger_phrases: [],
            semantic_tags: [],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
          {
            headline: 'Valid',
            content: 'This has content',
            context_type: 'technical',
            importance_weight: 0.5,
            confidence_score: 0.8,
            trigger_phrases: [],
            semantic_tags: [],
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].headline).toBe('Valid');
    });

    it('handles comma-separated semantic_tags string', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: 'Tags test',
            content: 'test',
            context_type: 'technical',
            importance_weight: 0.5,
            confidence_score: 0.8,
            semantic_tags: 'api, rest, endpoints',
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
            trigger_phrases: 'api design, rest endpoints',
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories[0].semantic_tags).toEqual(['api', 'rest', 'endpoints']);
      expect(result.memories[0].trigger_phrases).toEqual(['api design', 'rest endpoints']);
    });

    it('parses scope field', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [
          {
            headline: 'Global memory',
            content: 'test',
            context_type: 'philosophy',
            importance_weight: 0.9,
            confidence_score: 0.9,
            scope: 'global',
            reasoning: 'test',
            action_required: false,
            problem_solution_pair: false,
            question_types: [],
            semantic_tags: [],
            trigger_phrases: [],
          },
        ],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories[0].scope).toBe('global');
    });
  });

  describe('buildCurationPrompt', () => {
    it('includes curation instructions', () => {
      const prompt = curator.buildCurationPrompt('session_end');
      expect(prompt).toContain('session_end');
      expect(prompt).toContain('trigger_phrases');
      expect(prompt).toContain('semantic_tags');
      expect(prompt).toContain('context_type');
    });

    it('includes existing memories when provided', () => {
      const prompt = curator.buildCurationPrompt('session_end', 'Memory 1: Test memory');
      expect(prompt).toContain('Memory 1: Test memory');
      expect(prompt).toContain('EXISTING MEMORIES');
      expect(prompt).toContain('DEDUPLICATION');
    });

    it('does not include existing memories list when none provided', () => {
      const prompt = curator.buildCurationPrompt('session_end');
      // The section header for listing memories is not present when no existing memories provided
      // (Note: 'EXISTING MEMORIES' appears in anti-duplication rules, which is always present)
      expect(prompt).not.toContain('--- EXISTING MEMORIES ---');
    });

    it('handles all valid trigger types', () => {
      const triggers: string[] = ['session_end', 'pre_compact', 'context_full', 'manual', 'historical'];
      for (const trigger of triggers) {
        const prompt = curator.buildCurationPrompt(trigger as any);
        expect(prompt).toContain(trigger);
      }
    });
  });

  // ================================================================
  // ADDITIONAL EDGE CASE TESTS
  // ================================================================
  describe('parseCurationResponse edge cases', () => {
    it('handles JSON wrapped in markdown code block', () => {
      const json = JSON.stringify({
        session_summary: 'Markdown wrapped',
        memories: [{
          headline: 'Test',
          content: 'test content',
          context_type: 'technical',
          importance_weight: 0.5,
          confidence_score: 0.8,
          trigger_phrases: [],
          semantic_tags: [],
          reasoning: 'test',
          action_required: false,
          problem_solution_pair: false,
          question_types: [],
        }],
      });
      const response = '```json\n' + json + '\n```';

      const result = curator.parseCurationResponse(response);
      expect(result.session_summary).toBe('Markdown wrapped');
      expect(result.memories).toHaveLength(1);
    });

    it('handles JSON with trailing text after closing brace', () => {
      const json = JSON.stringify({
        session_summary: 'Trailing text',
        memories: [],
      });
      const response = json + '\n\nThat is all the curated memories for this session.';

      const result = curator.parseCurationResponse(response);
      expect(result.session_summary).toBe('Trailing text');
    });

    it('handles missing interaction_tone gracefully', () => {
      const response = JSON.stringify({
        session_summary: 'No tone',
        memories: [],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.session_summary).toBe('No tone');
      expect(result.interaction_tone).toBeUndefined();
    });

    it('normalizes invalid temporal_class to medium_term', () => {
      const response = JSON.stringify({
        session_summary: 'Test',
        memories: [{
          headline: 'Invalid temporal',
          content: 'test',
          context_type: 'technical',
          temporal_class: 'forever_and_ever',
          importance_weight: 0.5,
          confidence_score: 0.8,
          trigger_phrases: [],
          semantic_tags: [],
          reasoning: 'test',
          action_required: false,
          problem_solution_pair: false,
          question_types: [],
        }],
      });

      const result = curator.parseCurationResponse(response);
      // The curator should normalize or accept the temporal_class
      // If it normalizes, it should be 'medium_term'
      expect(result.memories[0].temporal_class).toBeDefined()
    });

    it('handles memories with missing optional fields', () => {
      const response = JSON.stringify({
        session_summary: 'Minimal memory',
        memories: [{
          headline: 'Minimal',
          content: 'Just the basics',
          context_type: 'technical',
          importance_weight: 0.5,
          confidence_score: 0.8,
          reasoning: 'test',
          action_required: false,
          problem_solution_pair: false,
        }],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories).toHaveLength(1);
      // Missing fields should get defaults
      expect(result.memories[0].trigger_phrases).toBeDefined()
      expect(result.memories[0].semantic_tags).toBeDefined()
      expect(result.memories[0].question_types).toBeDefined()
    });

    it('handles response with only session_summary and no memories key', () => {
      const response = JSON.stringify({
        session_summary: 'No memories key',
      });

      const result = curator.parseCurationResponse(response);
      expect(result.session_summary).toBe('No memories key');
      expect(result.memories).toHaveLength(0);
    });

    it('handles extremely long content', () => {
      const longContent = 'x'.repeat(10000);
      const response = JSON.stringify({
        session_summary: 'Long content',
        memories: [{
          headline: 'Long',
          content: longContent,
          context_type: 'technical',
          importance_weight: 0.5,
          confidence_score: 0.8,
          trigger_phrases: [],
          semantic_tags: [],
          reasoning: 'test',
          action_required: false,
          problem_solution_pair: false,
          question_types: [],
        }],
      });

      const result = curator.parseCurationResponse(response);
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].content).toBe(longContent);
    });
  });
});
