import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryStore, createStore, type StoreConfig } from '../src/core/store'
import type { CuratedMemory } from '../src/types/memory'

// ============================================================================
// MOCK: @rlabs-inc/fsdb
// ============================================================================
// Mock in-memory collection that simulates PersistentCollection behavior
class MockCollection {
  private records = new Map<string, any>()
  private idCounter = 0
  public schema: any
  public stale = false

  constructor(name: string, opts?: any) {
    this.schema = opts?.schema
  }

  async load() { return this }

  all() {
    return Array.from(this.records.values()).map(r => ({
      ...r,
      stale: this.stale,
      created: r._created ?? Date.now(),
      updated: r._updated ?? Date.now(),
      created_at: r._created ?? Date.now(),
      updated_at: r._updated ?? Date.now(),
    }))
  }

  get(id: string) {
    const r = this.records.get(id)
    if (!r) return null
    return {
      ...r,
      stale: this.stale,
      created: r._created ?? Date.now(),
      updated: r._updated ?? Date.now(),
      created_at: r._created ?? Date.now(),
      updated_at: r._updated ?? Date.now(),
    }
  }

  insert(data: any): string {
    const id = data.id ?? `rec_${++this.idCounter}_${Date.now()}`
    const now = Date.now()
    this.records.set(id, { ...data, id, _created: now, _updated: now })
    return id
  }

  update(id: string, updates: any) {
    const existing = this.records.get(id)
    if (!existing) return
    this.records.set(id, { ...existing, ...updates, _updated: Date.now() })
  }

  search(field: string, query: any, opts?: any) {
    // Simple mock: return all records as results with score 1.0
    const results = this.all().map(record => ({
      record,
      score: 1.0,
      stale: this.stale,
    }))
    if (opts?.topK) return results.slice(0, opts.topK)
    return results
  }

  setEmbedding(id: string, field: string, vec: any, content: string) {
    const existing = this.records.get(id)
    if (existing) {
      this.records.set(id, { ...existing, [field]: vec, content, _updated: Date.now() })
    }
  }
}

class MockDatabase {
  private collections = new Map<string, MockCollection>()
  public closed = false

  collection(name: string, opts?: any): MockCollection {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection(name, opts))
    }
    return this.collections.get(name)!
  }

  close() { this.closed = true }
}

// Track created databases for assertions
const createdDbs: MockDatabase[] = []

// Mock the module
const originalFsdb = require('@rlabs-inc/fsdb')

// We'll use a custom store that overrides the module loading
// Since we can't easily mock ESM imports in bun:test, we test through the public API
// by creating a MemoryStore with a test basePath and using the real fsdb with temp dirs

import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Create temp directory for each test suite
let tempDir: string

function createTempStore(config?: Partial<StoreConfig>): MemoryStore {
  return new MemoryStore({
    basePath: join(tempDir, 'memory'),
    globalPath: join(tempDir, 'global'),
    ...config,
  })
}

describe('MemoryStore', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'memory-test-'))
  })

  // Clean up after each test would be nice but we'll manage in the test lifecycle

  describe('constructor', () => {
    it('creates store with default config', () => {
      const store = new MemoryStore()
      expect(store).toBeDefined()
      store.close()
    })

    it('creates store with custom basePath', () => {
      const store = createStore({ basePath: '/tmp/test-memory' })
      expect(store).toBeDefined()
      store.close()
    })

    it('creates store with custom globalPath', () => {
      const store = new MemoryStore({
        basePath: join(tempDir, 'memory'),
        globalPath: join(tempDir, 'custom-global'),
      })
      expect(store).toBeDefined()
      store.close()
    })
  })

  describe('isPersonalMemoriesEnabled', () => {
    it('returns true by default', () => {
      const store = createTempStore()
      expect(store.isPersonalMemoriesEnabled()).toBe(true)
      store.close()
    })
  })

  describe('session operations', () => {
    it('creates a new session', async () => {
      const store = createTempStore()
      try {
        const result = await store.getOrCreateSession('test-project', 'session-1')
        expect(result.isNew).toBe(true)
        expect(result.messageCount).toBe(0)
        expect(result.firstSessionCompleted).toBe(false)
      } finally { store.close() }
    })

    it('returns existing session on second call', async () => {
      const store = createTempStore()
      try {
        await store.getOrCreateSession('test-project', 'session-1')
        const result = await store.getOrCreateSession('test-project', 'session-1')
        expect(result.isNew).toBe(false)
        expect(result.messageCount).toBe(0)
      } finally { store.close() }
    })

    it('tracks firstSessionCompleted across sessions', async () => {
      const store = createTempStore()
      try {
        await store.getOrCreateSession('test-project', 'session-1')
        await store.markFirstSessionCompleted('test-project', 'session-1')
        const result = await store.getOrCreateSession('test-project', 'session-2')
        expect(result.firstSessionCompleted).toBe(true)
      } finally { store.close() }
    })

    it('increments message count', async () => {
      const store = createTempStore()
      try {
        await store.getOrCreateSession('test-project', 'session-1')
        const count1 = await store.incrementMessageCount('test-project', 'session-1')
        expect(count1).toBe(1)
        const count2 = await store.incrementMessageCount('test-project', 'session-1')
        expect(count2).toBe(2)
      } finally { store.close() }
    })

    it('throws when incrementing non-existent session', async () => {
      const store = createTempStore()
      try {
        await expect(
          store.incrementMessageCount('test-project', 'non-existent')
        ).rejects.toThrow('not found')
      } finally { store.close() }
    })

    it('marks first session as completed', async () => {
      const store = createTempStore()
      try {
        await store.getOrCreateSession('test-project', 'session-1')
        await store.markFirstSessionCompleted('test-project', 'session-1')
        const result = await store.getOrCreateSession('test-project', 'session-1')
        // The session itself should now be completed
        expect(result.firstSessionCompleted).toBe(true) // s1 was completed, so project has completed session
      } finally { store.close() }
    })
  })

  describe('memory operations', () => {
    const sampleMemory: CuratedMemory = {
      headline: 'Test headline',
      content: 'Test content with details',
      importance_weight: 0.8,
      confidence_score: 0.9,
      context_type: 'technical',
      temporal_class: 'medium_term',
      action_required: false,
      problem_solution_pair: false,
      semantic_tags: ['test', 'memory'],
      trigger_phrases: ['test trigger'],
      question_types: ['how'],
      reasoning: 'Test reasoning',
    }

    it('stores and retrieves a memory', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeMemory('test-project', 'session-1', sampleMemory)
        expect(id).toBeDefined()
        expect(typeof id).toBe('string')

        const memory = await store.getMemory('test-project', id)
        expect(memory).not.toBeNull()
        expect(memory!.content).toBe('Test content with details')
        expect(memory!.headline).toBe('Test headline')
        expect(memory!.importance_weight).toBe(0.8)
      } finally { store.close() }
    })

    it('stores memory with default values', async () => {
      const store = createTempStore()
      try {
        const minimalMemory: CuratedMemory = {
          headline: '',
          content: 'Minimal content',
          importance_weight: 0.5,
          confidence_score: 0.5,
          context_type: 'technical',
          temporal_class: 'medium_term',
          action_required: false,
          problem_solution_pair: false,
          semantic_tags: [],
          trigger_phrases: [],
          question_types: [],
          reasoning: '',
        }
        const id = await store.storeMemory('test-project', 'session-1', minimalMemory, undefined, 5)
        const memory = await store.getMemory('test-project', id)
        expect(memory).not.toBeNull()
      } finally { store.close() }
    })

    it('stores memory with embedding', async () => {
      const store = createTempStore()
      try {
        const embedding = new Float32Array([0.1, 0.2, 0.3])
        const id = await store.storeMemory('test-project', 'session-1', sampleMemory, embedding)
        expect(id).toBeDefined()
      } finally { store.close() }
    })

    it('stores memory with number array embedding', async () => {
      const store = createTempStore()
      try {
        const embedding = [0.1, 0.2, 0.3]
        const id = await store.storeMemory('test-project', 'session-1', sampleMemory, embedding)
        expect(id).toBeDefined()
      } finally { store.close() }
    })

    it('returns null for non-existent memory', async () => {
      const store = createTempStore()
      try {
        const memory = await store.getMemory('test-project', 'non-existent-id')
        expect(memory).toBeNull()
      } finally { store.close() }
    })

    it('retrieves all memories for a project', async () => {
      const store = createTempStore()
      try {
        await store.storeMemory('test-project', 's1', { ...sampleMemory, content: 'Memory 1' })
        await store.storeMemory('test-project', 's1', { ...sampleMemory, content: 'Memory 2' })
        await store.storeMemory('test-project', 's1', { ...sampleMemory, content: 'Memory 3' })

        const all = await store.getAllMemories('test-project')
        expect(all.length).toBe(3)
      } finally { store.close() }
    })

    it('isolates memories between projects', async () => {
      const store = createTempStore()
      try {
        await store.storeMemory('project-a', 's1', { ...sampleMemory, content: 'A memory' })
        await store.storeMemory('project-b', 's1', { ...sampleMemory, content: 'B memory' })

        const aMems = await store.getAllMemories('project-a')
        const bMems = await store.getAllMemories('project-b')
        expect(aMems.length).toBe(1)
        expect(bMems.length).toBe(1)
        expect(aMems[0].content).toBe('A memory')
        expect(bMems[0].content).toBe('B memory')
      } finally { store.close() }
    })
  })

  describe('updateMemory', () => {
    const sampleMemory: CuratedMemory = {
      headline: 'Test',
      content: 'Content',
      importance_weight: 0.5,
      confidence_score: 0.5,
      context_type: 'technical',
      temporal_class: 'medium_term',
      action_required: false,
      problem_solution_pair: false,
      semantic_tags: [],
      trigger_phrases: [],
      question_types: [],
      reasoning: '',
    }

    it('updates importance_weight with clamping', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeMemory('p', 's1', sampleMemory)
        const result = await store.updateMemory('p', id, { importance_weight: 1.5 })
        expect(result.success).toBe(true)
        expect(result.updated_fields).toContain('importance_weight')
        // Should be clamped to 1.0
        const mem = await store.getMemory('p', id)
        expect(mem!.importance_weight).toBe(1.0)
      } finally { store.close() }
    })

    it('clamps negative importance_weight to 0', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeMemory('p', 's1', sampleMemory)
        await store.updateMemory('p', id, { importance_weight: -0.5 })
        const mem = await store.getMemory('p', id)
        expect(mem!.importance_weight).toBe(0)
      } finally { store.close() }
    })

    it('updates multiple fields', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeMemory('p', 's1', sampleMemory)
        const result = await store.updateMemory('p', id, {
          status: 'archived',
          action_required: true,
          semantic_tags: ['updated'],
        })
        expect(result.success).toBe(true)
        expect(result.updated_fields).toContain('status')
        expect(result.updated_fields).toContain('action_required')
        expect(result.updated_fields).toContain('semantic_tags')
      } finally { store.close() }
    })

    it('returns success false for non-existent memory', async () => {
      const store = createTempStore()
      try {
        const result = await store.updateMemory('p', 'non-existent', { importance_weight: 0.5 })
        expect(result.success).toBe(false)
        expect(result.updated_fields).toEqual([])
      } finally { store.close() }
    })

    it('returns empty updated_fields when no updates provided', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeMemory('p', 's1', sampleMemory)
        const result = await store.updateMemory('p', id, {})
        expect(result.success).toBe(true)
        expect(result.updated_fields).toEqual([])
      } finally { store.close() }
    })
  })

  describe('summary operations', () => {
    it('stores and retrieves session summary', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeSessionSummary('p', 's1', 'We discussed testing patterns.')
        expect(id).toBeDefined()

        const summary = await store.getLatestSummary('p')
        expect(summary).not.toBeNull()
        expect(summary!.summary).toBe('We discussed testing patterns.')
        expect(summary!.session_id).toBe('s1')
      } finally { store.close() }
    })

    it('returns latest summary when multiple exist', async () => {
      const store = createTempStore()
      try {
        await store.storeSessionSummary('p', 's1', 'First summary')
        // Small delay to ensure different timestamps
        await new Promise(r => setTimeout(r, 10))
        await store.storeSessionSummary('p', 's2', 'Second summary')

        const summary = await store.getLatestSummary('p')
        expect(summary!.summary).toBe('Second summary')
      } finally { store.close() }
    })

    it('returns null when no summaries exist', async () => {
      const store = createTempStore()
      try {
        const summary = await store.getLatestSummary('nonexistent')
        expect(summary).toBeNull()
      } finally { store.close() }
    })

    it('stores summary with interaction tone', async () => {
      const store = createTempStore()
      try {
        await store.storeSessionSummary('p', 's1', 'Summary text', 'collaborative')
        const summary = await store.getLatestSummary('p')
        expect(summary!.interaction_tone).toBe('collaborative')
      } finally { store.close() }
    })
  })

  describe('snapshot operations', () => {
    it('stores and retrieves project snapshot', async () => {
      const store = createTempStore()
      try {
        const id = await store.storeProjectSnapshot('p', 's1', {
          current_phase: 'development',
          recent_achievements: ['Added tests'],
          active_challenges: ['CI failing'],
          next_steps: ['Fix CI'],
        })
        expect(id).toBeDefined()

        const snapshot = await store.getLatestSnapshot('p')
        expect(snapshot).not.toBeNull()
        expect(snapshot!.current_phase).toBe('development')
        expect(snapshot!.recent_achievements).toEqual(['Added tests'])
      } finally { store.close() }
    })

    it('returns latest snapshot', async () => {
      const store = createTempStore()
      try {
        await store.storeProjectSnapshot('p', 's1', {
          current_phase: 'planning',
          recent_achievements: [],
          active_challenges: [],
          next_steps: [],
        })
        await new Promise(r => setTimeout(r, 10))
        await store.storeProjectSnapshot('p', 's2', {
          current_phase: 'development',
          recent_achievements: [],
          active_challenges: [],
          next_steps: [],
        })

        const snapshot = await store.getLatestSnapshot('p')
        expect(snapshot!.current_phase).toBe('development')
      } finally { store.close() }
    })

    it('returns null when no snapshots exist', async () => {
      const store = createTempStore()
      try {
        const snapshot = await store.getLatestSnapshot('nonexistent')
        expect(snapshot).toBeNull()
      } finally { store.close() }
    })
  })

  describe('stats', () => {
    it('returns stats for a project', async () => {
      const store = createTempStore()
      try {
        await store.getOrCreateSession('p', 's1')
        const mem: CuratedMemory = {
          headline: '', content: 'test', importance_weight: 0.5, confidence_score: 0.5,
          context_type: 'technical', temporal_class: 'medium_term', action_required: false,
          problem_solution_pair: false, semantic_tags: [], trigger_phrases: [],
          question_types: [], reasoning: '',
        }
        await store.storeMemory('p', 's1', mem)

        const stats = await store.getProjectStats('p')
        expect(stats.totalMemories).toBe(1)
        expect(stats.totalSessions).toBe(1)
        expect(stats.latestSession).toBe('s1')
      } finally { store.close() }
    })

    it('returns zero stats for empty project', async () => {
      const store = createTempStore()
      try {
        const stats = await store.getProjectStats('empty-project')
        expect(stats.totalMemories).toBe(0)
        expect(stats.totalSessions).toBe(0)
        expect(stats.latestSession).toBeNull()
      } finally { store.close() }
    })
  })

  describe('close', () => {
    it('closes without error', () => {
      const store = createTempStore()
      expect(() => store.close()).not.toThrow()
    })
  })
})
