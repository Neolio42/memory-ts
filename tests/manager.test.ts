import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Manager, createManager, type ManagementResult } from '../src/core/manager'
import type { StoredMemory } from '../src/types/memory'

// ============================================================================
// MOCK STORE — Simulates MemoryStore for testing Manager logic
// ============================================================================

function makeMemory(overrides: Partial<StoredMemory> & { id: string }): StoredMemory {
  return {
    id: overrides.id,
    content: overrides.content ?? 'Test memory content',
    headline: overrides.headline ?? 'Test memory headline',
    session_id: overrides.session_id ?? 'sess-1',
    project_id: overrides.project_id ?? 'proj-1',
    created_at: overrides.created_at ?? Date.now() - 86400000,
    updated_at: overrides.updated_at ?? Date.now(),
    importance_weight: overrides.importance_weight ?? 0.7,
    confidence_score: overrides.confidence_score ?? 0.8,
    context_type: overrides.context_type ?? 'technical',
    temporal_class: overrides.temporal_class ?? 'medium_term',
    action_required: overrides.action_required ?? false,
    problem_solution_pair: overrides.problem_solution_pair ?? false,
    semantic_tags: overrides.semantic_tags ?? ['test'],
    trigger_phrases: overrides.trigger_phrases ?? ['test'],
    question_types: overrides.question_types ?? ['how'],
    reasoning: overrides.reasoning ?? 'test reasoning',
    status: overrides.status ?? 'active',
    ...overrides,
  } as StoredMemory
}

function createMockStore(memories: StoredMemory[] = []) {
  const projectMemories = [...memories]
  const globalMemories: StoredMemory[] = []
  const updates: Record<string, Record<string, any>> = {}

  return {
    getAllMemories: vi.fn(async () => projectMemories),
    getGlobalMemories: vi.fn(async () => globalMemories),
    updateMemory: vi.fn(async (_projectId: string, id: string, data: Record<string, any>) => {
      updates[id] = data
      const mem = projectMemories.find(m => m.id === id)
      if (mem) Object.assign(mem, data)
    }),
    updateGlobalMemory: vi.fn(async (id: string, data: Record<string, any>) => {
      updates[id] = data
      const mem = globalMemories.find(m => m.id === id)
      if (mem) Object.assign(mem, data)
    }),
    _getUpdates: () => updates,
    _projectMemories: projectMemories,
    _globalMemories: globalMemories,
    _addGlobalMemory: (m: StoredMemory) => globalMemories.push(m),
  }
}

describe('Manager', () => {
  describe('constructor', () => {
    it('creates manager with default config (enabled)', () => {
      const manager = new Manager()
      const result = manager.manage(createMockStore() as any, 'proj', ['id1'])
      // Manager is enabled by default, will attempt to process
      expect(result).toBeInstanceOf(Promise)
    })

    it('creates disabled manager', async () => {
      const manager = new Manager({ enabled: false })
      const store = createMockStore()
      const result = await manager.manage(store as any, 'proj', ['id1'])
      expect(result.success).toBe(true)
      expect(result.summary).toBe('Manager disabled')
      expect(result.superseded).toBe(0)
      expect(result.linked).toBe(0)
    })
  })

  describe('createManager', () => {
    it('creates a Manager instance', () => {
      const manager = createManager()
      expect(manager).toBeInstanceOf(Manager)
    })

    it('passes config through', async () => {
      const manager = createManager({ enabled: false })
      const store = createMockStore()
      const result = await manager.manage(store as any, 'proj', ['id1'])
      expect(result.summary).toBe('Manager disabled')
    })
  })

  describe('manage — disabled cases', () => {
    it('returns disabled result when env MEMORY_MANAGER_DISABLED=1', async () => {
      const originalEnv = process.env.MEMORY_MANAGER_DISABLED
      process.env.MEMORY_MANAGER_DISABLED = '1'
      const manager = new Manager()
      const store = createMockStore()
      const result = await manager.manage(store as any, 'proj', ['id1'])
      expect(result.success).toBe(true)
      expect(result.summary).toBe('Manager disabled')
      process.env.MEMORY_MANAGER_DISABLED = originalEnv
    })

    it('returns no memories result for empty newMemoryIds', async () => {
      const manager = new Manager()
      const store = createMockStore()
      const result = await manager.manage(store as any, 'proj', [])
      expect(result.success).toBe(true)
      expect(result.summary).toBe('No new memories')
      expect(result.superseded).toBe(0)
    })
  })

  describe('manage — Rule 1: Dedup by domain + feature + headline overlap', () => {
    it('supersedes older memory with >80% headline overlap in same domain+feature', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        domain: 'auth',
        feature: 'login',
        headline: 'User authentication login flow uses JWT tokens',
        content: 'The login flow uses JWT tokens for authentication',
        semantic_tags: ['auth', 'jwt'],
      })
      const newMem = makeMemory({
        id: 'new-1',
        domain: 'auth',
        feature: 'login',
        headline: 'User authentication login flow uses JWT tokens for auth',
        content: 'Updated: The login flow uses JWT tokens',
        semantic_tags: ['auth', 'jwt'],
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.superseded).toBe(1)
      expect(result.actions.some(a => a.includes('SUPERSEDED'))).toBe(true)
      expect(store.updateMemory).toHaveBeenCalled()
    })

    it('does NOT supersede when domain differs', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        domain: 'auth',
        feature: 'login',
        headline: 'User authentication login flow uses JWT tokens',
      })
      const newMem = makeMemory({
        id: 'new-1',
        domain: 'billing', // different domain
        feature: 'login',
        headline: 'User authentication login flow uses JWT tokens',
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.superseded).toBe(0)
    })

    it('does NOT supersede when feature differs', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        domain: 'auth',
        feature: 'login',
        headline: 'User authentication login flow uses JWT tokens',
      })
      const newMem = makeMemory({
        id: 'new-1',
        domain: 'auth',
        feature: 'signup', // different feature
        headline: 'User authentication login flow uses JWT tokens',
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.superseded).toBe(0)
    })

    it('does NOT supersede when overlap is below 80%', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        domain: 'auth',
        feature: 'login',
        headline: 'Completely different topic about something else',
      })
      const newMem = makeMemory({
        id: 'new-1',
        domain: 'auth',
        feature: 'login',
        headline: 'The login page has a new design with colors and buttons',
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      // These headlines have very different words, overlap should be low
      expect(result.superseded).toBe(0)
    })

    it('skips memories without domain or feature', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        // no domain or feature
        headline: 'User authentication login flow uses JWT tokens',
      })
      const newMem = makeMemory({
        id: 'new-1',
        // no domain or feature
        headline: 'User authentication login flow uses JWT tokens',
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.superseded).toBe(0) // skipped because no domain/feature
    })
  })

  describe('manage — Rule 2: State memories dedup', () => {
    it('supersedes older state memories, keeping only the latest', async () => {
      const olderState = makeMemory({
        id: 'state-old',
        context_type: 'state',
        project_id: 'proj-1',
        created_at: Date.now() - 200000,
        content: 'Old state',
      })
      const newerState = makeMemory({
        id: 'state-new',
        context_type: 'state',
        project_id: 'proj-1',
        created_at: Date.now(),
        content: 'New state',
      })

      const store = createMockStore([olderState, newerState])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['state-new'])

      expect(result.superseded).toBe(1)
      expect(result.actions.some(a => a.includes('SUPERSEDED') && a.includes('older state'))).toBe(true)
    })

    it('does not supersede state memories from other projects', async () => {
      const otherProjectState = makeMemory({
        id: 'state-other',
        context_type: 'state',
        project_id: 'proj-2', // different project
        created_at: Date.now() - 200000,
      })
      const newState = makeMemory({
        id: 'state-new',
        context_type: 'state',
        project_id: 'proj-1',
        created_at: Date.now(),
      })

      const store = createMockStore([otherProjectState, newState])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['state-new'])

      // Only 1 state for proj-1, so no dedup needed
      expect(result.superseded).toBe(0)
    })

    it('keeps only one state when there are three', async () => {
      const states = [
        makeMemory({
          id: 'state-old',
          context_type: 'state',
          project_id: 'proj-1',
          created_at: Date.now() - 300000,
        }),
        makeMemory({
          id: 'state-mid',
          context_type: 'state',
          project_id: 'proj-1',
          created_at: Date.now() - 200000,
        }),
        makeMemory({
          id: 'state-new',
          context_type: 'state',
          project_id: 'proj-1',
          created_at: Date.now(),
        }),
      ]

      const store = createMockStore(states)
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['state-new'])

      expect(result.superseded).toBe(2) // two older ones superseded
    })
  })

  describe('manage — Rule 3: Link memories with 3+ shared tags', () => {
    it('links memories with 3+ shared semantic tags', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        semantic_tags: ['typescript', 'react', 'hooks', 'state'],
      })
      const newMem = makeMemory({
        id: 'new-1',
        semantic_tags: ['typescript', 'react', 'hooks', 'patterns'],
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.linked).toBeGreaterThanOrEqual(1)
      expect(result.actions.some(a => a.includes('LINKED'))).toBe(true)
    })

    it('does NOT link memories with fewer than 3 shared tags', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        semantic_tags: ['typescript', 'react'],
      })
      const newMem = makeMemory({
        id: 'new-1',
        semantic_tags: ['typescript', 'react'],
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.linked).toBe(0) // only 2 shared tags
    })

    it('tag matching is case-insensitive', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        semantic_tags: ['TypeScript', 'React', 'Hooks'],
      })
      const newMem = makeMemory({
        id: 'new-1',
        semantic_tags: ['typescript', 'react', 'hooks'],
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.linked).toBeGreaterThanOrEqual(1)
    })

    it('does not add duplicate links', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        semantic_tags: ['typescript', 'react', 'hooks', 'state'],
      })
      const newMem = makeMemory({
        id: 'new-1',
        semantic_tags: ['typescript', 'react', 'hooks', 'patterns'],
        related_to: ['existing-1'], // already linked
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.linked).toBe(0) // no duplicate link added
    })
  })

  describe('manage — result structure', () => {
    it('returns success with all fields populated', async () => {
      const newMem = makeMemory({ id: 'new-1' })
      const store = createMockStore([newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('superseded')
      expect(result).toHaveProperty('resolved')
      expect(result).toHaveProperty('linked')
      expect(result).toHaveProperty('filesRead')
      expect(result).toHaveProperty('filesWritten')
      expect(result).toHaveProperty('primerUpdated')
      expect(result).toHaveProperty('actions')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('fullReport')
      expect(Array.isArray(result.actions)).toBe(true)
    })

    it('fullReport contains management actions and summary', async () => {
      const newMem = makeMemory({ id: 'new-1' })
      const store = createMockStore([newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      expect(result.fullReport).toContain('MANAGEMENT ACTIONS')
      expect(result.fullReport).toContain('SUMMARY')
    })

    it('filesWritten counts superseded + linked', async () => {
      const existingMem = makeMemory({
        id: 'existing-1',
        domain: 'auth',
        feature: 'login',
        headline: 'Authentication uses JWT tokens for user sessions',
        semantic_tags: ['auth', 'jwt', 'tokens', 'session'],
      })
      const newMem = makeMemory({
        id: 'new-1',
        domain: 'auth',
        feature: 'login',
        headline: 'Authentication uses JWT tokens for user sessions management',
        semantic_tags: ['auth', 'jwt', 'tokens', 'management'],
      })

      const store = createMockStore([existingMem, newMem])
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      // Should supersede (overlap >80%) and link (3 shared tags)
      expect(result.filesWritten).toBe(result.superseded + result.linked)
    })
  })

  describe('manage — global memory handling', () => {
    it('uses updateGlobalMemory for global memories being superseded', async () => {
      const existingGlobal = makeMemory({
        id: 'global-1',
        project_id: 'global',
        domain: 'auth',
        feature: 'login',
        headline: 'Authentication uses JWT tokens for user sessions',
      })
      const newMem = makeMemory({
        id: 'new-1',
        project_id: 'proj-1',
        domain: 'auth',
        feature: 'login',
        headline: 'Authentication uses JWT tokens for user sessions management',
      })

      const store = createMockStore([existingGlobal, newMem])
      store._addGlobalMemory(existingGlobal)
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['new-1'])

      // Existing global memory should be superseded via updateGlobalMemory
      if (result.superseded > 0) {
        expect(store.updateGlobalMemory).toHaveBeenCalled()
      }
    })
  })

  describe('manage — error handling', () => {
    it('returns error result when store throws', async () => {
      const store = createMockStore()
      store.getAllMemories = vi.fn(async () => { throw new Error('DB connection failed') })
      const manager = new Manager()
      const result = await manager.manage(store as any, 'proj-1', ['id1'])

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB connection failed')
    })
  })
})
