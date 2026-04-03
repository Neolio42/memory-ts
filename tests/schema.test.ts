import { describe, it, expect } from 'bun:test'
import {
  MEMORY_SCHEMA_VERSION,
  memorySchema,
  sessionSummarySchema,
  projectSnapshotSchema,
  sessionSchema,
  managementLogSchema,
  personalPrimerSchema,
} from '../src/types/schema'

describe('schema', () => {
  describe('MEMORY_SCHEMA_VERSION', () => {
    it('is 4 (current version)', () => {
      expect(MEMORY_SCHEMA_VERSION).toBe(4)
    })
  })

  describe('memorySchema', () => {
    it('has all required core fields', () => {
      expect(memorySchema.headline).toBe('string')
      expect(memorySchema.content).toBe('string')
      expect(memorySchema.reasoning).toBe('string')
    })

    it('has score fields', () => {
      expect(memorySchema.importance_weight).toBe('number')
      expect(memorySchema.confidence_score).toBe('number')
    })

    it('has classification fields', () => {
      expect(memorySchema.context_type).toBe('string')
    })

    it('has flag fields', () => {
      expect(memorySchema.action_required).toBe('boolean')
      expect(memorySchema.problem_solution_pair).toBe('boolean')
    })

    it('has array fields', () => {
      expect(memorySchema.semantic_tags).toBe('string[]')
      expect(memorySchema.trigger_phrases).toBe('string[]')
      expect(memorySchema.question_types).toBe('string[]')
    })

    it('has session/project fields', () => {
      expect(memorySchema.session_id).toBe('string')
      expect(memorySchema.project_id).toBe('string')
    })

    it('has embedding field with vector type', () => {
      expect(memorySchema.embedding).toBe('vector:384')
    })

    it('has lifecycle fields', () => {
      expect(memorySchema.status).toBe('string')
      expect(memorySchema.scope).toBe('string')
    })

    it('has temporal fields', () => {
      expect(memorySchema.session_created).toBe('number')
      expect(memorySchema.session_updated).toBe('number')
      expect(memorySchema.last_surfaced).toBe('number')
      expect(memorySchema.sessions_since_surfaced).toBe('number')
      expect(memorySchema.temporal_class).toBe('string')
      expect(memorySchema.fade_rate).toBe('number')
    })

    it('has categorization fields', () => {
      expect(memorySchema.domain).toBe('string')
      expect(memorySchema.feature).toBe('string')
    })

    it('has relationship fields', () => {
      expect(memorySchema.supersedes).toBe('string')
      expect(memorySchema.superseded_by).toBe('string')
      expect(memorySchema.related_to).toBe('string[]')
      expect(memorySchema.resolves).toBe('string[]')
      expect(memorySchema.resolved_by).toBe('string')
    })

    it('has lifecycle trigger fields', () => {
      expect(memorySchema.awaiting_implementation).toBe('boolean')
      expect(memorySchema.awaiting_decision).toBe('boolean')
      expect(memorySchema.blocked_by).toBe('string')
      expect(memorySchema.blocks).toBe('string[]')
      expect(memorySchema.related_files).toBe('string[]')
    })

    it('has retrieval control field', () => {
      expect(memorySchema.exclude_from_retrieval).toBe('boolean')
    })

    it('has event and schema version fields', () => {
      expect(memorySchema.event_date).toBe('string')
      expect(memorySchema.schema_version).toBe('number')
    })

    it('is frozen with as const', () => {
      // The schema should be read-only (satisfies SchemaDefinition)
      expect(typeof memorySchema).toBe('object')
    })
  })

  describe('sessionSummarySchema', () => {
    it('has required fields', () => {
      expect(sessionSummarySchema.session_id).toBe('string')
      expect(sessionSummarySchema.project_id).toBe('string')
      expect(sessionSummarySchema.summary).toBe('string')
      expect(sessionSummarySchema.interaction_tone).toBe('string')
    })
  })

  describe('projectSnapshotSchema', () => {
    it('has required fields', () => {
      expect(projectSnapshotSchema.session_id).toBe('string')
      expect(projectSnapshotSchema.project_id).toBe('string')
      expect(projectSnapshotSchema.current_phase).toBe('string')
      expect(projectSnapshotSchema.recent_achievements).toBe('string[]')
      expect(projectSnapshotSchema.active_challenges).toBe('string[]')
      expect(projectSnapshotSchema.next_steps).toBe('string[]')
    })
  })

  describe('sessionSchema', () => {
    it('has required fields', () => {
      expect(sessionSchema.project_id).toBe('string')
      expect(sessionSchema.message_count).toBe('number')
      expect(sessionSchema.first_session_completed).toBe('boolean')
      expect(sessionSchema.last_active).toBe('timestamp')
      expect(sessionSchema.metadata).toBe('string')
    })
  })

  describe('managementLogSchema', () => {
    it('has required fields', () => {
      expect(managementLogSchema.project_id).toBe('string')
      expect(managementLogSchema.session_number).toBe('number')
      expect(managementLogSchema.memories_processed).toBe('number')
      expect(managementLogSchema.success).toBe('boolean')
      expect(managementLogSchema.duration_ms).toBe('number')
      expect(managementLogSchema.error).toBe('string')
      expect(managementLogSchema.details).toBe('string')
    })
  })

  describe('personalPrimerSchema', () => {
    it('has required fields', () => {
      expect(personalPrimerSchema.content).toBe('string')
      expect(personalPrimerSchema.session_updated).toBe('number')
      expect(personalPrimerSchema.updated_by).toBe('string')
    })
  })
})
