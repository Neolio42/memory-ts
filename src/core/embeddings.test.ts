// ============================================================================
// EMBEDDINGS TESTS
// Tests for embedding generator configuration and basic operations
// ============================================================================

import { describe, test, expect } from 'bun:test'
import { EmbeddingGenerator, createEmbeddings, getDefaultEmbeddings } from './embeddings'

describe('EmbeddingGenerator', () => {
  describe('constructor', () => {
    test('should create with default config', () => {
      const gen = createEmbeddings()
      expect(gen).toBeInstanceOf(EmbeddingGenerator)
      expect(gen.dimension).toBe(384)
      expect(gen.isReady).toBe(false)
    })

    test('should create with custom model name', () => {
      const gen = new EmbeddingGenerator({ model: 'custom-model' })
      expect(gen).toBeInstanceOf(EmbeddingGenerator)
      expect(gen.dimension).toBe(384)
    })

    test('should not be ready before initialization', () => {
      const gen = new EmbeddingGenerator()
      expect(gen.isReady).toBe(false)
    })
  })

  describe('dimension', () => {
    test('should return 384 for default model', () => {
      const gen = new EmbeddingGenerator()
      expect(gen.dimension).toBe(384)
    })
  })

  describe('embed', () => {
    test('should return zero vector for empty string', async () => {
      const gen = new EmbeddingGenerator()
      const result = await gen.embed('')
      expect(result).toBeInstanceOf(Float32Array)
      expect(result.length).toBe(384)
      expect(result.every(v => v === 0)).toBe(true)
    })

    test('should return zero vector for whitespace-only string', async () => {
      const gen = new EmbeddingGenerator()
      const result = await gen.embed('   ')
      expect(result).toBeInstanceOf(Float32Array)
      expect(result.length).toBe(384)
      expect(result.every(v => v === 0)).toBe(true)
    })
  })

  describe('embedBatch', () => {
    test('should return empty array for empty input', async () => {
      const gen = new EmbeddingGenerator()
      const result = await gen.embedBatch([])
      expect(result).toEqual([])
    })
  })

  describe('createEmbedder', () => {
    test('should return a function', () => {
      const gen = new EmbeddingGenerator()
      const embedder = gen.createEmbedder()
      expect(typeof embedder).toBe('function')
    })

    test('embedder should return zero vector for empty string', async () => {
      const gen = new EmbeddingGenerator()
      const embedder = gen.createEmbedder()
      const result = await embedder('')
      expect(result).toBeInstanceOf(Float32Array)
      expect(result.length).toBe(384)
    })
  })

  describe('getDefaultEmbeddings', () => {
    test('should return an EmbeddingGenerator instance', () => {
      const gen = getDefaultEmbeddings()
      expect(gen).toBeInstanceOf(EmbeddingGenerator)
    })

    test('should return the same instance on subsequent calls', () => {
      const gen1 = getDefaultEmbeddings()
      const gen2 = getDefaultEmbeddings()
      expect(gen1).toBe(gen2)
    })
  })
})
