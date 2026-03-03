// ============================================================================
// LOGGER - Beautiful console output for the memory system
// Powered by @rlabs-inc/prism for terminal rendering
// ============================================================================

import { s, log, box, table, badge, divider as prismDivider, kv, writeln } from '@rlabs-inc/prism'

/**
 * Format a timestamp (HH:MM:SS)
 */
function ts(): string {
  return s.dim(new Date().toISOString().slice(11, 19))
}

/**
 * Format a short session ID
 */
function shortId(id: string): string {
  return s.dim(id.slice(0, 8) + '...')
}

/**
 * Emoji map for quick visual scanning of context types
 */
const emojiMap: Record<string, string> = {
  breakthrough: '💡', decision: '⚖️', personal: '💜', technical: '🔧',
  technical_state: '📍', unresolved: '❓', preference: '⚙️', workflow: '🔄',
  architectural: '🏗️', debugging: '🐛', philosophy: '🌀', todo: '🎯',
  implementation: '⚡', problem_solution: '✅', project_context: '📦',
  milestone: '🏆', general: '📝', project_state: '📍', pending_task: '⏳',
  work_in_progress: '🔨', system_feedback: '📣', project_milestone: '🏆',
  architectural_insight: '🏛️', architectural_direction: '🧭',
}

/**
 * Logger configuration
 */
let _verbose = false

/**
 * Logger with beautiful styled output
 */
export const logger = {
  /**
   * Set verbose mode
   */
  setVerbose(enabled: boolean) {
    _verbose = enabled
  },

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return _verbose
  },

  /**
   * Debug message (only shown in verbose mode)
   */
  debug(message: string, prefix?: string) {
    if (!_verbose) return
    log.debug(prefix ? `[${prefix}] ${message}` : message)
  },

  /**
   * Info message
   */
  info(message: string) {
    log.info(message, { timestamp: true })
  },

  /**
   * Success message
   */
  success(message: string) {
    log.success(message, { timestamp: true })
  },

  /**
   * Warning message
   */
  warn(message: string) {
    log.warn(message, { timestamp: true })
  },

  /**
   * Error message
   */
  error(message: string) {
    log.error(message, { timestamp: true })
  },

  /**
   * Memory event (curation, storage)
   */
  memory(message: string) {
    writeln(`${ts()} ${s.magenta('🧠')} ${message}`)
  },

  /**
   * Injection event (memories surfaced)
   */
  inject(message: string) {
    writeln(`${ts()} ${s.cyan('✨')} ${message}`)
  },

  /**
   * Session event
   */
  session(message: string) {
    writeln(`${ts()} ${s.blue('📅')} ${message}`)
  },

  /**
   * Primer shown
   */
  primer(message: string) {
    writeln(`${ts()} ${s.yellow('📖')} ${message}`)
  },

  /**
   * Divider line
   */
  divider() {
    writeln(prismDivider())
  },

  /**
   * Request received (incoming)
   */
  request(method: string, path: string, projectId?: string) {
    const proj = projectId ? s.dim(` [${projectId}]`) : ''
    writeln(`${ts()} ${s.dim('→')} ${s.cyan(method)} ${path}${proj}`)
  },

  /**
   * Log curated memories in a beautiful format
   */
  logCuratedMemories(memories: Array<{
    content: string
    importance_weight: number
    context_type: string
    semantic_tags?: string[]
    action_required?: boolean
  }>) {
    writeln()
    writeln(`${ts()} ${s.magenta('🧠')} ${s.bold.magenta(`CURATED ${memories.length} MEMORIES`)}`)
    writeln()

    memories.forEach((m, i) => {
      const num = s.dim(`${i + 1}.`)
      const type = badge(m.context_type.toUpperCase(), { color: s.cyan, variant: 'bracket' })
      const importance = s.yellow(`${(m.importance_weight * 100).toFixed(0)}%`)

      writeln(`   ${num} ${type} ${importance}`)

      // Content: full in verbose, truncated in normal
      const content = !_verbose && m.content.length > 70
        ? m.content.slice(0, 70) + s.dim('...')
        : m.content
      writeln(`      ${content}`)

      // Tags
      if (m.semantic_tags?.length) {
        const tags = m.semantic_tags.slice(0, _verbose ? 8 : 4).join(s.dim(', '))
        writeln(`      ${s.dim('tags:')} ${tags}`)
      }

      // Special flags
      if (m.action_required) {
        writeln(`      ${s.red('⚡ ACTION REQUIRED')}`)
      }
      writeln()
    })
  },

  /**
   * Log retrieved memories (Activation Signal Algorithm)
   */
  logRetrievedMemories(memories: Array<{
    content: string
    score: number  // signals.count / 6
    context_type: string
  }>, query: string) {
    const queryPreview = !_verbose && query.length > 40
      ? query.slice(0, 40) + '...'
      : query

    writeln()
    writeln(`${ts()} ${s.cyan('✨')} ${s.bold(`SURFACING ${memories.length} MEMORIES`)}`)
    writeln(`      ${s.dim('query:')} "${queryPreview}"`)
    writeln()

    if (memories.length === 0) {
      writeln(`      ${s.dim('(no relevant memories for this context)')}`)
      writeln()
      return
    }

    memories.forEach((m, i) => {
      const signalCount = Math.round(m.score * 6)
      const signalBadge = badge(`${signalCount}sig`, { color: s.green, variant: 'bracket' })
      const emoji = emojiMap[m.context_type?.toLowerCase()] ?? '📝'
      const num = s.dim(`${i + 1}.`)

      // Content: full in verbose, truncated in normal
      const content = !_verbose && m.content.length > 55
        ? m.content.slice(0, 55) + s.dim('...')
        : m.content

      writeln(`   ${num} ${signalBadge} ${emoji}`)
      writeln(`      ${content}`)
    })
    writeln()
  },

  /**
   * Log server startup
   */
  startup(port: number, host: string, mode: string) {
    const info = kv([
      ['url', s.cyan(`http://${host}:${port}`)],
      ['storage', mode],
      ['engine', 'TypeScript + fsdb'],
      ['verbose', _verbose ? s.green('on') : s.dim('off')],
    ], { keyColor: s.dim, indent: 1 })

    writeln()
    writeln(box(info, {
      border: 'double',
      borderColor: 'magenta',
      title: '🧠 Memory Server',
      titleColor: s.bold,
    }))
    writeln()
  },

  /**
   * Log session start
   */
  logSessionStart(sessionId: string, projectId: string, isNew: boolean) {
    const status = isNew ? s.green('new session') : s.blue('continuing')

    writeln()
    writeln(`${ts()} ${s.blue('📅')} ${s.bold('SESSION')} ${shortId(sessionId)}`)
    writeln(`      ${s.dim('project:')} ${projectId}`)
    writeln(`      ${s.dim('status:')} ${status}`)
    writeln()
  },

  /**
   * Log curation start
   */
  logCurationStart(sessionId: string, trigger: string) {
    writeln()
    writeln(`${ts()} ${s.magenta('🧠')} ${s.bold('CURATING')} ${shortId(sessionId)}`)
    writeln(`      ${s.dim('trigger:')} ${trigger}`)
  },

  /**
   * Log curation complete
   */
  logCurationComplete(memoriesCount: number, summary?: string) {
    if (memoriesCount > 0) {
      writeln(`      ${s.dim('memories:')} ${s.green(String(memoriesCount))} extracted`)
      if (summary) {
        const text = !_verbose && summary.length > 50
          ? summary.slice(0, 50) + '...'
          : summary
        writeln(`      ${s.dim('summary:')} ${text}`)
      }
    } else {
      writeln(`      ${s.dim('result:')} no memories to extract`)
    }
    writeln()
  },

  /**
   * Log management agent starting
   */
  logManagementStart(memoriesCount: number) {
    writeln(`${ts()} ${s.blue('🔧')} ${s.bold('MANAGEMENT AGENT')}`)
    writeln(`      ${s.dim('processing:')} ${memoriesCount} new memories`)
  },

  /**
   * Log management agent results
   * Verbose: full details beautifully formatted
   * Normal: compact summary
   */
  logManagementComplete(result: {
    success: boolean
    superseded?: number
    resolved?: number
    linked?: number
    filesRead?: number
    filesWritten?: number
    primerUpdated?: boolean
    actions?: string[]
    summary?: string
    fullReport?: string
    error?: string
  }) {
    const actionIcon = (action: string): string => {
      if (action.startsWith('READ OK')) return s.dim('📖')
      if (action.startsWith('READ FAILED')) return s.red('❌')
      if (action.startsWith('WRITE OK')) return s.green('✏️')
      if (action.startsWith('WRITE FAILED')) return s.red('❌')
      if (action.startsWith('RECEIVED')) return s.cyan('📥')
      if (action.startsWith('CREATED')) return s.green('✨')
      if (action.startsWith('UPDATED')) return s.blue('📝')
      if (action.startsWith('SUPERSEDED')) return s.yellow('🔄')
      if (action.startsWith('RESOLVED')) return s.green('✅')
      if (action.startsWith('LINKED')) return s.cyan('🔗')
      if (action.startsWith('PRIMER')) return s.magenta('💜')
      if (action.startsWith('SKIPPED')) return s.dim('⏭️')
      if (action.startsWith('NO_ACTION')) return s.dim('◦')
      return '•'
    }

    if (result.success) {
      writeln(`      ${s.green('✓')} ${s.bold('Completed')}`)

      if (_verbose) {
        // ── VERBOSE: Full details ──
        const filesRead = result.filesRead ?? 0
        const filesWritten = result.filesWritten ?? 0
        const superseded = result.superseded ?? 0
        const resolved = result.resolved ?? 0
        const linked = result.linked ?? 0

        writeln(`      ${s.dim('─'.repeat(50))}`)
        writeln(`      ${s.cyan('📊')} ${s.bold('Statistics')}`)

        const stats = kv([
          ['Files read', filesRead > 0 ? s.green(String(filesRead)) : s.dim('0')],
          ['Files written', filesWritten > 0 ? s.green(String(filesWritten)) : s.dim('0')],
          ['Superseded', superseded > 0 ? s.yellow(String(superseded)) : s.dim('0')],
          ['Resolved', resolved > 0 ? s.green(String(resolved)) : s.dim('0')],
          ['Linked', linked > 0 ? s.cyan(String(linked)) : s.dim('0')],
          ['Primer', result.primerUpdated ? s.magenta('updated') : s.dim('unchanged')],
        ], { keyColor: s.dim, indent: 4 })
        writeln(stats)

        // Actions - no truncation in verbose
        if (result.actions && result.actions.length > 0) {
          writeln(`      ${s.dim('─'.repeat(50))}`)
          writeln(`      ${s.cyan('🎬')} ${s.bold('Actions')} ${s.dim(`(${result.actions.length} total)`)}`)
          for (const action of result.actions) {
            writeln(`        ${actionIcon(action)} ${s.dim(action)}`)
          }
        }

        // Full report
        if (result.fullReport) {
          writeln(`      ${s.dim('─'.repeat(50))}`)
          writeln(`      ${s.cyan('📋')} ${s.bold('Full Report')}`)
          for (const line of result.fullReport.split('\n')) {
            if (line.includes('===')) {
              writeln(`         ${s.bold(line)}`)
            } else if (line.match(/^[A-Z_]+:/)) {
              writeln(`         ${s.cyan(line)}`)
            } else {
              writeln(`         ${s.dim(line)}`)
            }
          }
        }

        writeln(`      ${s.dim('─'.repeat(50))}`)

      } else {
        // ── NORMAL: Compact summary ──
        const stats: string[] = []
        if (result.superseded && result.superseded > 0) stats.push(`${result.superseded} superseded`)
        if (result.resolved && result.resolved > 0) stats.push(`${result.resolved} resolved`)
        if (result.linked && result.linked > 0) stats.push(`${result.linked} linked`)
        if (result.primerUpdated) stats.push('primer updated')

        if (stats.length > 0) {
          writeln(`      ${s.dim('changes:')} ${stats.join(s.dim(', '))}`)
        } else {
          writeln(`      ${s.dim('changes:')} none (memories are current)`)
        }

        if (result.actions && result.actions.length > 0) {
          writeln(`      ${s.dim('actions:')}`)
          for (const action of result.actions.slice(0, 10)) {
            const text = action.length > 70 ? action.slice(0, 67) + '...' : action
            writeln(`        ${actionIcon(action)} ${s.dim(text)}`)
          }
          if (result.actions.length > 10) {
            writeln(`      ${s.dim(`  ... and ${result.actions.length - 10} more actions`)}`)
          }
        }
      }

    } else {
      // ── ERROR: Always show details ──
      writeln(`      ${s.yellow('⚠')} ${s.bold('Failed')}`)
      if (result.error) {
        writeln(`      ${s.red('error:')} ${result.error}`)
      }

      if (result.fullReport) {
        writeln(`      ${s.dim('─'.repeat(50))}`)
        writeln(`      ${s.red('📋')} ${s.bold('Error Report:')}`)
        for (const line of result.fullReport.split('\n')) {
          writeln(`         ${s.dim(line)}`)
        }
      }
    }
    writeln()
  },

  /**
   * Log memory retrieval scoring details (Activation Signal Algorithm)
   */
  logRetrievalScoring(params: {
    totalMemories: number
    currentMessage: string
    alreadyInjected: number
    preFiltered: number
    globalCount: number
    projectCount: number
    finalCount: number
    durationMs?: number
    selectedMemories: Array<{
      content: string
      reasoning: string
      signalCount: number
      importance_weight: number
      context_type: string
      semantic_tags: string[]
      isGlobal: boolean
      signals: {
        trigger: boolean
        triggerStrength: number
        tags: boolean
        tagCount: number
        domain: boolean
        feature: boolean
        content: boolean
        vector: boolean
        vectorSimilarity: number
      }
    }>
  }) {
    const { totalMemories, currentMessage, alreadyInjected, preFiltered, globalCount, projectCount, finalCount, durationMs, selectedMemories } = params

    const timeStr = durationMs !== undefined ? s.cyan(`${durationMs.toFixed(1)}ms`) : ''

    writeln()
    writeln(`${ts()} ${s.magenta('🧠')} ${s.bold('RETRIEVAL')} ${timeStr}`)

    // Pipeline summary
    const pipeline = kv([
      ['total', `${totalMemories} → ${s.dim('filtered:')} ${preFiltered} → ${s.dim('candidates:')} ${totalMemories - preFiltered}`],
      ['already injected', String(alreadyInjected)],
      ['message', `"${!_verbose && currentMessage.length > 60 ? currentMessage.slice(0, 60) + '...' : currentMessage}"`],
    ], { keyColor: s.dim, indent: 3 })
    writeln(pipeline)
    writeln()

    // Selection summary
    writeln(`      ${s.cyan('Global:')} ${globalCount} candidates → max 2 selected`)
    writeln(`      ${s.cyan('Project:')} ${projectCount} candidates`)
    writeln(`      ${s.green('Final:')} ${finalCount} memories selected`)
    writeln()

    if (selectedMemories.length === 0) {
      writeln(`      ${s.dim('📭 No relevant memories for this context')}`)
      writeln()
      return
    }

    // ── Verbose: Table view ──
    if (_verbose) {
      const formatSignals = (sig: typeof selectedMemories[0]['signals']): string => {
        const parts: string[] = []
        if (sig.trigger) parts.push(`trig:${(sig.triggerStrength * 100).toFixed(0)}%`)
        if (sig.tags) parts.push(`tags:${sig.tagCount}`)
        if (sig.domain) parts.push('dom')
        if (sig.feature) parts.push('feat')
        if (sig.content) parts.push('content')
        if (sig.vector) parts.push(`vec:${(sig.vectorSimilarity * 100).toFixed(0)}%`)
        return parts.join(', ')
      }

      const rows = selectedMemories.map((m, i) => ({
        '#': String(i + 1),
        sig: String(m.signalCount),
        imp: `${(m.importance_weight * 100).toFixed(0)}%`,
        type: m.context_type.toUpperCase(),
        scope: m.isGlobal ? 'G' : 'P',
        signals: formatSignals(m.signals),
      }))

      writeln(table(rows, {
        columns: [
          { key: '#', align: 'right' as const, width: 4 },
          { key: 'sig', align: 'center' as const, width: 5 },
          { key: 'imp', align: 'right' as const, width: 6 },
          { key: 'type', label: 'type', minWidth: 12 },
          { key: 'scope', align: 'center' as const, width: 7 },
          { key: 'signals', minWidth: 20 },
        ],
        border: 'rounded',
        borderColor: 'magenta',
      }))
      writeln()

      // Full content for each memory in verbose
      selectedMemories.forEach((m, i) => {
        const emoji = emojiMap[m.context_type?.toLowerCase()] ?? '📝'
        writeln(`      ${s.dim(`${i + 1}.`)} ${emoji} ${m.content}`)
        writeln()
      })

    } else {
      // ── Normal: Compact list ──
      writeln(s.dim('      ─'.repeat(30)))
      writeln(`      ${s.bold('SELECTION DETAILS')}`)
      writeln()

      selectedMemories.forEach((m, i) => {
        const num = s.dim(`${i + 1}.`)
        const signalsStr = s.green(`${m.signalCount} signals`)
        const imp = s.magenta(`imp:${(m.importance_weight * 100).toFixed(0)}%`)
        const type = s.yellow(m.context_type.toUpperCase())
        const scope = m.isGlobal ? s.blue(' [G]') : ''

        writeln(`   ${num} [${signalsStr} • ${imp}] ${type}${scope}`)

        const preview = m.content.length > 60
          ? m.content.slice(0, 60) + s.dim('...')
          : m.content
        writeln(`      ${preview}`)

        // Signal details
        const firedSignals: string[] = []
        if (m.signals.trigger) firedSignals.push(`trigger:${(m.signals.triggerStrength * 100).toFixed(0)}%`)
        if (m.signals.tags) firedSignals.push(`tags:${m.signals.tagCount}`)
        if (m.signals.domain) firedSignals.push('domain')
        if (m.signals.feature) firedSignals.push('feature')
        if (m.signals.content) firedSignals.push('content')
        if (m.signals.vector) firedSignals.push(`vector:${(m.signals.vectorSimilarity * 100).toFixed(0)}%`)

        if (firedSignals.length > 0) {
          writeln(`      ${s.cyan('signals:')} ${firedSignals.join(', ')}`)
        }
        writeln()
      })
    }
  },

  /**
   * Log score distribution for diagnostics
   */
  logScoreDistribution(params: {
    totalCandidates: number
    passedGatekeeper: number
    rejectedByGatekeeper: number
    buckets: Record<string, number>
    stats: { min: number; max: number; mean: number; stdev: number; spread: number }
    percentiles: Record<string, number>
    relevanceStats?: { min: number; max: number; spread: number }
    triggerAnalysis?: { perfect: number; zero: number; total: number }
    top5Spread?: number
    compressionWarning: boolean
    signalBreakdown?: {
      trigger: number
      tags: number
      domain: number
      feature: number
      content: number
      files: number
      vector: number
      total: number
    }
  }) {
    const { totalCandidates, passedGatekeeper, rejectedByGatekeeper, buckets, stats, signalBreakdown } = params

    writeln()
    writeln(s.dim('      ─'.repeat(30)))
    writeln(`      ${s.bold('ACTIVATION SIGNALS')}`)
    writeln()

    // Gatekeeper stats
    const passRate = totalCandidates > 0 ? ((passedGatekeeper / totalCandidates) * 100).toFixed(0) : '0'
    writeln(`      ${s.dim('Activated:')} ${s.green(String(passedGatekeeper))}/${totalCandidates} (${passRate}%)`)
    writeln(`      ${s.dim('Rejected:')}  ${rejectedByGatekeeper} (< 2 signals)`)
    writeln()

    // Signal breakdown
    if (signalBreakdown && signalBreakdown.total > 0) {
      if (_verbose) {
        // Verbose: table view
        const signals = [
          { signal: 'trigger', count: signalBreakdown.trigger },
          { signal: 'tags', count: signalBreakdown.tags },
          { signal: 'domain', count: signalBreakdown.domain },
          { signal: 'feature', count: signalBreakdown.feature },
          { signal: 'content', count: signalBreakdown.content },
          { signal: 'files', count: signalBreakdown.files },
          { signal: 'vector', count: signalBreakdown.vector },
        ].filter(sig => sig.count > 0).map(sig => ({
          signal: sig.signal,
          count: String(sig.count),
          pct: `${((sig.count / signalBreakdown.total) * 100).toFixed(0)}%`,
        }))

        writeln(table(signals, {
          border: 'rounded',
          borderColor: 'cyan',
          columns: [
            { key: 'signal', label: 'Signal' },
            { key: 'count', label: 'Count', align: 'right' as const },
            { key: 'pct', label: '%', align: 'right' as const },
          ],
        }))
      } else {
        // Normal: bar chart
        writeln(`      ${s.cyan('Signal Breakdown:')}`)
        const signals = [
          { name: 'trigger', count: signalBreakdown.trigger },
          { name: 'tags', count: signalBreakdown.tags },
          { name: 'domain', count: signalBreakdown.domain },
          { name: 'feature', count: signalBreakdown.feature },
          { name: 'content', count: signalBreakdown.content },
          { name: 'files', count: signalBreakdown.files },
          { name: 'vector', count: signalBreakdown.vector },
        ]
        for (const sig of signals) {
          const pct = ((sig.count / signalBreakdown.total) * 100).toFixed(0)
          const bar = '█'.repeat(Math.round(sig.count / signalBreakdown.total * 20))
          writeln(`        ${sig.name.padEnd(8)} ${bar.padEnd(20)} ${sig.count} (${pct}%)`)
        }
      }
      writeln()
    }

    // Stats
    if (stats.max > 0) {
      writeln(`      ${s.cyan('Signals:')} min=${stats.min} max=${stats.max} mean=${stats.mean}`)
      writeln()
    }

    // Histogram by signal count
    if (Object.keys(buckets).length > 0) {
      writeln(`      ${s.bold('Distribution:')}`)
      const maxBucketCount = Math.max(...Object.values(buckets), 1)
      const bucketOrder = ['2 signals', '3 signals', '4 signals', '5 signals', '6 signals', '7 signals']

      for (const bucket of bucketOrder) {
        const count = buckets[bucket] ?? 0
        if (count > 0 || bucket === '2 signals') {
          const barLen = Math.round((count / maxBucketCount) * 25)
          const bar = '█'.repeat(barLen) + s.dim('░'.repeat(25 - barLen))
          const countStr = count.toString().padStart(3)
          writeln(`      ${s.dim(bucket.padEnd(10))} ${bar} ${s.cyan(countStr)}`)
        }
      }
      writeln()
    }
  },

  /**
   * Log the full injected payload (verbose only)
   * Shows exactly what gets sent to the AI's context
   */
  logInjectedPayload(payload: string, type: 'primer' | 'memories' | 'action_items', count?: number) {
    if (!_verbose) return

    const titles: Record<string, string> = {
      primer: '📖 Injected Payload (Session Primer)',
      memories: `✨ Injected Payload (${count ?? 0} memor${count === 1 ? 'y' : 'ies'})`,
      action_items: `🎯 Injected Payload (${count ?? 0} action item${count === 1 ? '' : 's'})`,
    }

    writeln()
    writeln(box(payload, {
      border: 'rounded',
      borderColor: 'cyan',
      title: titles[type],
      titleColor: s.bold,
    }))
    writeln()
  },
}

export default logger
