// ============================================================================
// INGEST COMMAND - Batch ingest historical sessions into memory system
// Uses session parser + SDK curator to extract memories from past sessions
// ============================================================================

import { logger } from '../../utils/logger.ts'
import { styleText } from 'util'
import {
  findAllSessions,
  findProjectSessions,
  parseSessionFile,
  parseSessionFileWithSegments,
  getSessionSummary,
  calculateStats,
  type ParsedProject,
  type ParsedSession,
} from '../../core/session-parser.ts'
import { Curator } from '../../core/curator.ts'
import { Manager } from '../../core/manager.ts'
import type { StoragePaths } from '../../utils/paths.ts'
import { MemoryStore } from '../../core/store.ts'
import type { CurationResult, CuratedMemory } from '../../types/memory.ts'
import { homedir } from 'os'
import { join } from 'path'
import { readdir, stat } from 'fs/promises'

type Style = Parameters<typeof styleText>[0]
const style = (format: Style, text: string): string => styleText(format, text)

// Simple spinner for long operations
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null
  private frameIndex = 0
  private message = ''

  start(message: string) {
    this.message = message
    this.frameIndex = 0
    process.stdout.write(`        ${style('cyan', spinnerFrames[0])} ${style('dim', message)}`)
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length
      process.stdout.write(`\r        ${style('cyan', spinnerFrames[this.frameIndex])} ${style('dim', this.message)}`)
    }, 80)
  }

  update(message: string) {
    this.message = message
    process.stdout.write(`\r        ${style('cyan', spinnerFrames[this.frameIndex])} ${style('dim', this.message)}`)
  }

  stop(finalMessage?: string) {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    // Clear the line and optionally write final message
    process.stdout.write('\r' + ' '.repeat(80) + '\r')
    if (finalMessage) {
      console.log(finalMessage)
    }
  }
}

interface IngestOptions {
  project?: string
  session?: string
  all?: boolean
  dryRun?: boolean
  verbose?: boolean
  limit?: number
  maxTokens?: number
}

/**
 * Find a specific session by ID
 * Searches in specified project or across all projects
 */
async function findSessionById(
  sessionId: string,
  projectsFolder: string,
  projectPath?: string
): Promise<{ session: ParsedSession; folderId: string } | null> {
  const filename = sessionId.endsWith('.jsonl') ? sessionId : `${sessionId}.jsonl`

  // If project path is specified, search only there
  if (projectPath) {
    const filepath = join(projectPath, filename)
    try {
      await stat(filepath)
      const session = await parseSessionFile(filepath)
      const folderId = projectPath.split('/').pop() ?? projectPath
      return { session, folderId }
    } catch {
      return null
    }
  }

  // Search all projects
  try {
    const projectFolders = await readdir(projectsFolder)

    for (const folder of projectFolders) {
      const folderPath = join(projectsFolder, folder)
      const filepath = join(folderPath, filename)

      try {
        await stat(filepath)
        const session = await parseSessionFile(filepath)
        return { session, folderId: folder }
      } catch {
        continue
      }
    }
  } catch {
    // projectsFolder doesn't exist
  }

  return null
}

/**
 * Build storage paths for the manager (mirrors engine.getStoragePaths)
 */
function buildStoragePaths(projectId: string): StoragePaths {
  const globalPath = join(homedir(), '.local', 'share', 'memory', 'global')
  const centralPath = join(homedir(), '.local', 'share', 'memory')
  const projectPath = join(centralPath, projectId)

  return {
    projectPath,
    globalPath,
    projectMemoriesPath: join(projectPath, 'memories'),
    globalMemoriesPath: join(globalPath, 'memories'),
    personalPrimerPath: join(globalPath, 'primer', 'personal-primer.md'),
    storageMode: 'central',
  }
}

export async function ingest(options: IngestOptions) {
  logger.setVerbose(options.verbose ?? false)

  // Header
  console.log()
  console.log(style(['bold', 'magenta'], '┌──────────────────────────────────────────────────────────┐'))
  console.log(style(['bold', 'magenta'], '│') + style('bold', '  🧠 MEMORY INGESTION                                      ') + style(['bold', 'magenta'], '│'))
  console.log(style(['bold', 'magenta'], '└──────────────────────────────────────────────────────────┘'))
  console.log()

  // Agent SDK uses Claude Code OAuth - no API key needed!
  // Just need Claude Code installed and authenticated

  const projectsFolder = join(homedir(), '.claude', 'projects')
  const maxTokens = options.maxTokens ?? 150000

  // Find sessions to ingest
  let projects: ParsedProject[] = []

  if (options.session) {
    // Find specific session by ID
    const projectPath = options.project ? join(projectsFolder, options.project) : undefined
    const result = await findSessionById(options.session, projectsFolder, projectPath)

    if (!result) {
      logger.error(`Session not found: ${options.session}`)
      console.log()
      if (options.project) {
        console.log(style('dim', `   Searched in: ${projectPath}`))
      } else {
        console.log(style('dim', `   Searched in: ${projectsFolder}`))
        console.log(style('dim', '   Tip: Use --project <name> to specify the project folder'))
      }
      console.log()
      process.exit(1)
    }

    projects = [{
      folderId: result.folderId,
      name: result.session.projectName,
      path: join(projectsFolder, result.folderId),
      sessions: [result.session]
    }]

    logger.info(`Found session in project: ${result.session.projectName}`)
    console.log(`      ${style('dim', 'path:')} ${result.session.filepath}`)
    console.log()
  } else if (options.project) {
    // Find specific project
    const projectPath = join(projectsFolder, options.project)
    const sessions = await findProjectSessions(projectPath, { limit: options.limit })

    if (sessions.length === 0) {
      logger.error(`No sessions found for project: ${options.project}`)
      console.log()
      process.exit(1)
    }

    projects = [{
      folderId: options.project,
      name: sessions[0]?.projectName ?? options.project,
      path: projectPath,
      sessions
    }]
  } else if (options.all) {
    // Find all projects
    projects = await findAllSessions(projectsFolder, { limit: options.limit })

    if (projects.length === 0) {
      logger.error(`No sessions found in ${projectsFolder}`)
      console.log()
      process.exit(1)
    }
  } else {
    logger.error('Specify --session <id>, --project <name>, or --all')
    console.log()
    console.log(style('dim', '   Examples:'))
    console.log(style('dim', '     memory ingest --session abc123-def456'))
    console.log(style('dim', '     memory ingest --session abc123-def456 --project my-project'))
    console.log(style('dim', '     memory ingest --project my-project'))
    console.log(style('dim', '     memory ingest --all'))
    console.log(style('dim', '     memory ingest --all --dry-run'))
    console.log()
    process.exit(1)
  }

  // Calculate stats
  const stats = calculateStats(projects)

  logger.info('Discovery complete')
  console.log(`      ${style('dim', 'projects:')} ${stats.totalProjects}`)
  console.log(`      ${style('dim', 'sessions:')} ${stats.totalSessions}`)
  console.log(`      ${style('dim', 'messages:')} ${stats.totalMessages}`)
  console.log(`      ${style('dim', 'tool uses:')} ${stats.totalToolUses}`)
  if (stats.oldestSession) {
    console.log(`      ${style('dim', 'range:')} ${stats.oldestSession.slice(0, 10)} → ${stats.newestSession?.slice(0, 10) ?? 'now'}`)
  }
  console.log()

  if (options.dryRun) {
    logger.info('Dry run - sessions to ingest:')
    console.log()

    for (const project of projects) {
      console.log(`   ${style('cyan', '📁')} ${style('bold', project.name)} ${style('dim', `(${project.sessions.length} sessions)`)}`)

      for (const session of project.sessions.slice(0, 5)) {
        const summary = getSessionSummary(session)
        const truncated = summary.length > 55 ? summary.slice(0, 52) + '...' : summary
        const tokens = session.metadata.estimatedTokens
        const segments = Math.ceil(tokens / maxTokens)

        console.log(`      ${style('dim', '•')} ${session.id.slice(0, 8)}... ${style('dim', `(${tokens} tok, ${segments} seg)`)}`)
        console.log(`        ${style('dim', truncated)}`)
      }

      if (project.sessions.length > 5) {
        console.log(`      ${style('dim', `... and ${project.sessions.length - 5} more`)}`)
      }
      console.log()
    }

    logger.success('Dry run complete. Remove --dry-run to ingest.')
    console.log()
    return
  }

  // Initialize curator, manager, and store
  // Curator uses Agent SDK (no API key needed - uses Claude Code OAuth)
  const curator = new Curator()
  const manager = new Manager()
  const store = new MemoryStore()

  // Check if manager is enabled
  const managerEnabled = process.env.MEMORY_MANAGER_DISABLED !== '1'

  logger.divider()
  logger.info('Starting ingestion...')
  if (managerEnabled) {
    console.log(`      ${style('dim', 'manager:')} enabled (will organize memories after each session)`)
  }
  console.log()

  let totalSegments = 0
  let totalMemories = 0
  let failedSegments = 0
  let managedSessions = 0

  for (const project of projects) {
    console.log(`   ${style('cyan', '📁')} ${style('bold', project.name)}`)

    // Build storage paths for manager (same for all sessions in project)
    const storagePaths = buildStoragePaths(project.folderId)

    for (const session of project.sessions) {
      const summary = getSessionSummary(session)
      const truncated = summary.length > 45 ? summary.slice(0, 42) + '...' : summary

      if (options.verbose) {
        console.log(`      ${style('dim', '•')} ${session.id.slice(0, 8)}... "${truncated}"`)
      }

      // Parse into segments
      const segments = await parseSessionFileWithSegments(session.filepath, maxTokens)
      totalSegments += segments.length

      // Accumulate all results from this session for manager
      const sessionMemories: CuratedMemory[] = []
      const sessionMemoryIds: string[] = []
      const sessionSummaries: string[] = []
      const interactionTones: string[] = []
      const projectSnapshots: NonNullable<CurationResult['project_snapshot']>[] = []

      const spinner = new Spinner()

      for (const segment of segments) {
        try {
          const segmentLabel = `Segment ${segment.segmentIndex + 1}/${segment.totalSegments}`
          const tokensLabel = `${Math.round(segment.estimatedTokens / 1000)}k tokens`

          // Start spinner for curation
          spinner.start(`${segmentLabel} (${tokensLabel}) - curating with Opus 4.5...`)

          // Curate the segment
          const result = await curator.curateFromSegment(segment, 'historical')

          // Stop spinner with success message
          spinner.stop(`        ${style('green', '✓')} ${segmentLabel}: ${result.memories.length} memories (${tokensLabel})`)

          // Store memories and collect IDs
          for (const memory of result.memories) {
            const id = await store.storeMemory(project.folderId, session.id, memory)
            sessionMemories.push(memory)
            sessionMemoryIds.push(id)
            totalMemories++
          }

          // Accumulate ALL session summaries, tones, and snapshots (not just latest)
          if (result.session_summary) {
            sessionSummaries.push(result.session_summary)
          }
          if (result.interaction_tone) {
            interactionTones.push(result.interaction_tone)
          }
          if (result.project_snapshot) {
            projectSnapshots.push(result.project_snapshot)
          }
        } catch (error: any) {
          failedSegments++
          spinner.stop(`        ${style('red', '✗')} Segment ${segment.segmentIndex + 1}/${segment.totalSegments}: ${error.message}`)
        }
      }

      // Combine summaries from all segments (chronological order)
      let combinedSummary = ''
      if (sessionSummaries.length === 1) {
        combinedSummary = sessionSummaries[0]!
      } else if (sessionSummaries.length > 1) {
        combinedSummary = sessionSummaries
          .map((s, i) => `[Part ${i + 1}/${sessionSummaries.length}] ${s}`)
          .join('\n\n')
      }

      // For interaction tone, use the last one (most recent)
      const finalTone = interactionTones.length > 0
        ? interactionTones[interactionTones.length - 1]!
        : ''

      // For project snapshot, merge all - later ones take precedence for phase
      let mergedSnapshot: CurationResult['project_snapshot'] | undefined
      if (projectSnapshots.length > 0) {
        const allAchievements: string[] = []
        const allChallenges: string[] = []
        const allNextSteps: string[] = []

        for (const snap of projectSnapshots) {
          if (snap.recent_achievements) allAchievements.push(...snap.recent_achievements)
          if (snap.active_challenges) allChallenges.push(...snap.active_challenges)
          if (snap.next_steps) allNextSteps.push(...snap.next_steps)
        }

        const lastSnapshot = projectSnapshots[projectSnapshots.length - 1]!
        mergedSnapshot = {
          id: lastSnapshot.id || '',
          session_id: lastSnapshot.session_id || '',
          project_id: lastSnapshot.project_id || '',
          current_phase: lastSnapshot.current_phase,
          recent_achievements: [...new Set(allAchievements)],
          active_challenges: [...new Set(allChallenges)],
          next_steps: [...new Set(allNextSteps)],
          created_at: lastSnapshot.created_at || Date.now(),
        }
      }

      // Store session summary and project snapshot
      if (combinedSummary) {
        await store.storeSessionSummary(project.folderId, session.id, combinedSummary, finalTone)
        if (options.verbose) {
          const preview = combinedSummary.length > 60 ? combinedSummary.slice(0, 57) + '...' : combinedSummary
          console.log(`        ${style('dim', `Summary stored (${sessionSummaries.length} parts): ${preview}`)}`)
        }
      }
      if (mergedSnapshot) {
        await store.storeProjectSnapshot(project.folderId, session.id, mergedSnapshot)
        if (options.verbose) {
          console.log(`        ${style('dim', `Snapshot stored: phase=${mergedSnapshot.current_phase || 'none'}, ${mergedSnapshot.recent_achievements?.length || 0} achievements`)}`)
        }
      }

      // Run manager if we have memories and manager is enabled
      if (sessionMemories.length > 0 && managerEnabled) {
        try {
          // Start spinner for manager
          spinner.start(`Managing ${sessionMemories.length} memories - deduplicating...`)

          const managerResult = await manager.manage(
            store,
            project.folderId,
            sessionMemoryIds
          )

          if (managerResult.success) {
            managedSessions++

            // Build detailed action summary
            const actions: string[] = []
            if (managerResult.superseded > 0) actions.push(`${style('yellow', String(managerResult.superseded))} superseded`)
            if (managerResult.resolved > 0) actions.push(`${style('blue', String(managerResult.resolved))} resolved`)
            if (managerResult.linked > 0) actions.push(`${style('cyan', String(managerResult.linked))} linked`)
            if (managerResult.primerUpdated) actions.push(`${style('magenta', 'primer')} updated`)

            if (actions.length > 0) {
              spinner.stop(`        ${style('green', '✓')} Manager: ${actions.join(', ')}`)
            } else {
              spinner.stop(`        ${style('green', '✓')} Manager: no changes needed`)
            }

            // Show file operations in verbose mode
            if (options.verbose && (managerResult.filesRead > 0 || managerResult.filesWritten > 0)) {
              console.log(`          ${style('dim', `files: ${managerResult.filesRead} read, ${managerResult.filesWritten} written`)}`)
            }
          } else {
            spinner.stop(`        ${style('yellow', '⚠')} Manager: ${managerResult.error || 'unknown error'}`)
          }
        } catch (error: any) {
          spinner.stop(`        ${style('yellow', '⚠')} Manager failed: ${error.message}`)
        }
      }
    }

    console.log()
  }

  // Summary
  logger.divider()
  console.log()
  logger.info('Ingestion complete')
  console.log(`      ${style('dim', 'segments:')} ${totalSegments}`)
  console.log(`      ${style('dim', 'memories:')} ${style('green', String(totalMemories))}`)
  if (managerEnabled && managedSessions > 0) {
    console.log(`      ${style('dim', 'managed:')} ${managedSessions} sessions`)
  }
  if (failedSegments > 0) {
    console.log(`      ${style('dim', 'failed:')} ${style('yellow', String(failedSegments))}`)
  }
  console.log()

  if (totalMemories > 0) {
    logger.success(`Extracted ${totalMemories} memories from ${totalSegments} segments`)
    if (managerEnabled && managedSessions > 0) {
      console.log(`      ${style('dim', 'Manager organized memories in')} ${managedSessions} ${style('dim', 'sessions')}`)
    }
  } else {
    logger.warn('No memories extracted. Try --verbose to see details.')
  }
  console.log()
}
