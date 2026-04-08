// ============================================================================
// SESSION PARSER TESTS
// Tests for JSONL session parsing, conversation grouping, segmentation
// ============================================================================

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  parseSessionFile,
  parseSessionConversations,
  parseSessionFileWithSegments,
  getProjectDisplayName,
  extractSessionText,
  getSessionSummary,
  toApiMessages,
  calculateStats,
  type ParsedSession,
  type ParsedProject,
} from './session-parser'
import { join } from 'path'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'

const TEST_DIR = join(import.meta.dir, '../../test-data-session-parser')

function writeJsonl(filename: string, lines: object[]): string {
  const filepath = join(TEST_DIR, filename)
  const content = lines.map(l => JSON.stringify(l)).join('\n')
  writeFileSync(filepath, content)
  return filepath
}

// Helper to create a simple JSONL line
function userMessage(text: string, timestamp = '2026-04-08T10:00:00Z', extra: Record<string, any> = {}) {
  return {
    type: 'user',
    message: { role: 'user', content: text },
    timestamp,
    ...extra,
  }
}

function assistantMessage(text: string, timestamp = '2026-04-08T10:01:00Z', extra: Record<string, any> = {}) {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: text },
    timestamp,
    ...extra,
  }
}

function assistantToolUse(toolName: string, toolInput: Record<string, any>, timestamp = '2026-04-08T10:02:00Z') {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Using a tool...' },
        { type: 'tool_use', id: 'tool-1', name: toolName, input: toolInput },
      ],
    },
    timestamp,
  }
}

function toolResult(toolUseId: string, content: string, timestamp = '2026-04-08T10:03:00Z') {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: toolUseId, content },
      ],
    },
    timestamp,
  }
}

describe('getProjectDisplayName', () => {
  test('should extract project name from home path', () => {
    expect(getProjectDisplayName('-home-user-projects-myapp')).toBe('myapp')
  })

  test('should extract project name with intermediate dirs', () => {
    expect(getProjectDisplayName('-home-user-code-repos-mylib')).toBe('mylib')
  })

  test('should handle Windows-style paths', () => {
    expect(getProjectDisplayName('-mnt-c-Users-name-projects-webapp')).toBe('webapp')
  })

  test('should handle macOS-style paths', () => {
    expect(getProjectDisplayName('-Users-john-projects-dashboard')).toBe('dashboard')
  })

  test('should return full name when no known prefix', () => {
    expect(getProjectDisplayName('simple-name')).toBe('simple-name')
  })

  test('should handle single segment', () => {
    expect(getProjectDisplayName('myproject')).toBe('myproject')
  })
})

describe('parseSessionFile', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test('should parse a simple session with user and assistant messages', async () => {
    const filepath = writeJsonl('test-session.jsonl', [
      userMessage('Hello'),
      assistantMessage('Hi there!'),
      userMessage('How are you?'),
      assistantMessage('I am doing well!'),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.messages.length).toBe(4)
    expect(session.metadata.userMessageCount).toBe(2)
    expect(session.metadata.assistantMessageCount).toBe(2)
    expect(session.id).toBe('test-session')
  })

  test('should parse tool use blocks', async () => {
    const filepath = writeJsonl('tool-session.jsonl', [
      userMessage('Read the file'),
      assistantToolUse('Read', { file_path: '/tmp/test.txt' }),
      toolResult('tool-1', 'file contents here'),
      assistantMessage('Here is the file content'),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.metadata.toolUseCount).toBe(1)
    expect(session.metadata.toolResultCount).toBe(1)
  })

  test('should detect thinking blocks', async () => {
    const filepath = writeJsonl('thinking-session.jsonl', [
      userMessage('Think about this'),
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'Let me reason about this...' },
            { type: 'text', text: 'Here is my answer' },
          ],
        },
        timestamp: '2026-04-08T10:00:00Z',
      },
    ])

    const session = await parseSessionFile(filepath)
    expect(session.metadata.hasThinkingBlocks).toBe(true)
  })

  test('should skip non-message entries', async () => {
    const filepath = writeJsonl('mixed-session.jsonl', [
      { type: 'meta', timestamp: '2026-04-08T09:00:00Z' },
      { type: 'summary', summary: 'A summary entry' },
      userMessage('Hello'),
      assistantMessage('Hi'),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.messages.length).toBe(2)
    expect(session.summary).toBe('A summary entry')
  })

  test('should skip meta messages', async () => {
    const filepath = writeJsonl('meta-session.jsonl', [
      userMessage('Hello', '2026-04-08T10:00:00Z', { isMeta: true }),
      userMessage('Real message'),
      assistantMessage('Response'),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.messages.length).toBe(2)
    expect(session.metadata.hasMetaMessages).toBe(true)
  })

  test('should capture context from first user message', async () => {
    const filepath = writeJsonl('context-session.jsonl', [
      userMessage('Hello', '2026-04-08T10:00:00Z', {
        cwd: '/home/user/project',
        gitBranch: 'main',
      }),
      assistantMessage('Hi'),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.context).toBeTruthy()
    expect(session.context!.cwd).toBe('/home/user/project')
    expect(session.context!.gitBranch).toBe('main')
  })

  test('should estimate tokens', async () => {
    const filepath = writeJsonl('token-session.jsonl', [
      userMessage('A'.repeat(100)),
      assistantMessage('B'.repeat(200)),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.metadata.estimatedTokens).toBeGreaterThan(0)
    // ~4 chars per token, so roughly (100+200)/4 = 75 tokens
    expect(session.metadata.estimatedTokens).toBeGreaterThanOrEqual(70)
  })

  test('should capture timestamps', async () => {
    const filepath = writeJsonl('ts-session.jsonl', [
      userMessage('Hello', '2026-04-08T10:00:00Z'),
      assistantMessage('Hi', '2026-04-08T10:01:00Z'),
    ])

    const session = await parseSessionFile(filepath)
    expect(session.timestamps.first).toBe('2026-04-08T10:00:00Z')
    expect(session.timestamps.last).toBe('2026-04-08T10:01:00Z')
  })

  test('should handle empty file', async () => {
    const filepath = join(TEST_DIR, 'empty-session.jsonl')
    writeFileSync(filepath, '')

    const session = await parseSessionFile(filepath)
    expect(session.messages.length).toBe(0)
    expect(session.metadata.messageCount).toBe(0)
  })

  test('should handle malformed lines gracefully', async () => {
    const filepath = join(TEST_DIR, 'malformed-session.jsonl')
    writeFileSync(filepath, 'not json\n{"type":"user","message":{"role":"user","content":"hello"},"timestamp":"2026-04-08T10:00:00Z"}\nalso not json\n')

    const session = await parseSessionFile(filepath)
    expect(session.messages.length).toBe(1)
  })
})

describe('parseSessionConversations', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test('should group messages into conversations', async () => {
    const filepath = writeJsonl('conv-session.jsonl', [
      userMessage('First question'),
      assistantMessage('First answer'),
      userMessage('Second question'),
      assistantMessage('Second answer'),
    ])

    const conversations = await parseSessionConversations(filepath)
    expect(conversations.length).toBe(2)
    expect(conversations[0].userText).toBe('First question')
    expect(conversations[1].userText).toBe('Second question')
  })

  test('should include tool results in conversation', async () => {
    const filepath = writeJsonl('tool-conv-session.jsonl', [
      userMessage('Read the file'),
      assistantToolUse('Read', { file_path: '/tmp/test.txt' }),
      toolResult('tool-1', 'file contents'),
      assistantMessage('Here is the content'),
    ])

    const conversations = await parseSessionConversations(filepath)
    expect(conversations.length).toBe(1)
    expect(conversations[0].messages.length).toBe(4)
  })

  test('should mark continuation conversations', async () => {
    const filepath = writeJsonl('cont-session.jsonl', [
      userMessage('Normal start'),
      assistantMessage('Answer'),
      userMessage('Continued after compact', '2026-04-08T10:00:00Z', { isCompactSummary: true }),
      assistantMessage('Continued answer'),
    ])

    const conversations = await parseSessionConversations(filepath)
    expect(conversations.length).toBe(2)
    expect(conversations[0].isContinuation).toBe(false)
    expect(conversations[1].isContinuation).toBe(true)
  })

  test('should return empty for empty file', async () => {
    const filepath = join(TEST_DIR, 'empty-conv.jsonl')
    writeFileSync(filepath, '')

    const conversations = await parseSessionConversations(filepath)
    expect(conversations.length).toBe(0)
  })
})

describe('parseSessionFileWithSegments', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test('should return single segment for small session', async () => {
    const filepath = writeJsonl('small-session.jsonl', [
      userMessage('Hello'),
      assistantMessage('Hi'),
    ])

    const segments = await parseSessionFileWithSegments(filepath)
    expect(segments.length).toBe(1)
    expect(segments[0].segmentIndex).toBe(0)
    expect(segments[0].totalSegments).toBe(1)
  })

  test('should split into multiple segments when exceeding token limit', async () => {
    // Create a session with multiple conversations
    const lines: object[] = []
    for (let i = 0; i < 10; i++) {
      lines.push(userMessage(`Question ${i}: ${'x'.repeat(1000)}`, `2026-04-08T10:${i.toString().padStart(2, '0')}:00Z`))
      lines.push(assistantMessage(`Answer ${i}: ${'y'.repeat(1000)}`))
    }

    const filepath = writeJsonl('large-session.jsonl', lines)
    const segments = await parseSessionFileWithSegments(filepath, 1000) // Very low limit to force splitting

    expect(segments.length).toBeGreaterThan(1)
    // All segments should know the total
    for (const seg of segments) {
      expect(seg.totalSegments).toBe(segments.length)
    }
  })

  test('should return empty for empty file', async () => {
    const filepath = join(TEST_DIR, 'empty-seg.jsonl')
    writeFileSync(filepath, '')

    const segments = await parseSessionFileWithSegments(filepath)
    expect(segments.length).toBe(0)
  })

  test('should preserve sessionId and projectId in segments', async () => {
    const filepath = writeJsonl('id-session.jsonl', [
      userMessage('Hello'),
      assistantMessage('Hi'),
    ])

    const segments = await parseSessionFileWithSegments(filepath)
    expect(segments[0].sessionId).toBe('id-session')
  })
})

describe('extractSessionText', () => {
  test('should extract text from string content', () => {
    const session: ParsedSession = {
      id: 'test',
      projectId: 'test',
      projectName: 'test',
      filepath: '/test.jsonl',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
      timestamps: {},
      metadata: {
        messageCount: 2,
        userMessageCount: 1,
        assistantMessageCount: 1,
        toolUseCount: 0,
        toolResultCount: 0,
        hasThinkingBlocks: false,
        hasImages: false,
        isCompactSummary: false,
        hasMetaMessages: false,
        estimatedTokens: 0,
        fileSize: 0,
      },
    }

    const text = extractSessionText(session)
    expect(text).toContain('Hello')
    expect(text).toContain('Hi there')
  })

  test('should extract text from content blocks', () => {
    const session: ParsedSession = {
      id: 'test',
      projectId: 'test',
      projectName: 'test',
      filepath: '/test.jsonl',
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'thinking', thinking: 'I am thinking' },
          ],
        },
      ],
      timestamps: {},
      metadata: {
        messageCount: 1,
        userMessageCount: 0,
        assistantMessageCount: 1,
        toolUseCount: 0,
        toolResultCount: 0,
        hasThinkingBlocks: true,
        hasImages: false,
        isCompactSummary: false,
        hasMetaMessages: false,
        estimatedTokens: 0,
        fileSize: 0,
      },
    }

    const text = extractSessionText(session)
    expect(text).toContain('Hello')
    expect(text).toContain('I am thinking')
  })
})

describe('getSessionSummary', () => {
  function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
    return {
      id: 'test',
      projectId: 'test',
      projectName: 'test',
      filepath: '/test.jsonl',
      messages: [],
      timestamps: {},
      metadata: {
        messageCount: 0,
        userMessageCount: 0,
        assistantMessageCount: 0,
        toolUseCount: 0,
        toolResultCount: 0,
        hasThinkingBlocks: false,
        hasImages: false,
        isCompactSummary: false,
        hasMetaMessages: false,
        estimatedTokens: 0,
        fileSize: 0,
      },
      ...overrides,
    }
  }

  test('should use stored summary if available', () => {
    const session = makeSession({ summary: 'Stored summary here' })
    expect(getSessionSummary(session)).toBe('Stored summary here')
  })

  test('should truncate long stored summary', () => {
    const session = makeSession({ summary: 'A'.repeat(300) })
    const summary = getSessionSummary(session, 100)
    expect(summary.length).toBeLessThanOrEqual(103) // 100 + '...'
  })

  test('should use first user message text if no summary', () => {
    const session = makeSession({
      messages: [
        { role: 'user', content: 'First user message' },
        { role: 'assistant', content: 'Response' },
      ],
    })
    expect(getSessionSummary(session)).toBe('First user message')
  })

  test('should skip XML-like system messages', () => {
    const session = makeSession({
      messages: [
        { role: 'user', content: '<system>Injected context</system>' },
        { role: 'user', content: 'Real question' },
      ],
    })
    expect(getSessionSummary(session)).toBe('Real question')
  })

  test('should return fallback for empty session', () => {
    const session = makeSession()
    expect(getSessionSummary(session)).toBe('(no summary)')
  })
})

describe('toApiMessages', () => {
  test('should convert session to API format', () => {
    const session: ParsedSession = {
      id: 'test',
      projectId: 'test',
      projectName: 'test',
      filepath: '/test.jsonl',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
      timestamps: {},
      metadata: {
        messageCount: 2,
        userMessageCount: 1,
        assistantMessageCount: 1,
        toolUseCount: 0,
        toolResultCount: 0,
        hasThinkingBlocks: false,
        hasImages: false,
        isCompactSummary: false,
        hasMetaMessages: false,
        estimatedTokens: 0,
        fileSize: 0,
      },
    }

    const api = toApiMessages(session)
    expect(api.length).toBe(2)
    expect(api[0].role).toBe('user')
    expect(api[1].role).toBe('assistant')
  })
})

describe('calculateStats', () => {
  test('should calculate stats across projects', () => {
    const projects: ParsedProject[] = [
      {
        folderId: 'proj1',
        name: 'proj1',
        path: '/proj1',
        sessions: [
          {
            id: 's1',
            projectId: 'proj1',
            projectName: 'proj1',
            filepath: '/s1.jsonl',
            messages: [],
            timestamps: { first: '2026-01-01T00:00:00Z', last: '2026-01-01T01:00:00Z' },
            metadata: {
              messageCount: 10,
              userMessageCount: 5,
              assistantMessageCount: 5,
              toolUseCount: 3,
              toolResultCount: 3,
              hasThinkingBlocks: true,
              hasImages: false,
              isCompactSummary: false,
              hasMetaMessages: false,
              estimatedTokens: 1000,
              fileSize: 5000,
            },
          },
        ],
      },
      {
        folderId: 'proj2',
        name: 'proj2',
        path: '/proj2',
        sessions: [
          {
            id: 's2',
            projectId: 'proj2',
            projectName: 'proj2',
            filepath: '/s2.jsonl',
            messages: [],
            timestamps: { first: '2026-02-01T00:00:00Z', last: '2026-02-01T02:00:00Z' },
            metadata: {
              messageCount: 20,
              userMessageCount: 10,
              assistantMessageCount: 10,
              toolUseCount: 5,
              toolResultCount: 5,
              hasThinkingBlocks: false,
              hasImages: true,
              isCompactSummary: false,
              hasMetaMessages: false,
              estimatedTokens: 2000,
              fileSize: 10000,
            },
          },
        ],
      },
    ]

    const stats = calculateStats(projects)
    expect(stats.totalProjects).toBe(2)
    expect(stats.totalSessions).toBe(2)
    expect(stats.totalMessages).toBe(30)
    expect(stats.totalToolUses).toBe(8)
    expect(stats.sessionsWithThinking).toBe(1)
    expect(stats.sessionsWithImages).toBe(1)
    expect(stats.oldestSession).toBe('2026-01-01T00:00:00Z')
    expect(stats.newestSession).toBe('2026-02-01T02:00:00Z')
  })

  test('should handle empty projects', () => {
    const stats = calculateStats([])
    expect(stats.totalProjects).toBe(0)
    expect(stats.totalSessions).toBe(0)
    expect(stats.totalMessages).toBe(0)
    expect(stats.oldestSession).toBeUndefined()
    expect(stats.newestSession).toBeUndefined()
  })
})
