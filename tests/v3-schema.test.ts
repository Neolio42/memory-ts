import { describe, it, expect } from 'vitest'
import {
  V3_SCHEMA_VERSION,
  CANONICAL_CONTEXT_TYPES,
  CONTEXT_TYPE_MIGRATION_MAP,
} from '../src/migrations/v3-schema'
import type { CanonicalContextType } from '../src/migrations/v3-schema'

describe('v3-schema migration', () => {
  describe('V3_SCHEMA_VERSION', () => {
    it('is 3', () => {
      expect(V3_SCHEMA_VERSION).toBe(3)
    })
  })

  describe('CANONICAL_CONTEXT_TYPES', () => {
    it('has exactly 11 types', () => {
      expect(CANONICAL_CONTEXT_TYPES).toHaveLength(11)
    })

    it('includes all expected types', () => {
      const expected = [
        'technical', 'debug', 'architecture', 'decision', 'personal',
        'philosophy', 'workflow', 'milestone', 'breakthrough', 'unresolved', 'state',
      ]
      for (const t of expected) {
        expect(CANONICAL_CONTEXT_TYPES).toContain(t)
      }
    })

    it('types are unique', () => {
      const unique = new Set(CANONICAL_CONTEXT_TYPES)
      expect(unique.size).toBe(CANONICAL_CONTEXT_TYPES.length)
    })
  })

  describe('CONTEXT_TYPE_MIGRATION_MAP', () => {
    it('maps all canonical types to themselves', () => {
      for (const t of CANONICAL_CONTEXT_TYPES) {
        expect(CONTEXT_TYPE_MIGRATION_MAP[t]).toBe(t)
      }
    })

    it('maps implementation variants to technical', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['implementation']).toBe('technical')
      expect(CONTEXT_TYPE_MIGRATION_MAP['implementation_detail']).toBe('technical')
      expect(CONTEXT_TYPE_MIGRATION_MAP['feature_implementation']).toBe('technical')
    })

    it('maps debug variants to debug', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['debugging']).toBe('debug')
      expect(CONTEXT_TYPE_MIGRATION_MAP['bug_fix']).toBe('debug')
      expect(CONTEXT_TYPE_MIGRATION_MAP['active_debugging']).toBe('debug')
    })

    it('maps architectural variants to architecture', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['architectural']).toBe('architecture')
      expect(CONTEXT_TYPE_MIGRATION_MAP['architectural_insight']).toBe('architecture')
    })

    it('maps decision variants to decision', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['design_decision']).toBe('decision')
      expect(CONTEXT_TYPE_MIGRATION_MAP['technical_decision']).toBe('decision')
    })

    it('maps personal variants to personal', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['personal_context']).toBe('personal')
    })

    it('maps workflow variants to workflow', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['development_workflow']).toBe('workflow')
      expect(CONTEXT_TYPE_MIGRATION_MAP['development_methodology']).toBe('workflow')
    })

    it('maps work_in_progress to unresolved', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['work_in_progress']).toBe('unresolved')
    })

    it('maps milestone variants to milestone', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['technical_achievement']).toBe('milestone')
      expect(CONTEXT_TYPE_MIGRATION_MAP['project_milestone']).toBe('milestone')
    })

    it('maps state variants to state', () => {
      expect(CONTEXT_TYPE_MIGRATION_MAP['project_state']).toBe('state')
      expect(CONTEXT_TYPE_MIGRATION_MAP['technical_state']).toBe('state')
    })

    it('all values are canonical types', () => {
      const canonicalSet = new Set<string>(CANONICAL_CONTEXT_TYPES)
      for (const [key, value] of Object.entries(CONTEXT_TYPE_MIGRATION_MAP)) {
        expect(canonicalSet.has(value)).toBe(true)
      }
    })

    it('has substantial coverage (100+ mappings)', () => {
      const keys = Object.keys(CONTEXT_TYPE_MIGRATION_MAP)
      expect(keys.length).toBeGreaterThan(100)
    })
  })
})
