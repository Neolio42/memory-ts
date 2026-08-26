import { describe, it, expect } from 'vitest'
import {
  getProjectDisplayName,
  toApiMessages,
  extractSessionText,
  getSessionSummary,
  calculateStats,
  type ParsedSession,
  type ParsedProject,
  type ContentBlock,
} from '../src/core/session-parser'

// Helper to create a minimal ParsedSession
function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: overrides.id ?? 'test-session',
    filePath: overrides.filePath ?? '/test/session.jsonl',
    messages: overrides.messages ?? [],
    metadata: overrides.metadata ?? {
      messageCount: 0,
      toolUseCount: 0,
      hasThinkingBlocks: false,
      hasImages: false,
    },
    timestamps: overrides.timestamps ?? { first: '2024-01-01T00:00:00Z', last: '2024-01-01T01:00:00Z' },
    ...overrides,
  } as ParsedSession
}

describe('session-parser', () => {
  describe('getProjectDisplayName', () => {
    it('strips -home- prefix and returns last meaningful part', () => {
      const result = getProjectDisplayName('-home-user-projects-myproject')
      expect(result).toBe('myproject')
    })

    it('handles -Users- prefix (macOS)', () => {
      const result = getProjectDisplayName('-Users-john-code-myapp')
      expect(result).toBe('myapp')
    })

    it('handles -mnt-c-Users- prefix (WSL)', () => {
      const result = getProjectDisplayName('-mnt-c-Users-john-projects-thing')
      expect(result).toBe('thing')
    })

    it('skips intermediate directories like "projects", "code", "repos"', () => {
      const result = getProjectDisplayName('-home-user-code-mylib')
      expect(result).toBe('mylib')
    })

    it('returns fallback for simple names', () => {
      const result = getProjectDisplayName('myproject')
      expect(result).toBe('myproject')
    })

    it('handles empty string', () => {
      const result = getProjectDisplayName('')
      expect(result).toBe('')
    })

    it('handles single dash', () => {
      const result = getProjectDisplayName('-')
      expect(result).toBe('-')
    })
  })

  describe('toApiMessages', () => {
    it('converts session messages to API format', () => {
      const session = makeSession({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
      })
      const result = toApiMessages(session)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' })
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there' })
    })

    it('preserves content block arrays', () => {
      const blocks: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
      ]
      const session = makeSession({
        messages: [
          { role: 'user', content: blocks },
        ],
      })
      const result = toApiMessages(session)
      expect(result[0].content).toEqual(blocks)
    })

    it('returns empty array for empty session', () => {
      const session = makeSession({ messages: [] })
      const result = toApiMessages(session)
      expect(result).toHaveLength(0)
    })
  })

  describe('extractSessionText', () => {
    it('extracts plain text from string content', () => {
      const session = makeSession({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'World' },
        ],
      })
      expect(extractSessionText(session)).toBe('Hello\n\nWorld')
    })

    it('extracts text from TextBlock arrays', () => {
      const session = makeSession({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Part 1' },
              { type: 'text', text: 'Part 2' },
            ],
          },
        ],
      })
      expect(extractSessionText(session)).toBe('Part 1\n\nPart 2')
    })

    it('extracts text from ThinkingBlock arrays', () => {
      const session = makeSession({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Let me think about this' },
              { type: 'text', text: 'The answer' },
            ],
          },
        ],
      })
      const text = extractSessionText(session)
      expect(text).toContain('Let me think about this')
      expect(text).toContain('The answer')
    })

    it('skips non-text blocks like tool_use and tool_result', () => {
      const session = makeSession({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me check' },
              { type: 'tool_use', id: '1', name: 'Bash', input: { cmd: 'ls' } },
              { type: 'tool_result', tool_use_id: '1', content: 'file.txt' },
            ],
          },
        ],
      })
      const text = extractSessionText(session)
      expect(text).toBe('Let me check')
    })

    it('returns empty string for empty session', () => {
      const session = makeSession({ messages: [] })
      expect(extractSessionText(session)).toBe('')
    })
  })

  describe('getSessionSummary', () => {
    it('uses stored summary if available', () => {
      const session = makeSession({
        messages: [{ role: 'user', content: 'ignore this' }],
      })
      ;(session as any).summary = 'This is the stored summary'
      expect(getSessionSummary(session)).toBe('This is the stored summary')
    })

    it('truncates long stored summaries', () => {
      const longSummary = 'A'.repeat(300)
      const session = makeSession({ messages: [] })
      ;(session as any).summary = longSummary
      const result = getSessionSummary(session, 200)
      expect(result.length).toBeLessThanOrEqual(200)
      expect(result).toContain('...')
    })

    it('uses first user message when no summary', () => {
      const session = makeSession({
        messages: [
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'Build me a website' },
        ],
      })
      expect(getSessionSummary(session)).toBe('Build me a website')
    })

    it('skips XML-like system messages', () => {
      const session = makeSession({
        messages: [
          { role: 'user', content: '<system>Injected context</system>' },
          { role: 'user', content: 'Real user question' },
        ],
      })
      expect(getSessionSummary(session)).toBe('Real user question')
    })

    it('returns (no summary) when nothing available', () => {
      const session = makeSession({ messages: [] })
      expect(getSessionSummary(session)).toBe('(no summary)')
    })

    it('extracts from TextBlock content', () => {
      const session = makeSession({
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello from blocks' }],
          },
        ],
      })
      expect(getSessionSummary(session)).toBe('Hello from blocks')
    })
  })

  describe('calculateStats', () => {
    it('handles empty projects array', () => {
      const stats = calculateStats([])
      expect(stats.totalProjects).toBe(0)
      expect(stats.totalSessions).toBe(0)
      expect(stats.totalMessages).toBe(0)
      expect(stats.totalToolUses).toBe(0)
      expect(stats.oldestSession).toBeUndefined()
      expect(stats.newestSession).toBeUndefined()
    })

    it('counts projects, sessions, messages, tool uses', () => {
      const projects: ParsedProject[] = [
        {
          folderId: 'proj1',
          name: 'Project 1',
          path: '/tmp/proj1',
          sessions: [
            makeSession({
              id: 's1',
              metadata: { messageCount: 10, toolUseCount: 3, hasThinkingBlocks: false, hasImages: false },
            }),
            makeSession({
              id: 's2',
              metadata: { messageCount: 5, toolUseCount: 1, hasThinkingBlocks: true, hasImages: false },
            }),
          ],
        },
      ]
      const stats = calculateStats(projects)
      expect(stats.totalProjects).toBe(1)
      expect(stats.totalSessions).toBe(2)
      expect(stats.totalMessages).toBe(15)
      expect(stats.totalToolUses).toBe(4)
      expect(stats.sessionsWithThinking).toBe(1)
    })

    it('tracks images across sessions', () => {
      const projects: ParsedProject[] = [
        {
          folderId: 'proj1',
          name: 'Project 1',
          path: '/tmp/proj1',
          sessions: [
            makeSession({
              id: 's1',
              metadata: { messageCount: 1, toolUseCount: 0, hasThinkingBlocks: false, hasImages: true },
            }),
          ],
        },
      ]
      const stats = calculateStats(projects)
      expect(stats.sessionsWithImages).toBe(1)
    })

    it('finds oldest and newest timestamps', () => {
      const projects: ParsedProject[] = [
        {
          folderId: 'proj1',
          name: 'Project 1',
          path: '/tmp/proj1',
          sessions: [
            makeSession({
              id: 's1',
              timestamps: { first: '2024-06-01T00:00:00Z', last: '2024-06-01T01:00:00Z' },
              metadata: { messageCount: 1, toolUseCount: 0, hasThinkingBlocks: false, hasImages: false },
            }),
            makeSession({
              id: 's2',
              timestamps: { first: '2024-01-01T00:00:00Z', last: '2024-01-01T01:00:00Z' },
              metadata: { messageCount: 1, toolUseCount: 0, hasThinkingBlocks: false, hasImages: false },
            }),
          ],
        },
      ]
      const stats = calculateStats(projects)
      expect(stats.oldestSession).toBe('2024-01-01T00:00:00Z')
      expect(stats.newestSession).toBe('2024-06-01T01:00:00Z')
    })

    it('handles multiple projects', () => {
      const projects: ParsedProject[] = [
        {
          folderId: 'p1', name: 'P1', path: '/p1',
          sessions: [
            makeSession({
              metadata: { messageCount: 5, toolUseCount: 0, hasThinkingBlocks: false, hasImages: false },
            }),
          ],
        },
        {
          folderId: 'p2', name: 'P2', path: '/p2',
          sessions: [
            makeSession({
              metadata: { messageCount: 3, toolUseCount: 0, hasThinkingBlocks: false, hasImages: false },
            }),
          ],
        },
      ]
      const stats = calculateStats(projects)
      expect(stats.totalProjects).toBe(2)
      expect(stats.totalSessions).toBe(2)
      expect(stats.totalMessages).toBe(8)
    })
  })
})
