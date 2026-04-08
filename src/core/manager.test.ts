// ============================================================================
// MANAGER TESTS
// Tests for deterministic memory deduplication and linking
// ============================================================================

import { describe, test, expect } from 'bun:test'
import { Manager, createManager } from './manager'
import type { MemoryStore } from './store'
import type { StoredMemory } from '../types/memory'

// ============================================================================
// MOCK STORE - Returns full StoredMemory with all fields
// (Real store's getAllMemories doesn't include domain/feature in mapping)
// ============================================================================

function makeStoredMemory(overrides: Partial<StoredMemory> = {}): StoredMemory {
  return {
    id: 'mem-' + Math.random().toString(36).slice(2),
    content: 'Test memory',
    reasoning: 'Test',
    importance_weight: 0.5,
    confidence_score: 0.5,
    context_type: 'technical',
    temporal_class: 'medium_term',
    action_required: false,
    problem_solution_pair: false,
    semantic_tags: [],
    trigger_phrases: [],
    question_types: [],
    session_id: 'session-1',
    project_id: 'test-project',
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  }
}

interface MockStoreCall {
  method: string
  args: any[]
}

function createMockStore(
  projectMemories: StoredMemory[] = [],
  globalMemories: StoredMemory[] = [],
) {
  const calls: MockStoreCall[] = []

  const store: MemoryStore = {
    getAllMemories: async (_projectId: string) => {
      calls.push({ method: 'getAllMemories', args: [_projectId] })
      return projectMemories
    },
    getGlobalMemories: async () => {
      calls.push({ method: 'getGlobalMemories', args: [] })
      return globalMemories
    },
    updateMemory: async (_projectId: string, memoryId: string, updates: Record<string, any>) => {
      calls.push({ method: 'updateMemory', args: [_projectId, memoryId, updates] })
      // Apply updates to the memory in place
      const mem = projectMemories.find(m => m.id === memoryId)
      if (mem) Object.assign(mem, updates)
      return { success: true, updated_fields: Object.keys(updates) }
    },
    updateGlobalMemory: async (memoryId: string, updates: Record<string, any>) => {
      calls.push({ method: 'updateGlobalMemory', args: [memoryId, updates] })
      const mem = globalMemories.find(m => m.id === memoryId)
      if (mem) Object.assign(mem, updates)
      return { success: true }
    },
  } as unknown as MemoryStore

  return { store, calls }
}

describe('Manager', () => {
  describe('constructor', () => {
    test('should create manager with default config (enabled)', () => {
      const manager = createManager()
      expect(manager).toBeInstanceOf(Manager)
    })

    test('should create manager with disabled config', () => {
      const manager = createManager({ enabled: false })
      expect(manager).toBeInstanceOf(Manager)
    })
  })

  describe('manage', () => {
    test('should return early when disabled', async () => {
      const { store } = createMockStore()
      const manager = createManager({ enabled: false })
      const result = await manager.manage(store, 'test-project', ['id1'])
      expect(result.success).toBe(true)
      expect(result.superseded).toBe(0)
      expect(result.linked).toBe(0)
      expect(result.summary).toBe('Manager disabled')
    })

    test('should return early when no new memory IDs', async () => {
      const { store } = createMockStore()
      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [])
      expect(result.success).toBe(true)
      expect(result.superseded).toBe(0)
      expect(result.linked).toBe(0)
      expect(result.summary).toBe('No new memories')
    })

    test('should supersede older memory with same domain/feature/high headline overlap', async () => {
      const existingId = 'existing-1'
      const newId = 'new-1'

      const { store, calls } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'caching',
          headline: 'Caching layer uses Redis for storing computed embeddings and retrieval scores for the memory system',
          created_at: Date.now() - 1000,
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'caching',
          headline: 'Caching layer uses Redis for storing computed embeddings and retrieval scores in memory system',
          created_at: Date.now(),
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])

      expect(result.success).toBe(true)
      expect(result.superseded).toBe(1)
      expect(result.actions.length).toBe(1)
      expect(result.actions[0]).toContain('SUPERSEDED')
      // Verify the older memory was marked superseded
      const updateCall = calls.find(c => c.method === 'updateMemory' && c.args[1] === existingId)
      expect(updateCall).toBeTruthy()
      expect(updateCall!.args[2].status).toBe('superseded')
      expect(updateCall!.args[2].superseded_by).toBe(newId)
    })

    test('should NOT supersede memories with different domain', async () => {
      const existingId = 'existing-2'
      const newId = 'new-2'

      const { store } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'caching',
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          domain: 'retrieval', // different domain
          feature: 'caching',
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])
      expect(result.superseded).toBe(0)
    })

    test('should NOT supersede memories with different feature', async () => {
      const existingId = 'existing-3'
      const newId = 'new-3'

      const { store } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'caching',
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'batch-processing', // different feature
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])
      expect(result.superseded).toBe(0)
    })

    test('should NOT supersede memories with low headline overlap', async () => {
      const existingId = 'existing-4'
      const newId = 'new-4'

      const { store } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'caching',
          headline: 'Completely different topic about something else entirely',
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          domain: 'embeddings',
          feature: 'caching',
          headline: 'Redis caching with TTL for embedding results in production',
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])
      expect(result.superseded).toBe(0)
    })

    test('should link memories with 3+ shared semantic tags', async () => {
      const existingId = 'existing-5'
      const newId = 'new-5'

      const { store, calls } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          semantic_tags: ['embeddings', 'vector', 'search', 'similarity'],
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          semantic_tags: ['embeddings', 'vector', 'search', 'retrieval'],
          related_to: [],
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])

      expect(result.success).toBe(true)
      expect(result.linked).toBeGreaterThanOrEqual(1)
      expect(result.actions.some(a => a.startsWith('LINKED'))).toBe(true)
      // Verify the new memory got a related_to link
      const linkCall = calls.find(c => c.method === 'updateMemory' && c.args[1] === newId)
      expect(linkCall).toBeTruthy()
      expect(linkCall!.args[2].related_to).toContain(existingId)
    })

    test('should NOT link memories with fewer than 3 shared tags', async () => {
      const existingId = 'existing-6'
      const newId = 'new-6'

      const { store } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          semantic_tags: ['testing', 'unit'],
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          semantic_tags: ['testing', 'integration'],
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])
      // Only 1 shared tag ('testing'), should not link
      expect(result.linked).toBe(0)
    })

    test('should supersede older state memories for same project', async () => {
      const olderId = 'older-state'
      const newerId = 'newer-state'

      const { store, calls } = createMockStore([
        makeStoredMemory({
          id: olderId,
          project_id: 'test-project',
          context_type: 'state',
          created_at: Date.now() - 10000,
        }),
        makeStoredMemory({
          id: newerId,
          project_id: 'test-project',
          context_type: 'state',
          created_at: Date.now(),
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newerId])
      expect(result.success).toBe(true)
      expect(result.superseded).toBeGreaterThanOrEqual(1)
      // The older state memory should be superseded
      const supCall = calls.find(c => c.method === 'updateMemory' && c.args[1] === olderId)
      expect(supCall).toBeTruthy()
    })

    test('should handle errors gracefully', async () => {
      // Create a store that throws from getAllMemories
      const errorStore = {
        getAllMemories: async () => { throw new Error('DB connection lost') },
        getGlobalMemories: async () => { throw new Error('DB connection lost') },
      } as unknown as MemoryStore

      const manager = createManager()
      const result = await manager.manage(errorStore, 'test-project', ['some-id'])
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error).toContain('DB connection lost')
    })

    test('should return correct filesWritten count', async () => {
      const existingId = 'existing-7'
      const newId = 'new-7'

      const { store } = createMockStore([
        makeStoredMemory({
          id: existingId,
          project_id: 'test-project',
          semantic_tags: ['embeddings', 'vector', 'search'],
        }),
        makeStoredMemory({
          id: newId,
          project_id: 'test-project',
          semantic_tags: ['embeddings', 'vector', 'search'],
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [newId])
      expect(result.filesWritten).toBe(result.superseded + result.linked)
    })

    test('should include fullReport with actions', async () => {
      const id1 = 'mem-report'

      const { store } = createMockStore([
        makeStoredMemory({
          id: id1,
          project_id: 'test-project',
          semantic_tags: ['a', 'b'],
        }),
      ])

      const manager = createManager()
      const result = await manager.manage(store, 'test-project', [id1])
      expect(result.fullReport).toBeTruthy()
      expect(result.fullReport).toContain('MANAGEMENT ACTIONS')
      expect(result.fullReport).toContain('SUMMARY')
    })

    test('should handle global memory superseding', async () => {
      const existingGlobalId = 'global-1'
      const newGlobalId = 'global-new'

      const { store: store2, calls: calls2 } = createMockStore(
        [],
        [
          makeStoredMemory({
            id: existingGlobalId,
            project_id: 'global',
            domain: 'workflow',
            feature: 'preferences',
            headline: 'User prefers concise responses without trailing summaries excessive explanations',
            created_at: Date.now() - 1000,
          }),
          makeStoredMemory({
            id: newGlobalId,
            project_id: 'global',
            domain: 'workflow',
            feature: 'preferences',
            headline: 'User prefers concise responses without trailing summaries excessive explanations updated',
            created_at: Date.now(),
          }),
        ],
      )

      const manager = createManager()
      const result = await manager.manage(store2, 'test-project', [newGlobalId])
      expect(result.superseded).toBe(1)
      // Should use updateGlobalMemory for global memories
      const gCall = calls2.find(c => c.method === 'updateGlobalMemory' && c.args[0] === existingGlobalId)
      expect(gCall).toBeTruthy()
    })
  })
})
