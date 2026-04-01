import { describe, it, expect } from 'vitest';
import {
  applyV4Defaults,
  needsMigration,
  hasExpandableContent,
  getMemoryEmoji,
  MEMORY_TYPE_EMOJI,
  CONTEXT_TYPES,
} from '../src/types/memory';

describe('memory types', () => {
  describe('CONTEXT_TYPES', () => {
    it('has exactly 11 canonical types', () => {
      expect(CONTEXT_TYPES).toHaveLength(11);
    });

    it('includes all expected types', () => {
      const expected = ['technical', 'debug', 'architecture', 'decision', 'personal',
        'philosophy', 'workflow', 'milestone', 'breakthrough', 'unresolved', 'state'];
      for (const t of expected) {
        expect(CONTEXT_TYPES).toContain(t);
      }
    });
  });

  describe('applyV4Defaults', () => {
    it('applies technical defaults', () => {
      const result = applyV4Defaults({ context_type: 'technical' });
      expect(result.scope).toBe('project');
      expect(result.temporal_class).toBe('medium_term');
      expect(result.status).toBe('active');
      expect(result.schema_version).toBe(4);
      expect(result.fade_rate).toBe(0.03);
    });

    it('applies personal defaults (global scope, eternal)', () => {
      const result = applyV4Defaults({ context_type: 'personal' });
      expect(result.scope).toBe('global');
      expect(result.temporal_class).toBe('eternal');
      expect(result.fade_rate).toBe(0);
    });

    it('applies philosophy defaults (global scope, eternal)', () => {
      const result = applyV4Defaults({ context_type: 'philosophy' });
      expect(result.scope).toBe('global');
      expect(result.temporal_class).toBe('eternal');
    });

    it('applies state defaults (short_term)', () => {
      const result = applyV4Defaults({ context_type: 'state' });
      expect(result.temporal_class).toBe('short_term');
      expect(result.fade_rate).toBe(0.1);
    });

    it('preserves existing values over defaults', () => {
      const result = applyV4Defaults({
        context_type: 'technical',
        scope: 'global',
        fade_rate: 0.5,
      });
      expect(result.scope).toBe('global');
      expect(result.fade_rate).toBe(0.5);
    });

    it('initializes empty arrays', () => {
      const result = applyV4Defaults({ context_type: 'technical' });
      expect(result.related_to).toEqual([]);
      expect(result.resolves).toEqual([]);
      expect(result.blocks).toEqual([]);
      expect(result.related_files).toEqual([]);
    });

    it('defaults to technical when no context_type', () => {
      const result = applyV4Defaults({});
      expect(result.scope).toBe('project');
      expect(result.temporal_class).toBe('medium_term');
    });

    it('sets schema_version to 4', () => {
      const result = applyV4Defaults({ context_type: 'technical' });
      expect(result.schema_version).toBe(4);
    });

    it('preserves existing schema_version', () => {
      const result = applyV4Defaults({ schema_version: 3 });
      expect(result.schema_version).toBe(3);
    });

    it('sets boolean defaults to false', () => {
      const result = applyV4Defaults({ context_type: 'technical' });
      expect(result.awaiting_implementation).toBe(false);
      expect(result.awaiting_decision).toBe(false);
      expect(result.exclude_from_retrieval).toBe(false);
    });
  });

  describe('needsMigration', () => {
    it('returns true when no schema_version', () => {
      expect(needsMigration({})).toBe(true);
    });

    it('returns true when schema_version < 4', () => {
      expect(needsMigration({ schema_version: 3 })).toBe(true);
      expect(needsMigration({ schema_version: 2 })).toBe(true);
      expect(needsMigration({ schema_version: 1 })).toBe(true);
    });

    it('returns false when schema_version >= 4', () => {
      expect(needsMigration({ schema_version: 4 })).toBe(false);
      expect(needsMigration({ schema_version: 5 })).toBe(false);
    });
  });

  describe('hasExpandableContent', () => {
    it('returns true when headline exists', () => {
      expect(hasExpandableContent({ headline: 'Some headline' } as any)).toBe(true);
    });

    it('returns false when headline is empty', () => {
      expect(hasExpandableContent({ headline: '' } as any)).toBe(false);
    });

    it('returns false when headline is undefined', () => {
      expect(hasExpandableContent({} as any)).toBe(false);
    });
  });

  describe('getMemoryEmoji', () => {
    it('returns correct emoji for each type', () => {
      expect(getMemoryEmoji('technical')).toBe('🔧');
      expect(getMemoryEmoji('debug')).toBe('🐛');
      expect(getMemoryEmoji('architecture')).toBe('🏗️');
      expect(getMemoryEmoji('decision')).toBe('⚖️');
      expect(getMemoryEmoji('personal')).toBe('💜');
      expect(getMemoryEmoji('philosophy')).toBe('🌀');
      expect(getMemoryEmoji('workflow')).toBe('🔄');
      expect(getMemoryEmoji('milestone')).toBe('🏆');
      expect(getMemoryEmoji('breakthrough')).toBe('💡');
      expect(getMemoryEmoji('unresolved')).toBe('❓');
      expect(getMemoryEmoji('state')).toBe('📍');
    });

    it('returns default emoji for unknown types', () => {
      expect(getMemoryEmoji('unknown')).toBe('📝');
      expect(getMemoryEmoji('')).toBe('📝');
    });

    it('is case insensitive', () => {
      expect(getMemoryEmoji('Technical')).toBe('🔧');
      expect(getMemoryEmoji('DEBUG')).toBe('🐛');
    });

    it('MEMORY_TYPE_EMOJI has entry for every CONTEXT_TYPE', () => {
      for (const type of CONTEXT_TYPES) {
        expect(MEMORY_TYPE_EMOJI[type]).toBeDefined();
        expect(MEMORY_TYPE_EMOJI[type].length).toBeGreaterThan(0);
      }
    });
  });
});
