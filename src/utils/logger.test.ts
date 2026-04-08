// ============================================================================
// LOGGER TESTS
// Tests for logger configuration and method behavior
// ============================================================================

import { describe, test, expect, afterEach } from 'bun:test'
import { logger } from './logger'

describe('logger', () => {
  afterEach(() => {
    // Reset verbose to default
    logger.setVerbose(false)
  })

  describe('setVerbose / isVerbose', () => {
    test('should be off by default', () => {
      expect(logger.isVerbose()).toBe(false)
    })

    test('should enable verbose mode', () => {
      logger.setVerbose(true)
      expect(logger.isVerbose()).toBe(true)
    })

    test('should disable verbose mode', () => {
      logger.setVerbose(true)
      expect(logger.isVerbose()).toBe(true)
      logger.setVerbose(false)
      expect(logger.isVerbose()).toBe(false)
    })
  })

  describe('logging methods', () => {
    test('debug should not throw in non-verbose mode', () => {
      logger.setVerbose(false)
      expect(() => logger.debug('test debug message')).not.toThrow()
    })

    test('debug should not throw in verbose mode', () => {
      logger.setVerbose(true)
      expect(() => logger.debug('test debug message')).not.toThrow()
    })

    test('debug with prefix should not throw', () => {
      logger.setVerbose(true)
      expect(() => logger.debug('test message', 'prefix')).not.toThrow()
    })

    test('info should not throw', () => {
      expect(() => logger.info('test info message')).not.toThrow()
    })

    test('success should not throw', () => {
      expect(() => logger.success('test success message')).not.toThrow()
    })

    test('warn should not throw', () => {
      expect(() => logger.warn('test warning message')).not.toThrow()
    })

    test('error should not throw', () => {
      expect(() => logger.error('test error message')).not.toThrow()
    })

    test('memory should not throw', () => {
      expect(() => logger.memory('test memory event')).not.toThrow()
    })

    test('inject should not throw', () => {
      expect(() => logger.inject('test inject event')).not.toThrow()
    })

    test('session should not throw', () => {
      expect(() => logger.session('test session event')).not.toThrow()
    })

    test('primer should not throw', () => {
      expect(() => logger.primer('test primer event')).not.toThrow()
    })

    test('divider should not throw', () => {
      expect(() => logger.divider()).not.toThrow()
    })

    test('request should not throw', () => {
      expect(() => logger.request('GET', '/health')).not.toThrow()
    })

    test('request with projectId should not throw', () => {
      expect(() => logger.request('POST', '/memory/context', 'test-project')).not.toThrow()
    })
  })

  describe('formatted logging methods', () => {
    test('logCuratedMemories should not throw', () => {
      expect(() =>
        logger.logCuratedMemories([
          {
            content: 'Test memory content',
            importance_weight: 0.8,
            context_type: 'technical',
            semantic_tags: ['test'],
            action_required: false,
          },
        ])
      ).not.toThrow()
    })

    test('logCuratedMemories should handle empty array', () => {
      expect(() => logger.logCuratedMemories([])).not.toThrow()
    })

    test('logRetrievedMemories should not throw', () => {
      expect(() =>
        logger.logRetrievedMemories(
          [{ content: 'Test', score: 0.5, context_type: 'technical' }],
          'test query',
        )
      ).not.toThrow()
    })

    test('logRetrievedMemories should handle empty results', () => {
      expect(() => logger.logRetrievedMemories([], 'test query')).not.toThrow()
    })

    test('startup should not throw', () => {
      expect(() => logger.startup(8765, 'localhost', 'central')).not.toThrow()
    })

    test('logSessionStart should not throw', () => {
      expect(() => logger.logSessionStart('session-123', 'project-1', true)).not.toThrow()
    })

    test('logSessionStart for continuing session should not throw', () => {
      expect(() => logger.logSessionStart('session-123', 'project-1', false)).not.toThrow()
    })

    test('logCurationStart should not throw', () => {
      expect(() => logger.logCurationStart('session-123', 'session_end')).not.toThrow()
    })

    test('logCurationComplete with memories should not throw', () => {
      expect(() => logger.logCurationComplete(3, 'We worked on testing')).not.toThrow()
    })

    test('logCurationComplete with zero memories should not throw', () => {
      expect(() => logger.logCurationComplete(0)).not.toThrow()
    })

    test('logManagementStart should not throw', () => {
      expect(() => logger.logManagementStart(5)).not.toThrow()
    })

    test('logManagementComplete success should not throw', () => {
      expect(() =>
        logger.logManagementComplete({
          success: true,
          superseded: 2,
          linked: 1,
          actions: ['SUPERSEDED abc by def', 'LINKED ghi <-> jkl'],
        })
      ).not.toThrow()
    })

    test('logManagementComplete failure should not throw', () => {
      expect(() =>
        logger.logManagementComplete({
          success: false,
          error: 'Something went wrong',
        })
      ).not.toThrow()
    })
  })

  describe('verbose mode formatting', () => {
    test('logCuratedMemories in verbose mode should not throw', () => {
      logger.setVerbose(true)
      expect(() =>
        logger.logCuratedMemories([
          {
            content: 'A'.repeat(200), // Long content
            importance_weight: 0.9,
            context_type: 'technical',
            semantic_tags: ['a', 'b', 'c', 'd', 'e', 'f'],
            action_required: true,
          },
        ])
      ).not.toThrow()
    })

    test('logInjectedPayload in verbose mode should not throw', () => {
      logger.setVerbose(true)
      expect(() =>
        logger.logInjectedPayload('test payload content', 'primer')
      ).not.toThrow()
    })

    test('logInjectedPayload in non-verbose mode should not throw', () => {
      logger.setVerbose(false)
      expect(() =>
        logger.logInjectedPayload('test payload content', 'memories', 3)
      ).not.toThrow()
    })
  })
})
