/**
 * Deep-dive retrieval test with real conversation messages.
 * Run: bun test-retrieval.ts [--project <id>] [--verbose]
 *
 * Extracts real user messages from Claude conversation transcripts,
 * runs them through retrieval against actual memories, and reports
 * what surfaces (and what doesn't).
 *
 * No LLM needed — purely local.
 */

import { createRetrieval } from './src/core/retrieval.ts'
import { MemoryStore } from './src/core/store.ts'
import { getDefaultEmbeddings } from './src/core/embeddings.ts'
import { logger } from './src/utils/logger.ts'
import type { StoredMemory, RetrievalResult } from './src/types/memory.ts'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ============================================================================
// CONFIG
// ============================================================================

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const projectIdx = args.indexOf('--project')
const projectId = projectIdx !== -1 ? args[projectIdx + 1] : null

if (verbose) logger.setVerbose(true)

// ============================================================================
// EXTRACT REAL MESSAGES FROM JSONL TRANSCRIPTS
// ============================================================================

interface RealMessage {
  text: string
  project: string
  sessionFile: string
}

function extractRealMessages(projectDir: string, maxPerSession: number = 5): RealMessage[] {
  const project = projectDir.split('/').pop()!
  const messages: RealMessage[] = []

  // Get recent jsonl files
  let jsonlFiles: string[]
  try {
    jsonlFiles = readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => join(projectDir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      .slice(0, 5)
  } catch { return [] }

  for (const jf of jsonlFiles) {
    let count = 0
    try {
      const lines = readFileSync(jf, 'utf-8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line)
          if (obj.type !== 'user') continue

          const msg = obj.message || {}
          let text = ''
          const content = msg.content
          if (typeof content === 'string') {
            text = content.trim()
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'text') {
                text = block.text?.trim() || ''
                break
              }
            }
          }

          if (text.length < 15) continue
          if (text.includes('<system-reminder>')) continue
          if (text.startsWith('Implement the following plan')) continue
          if (text.startsWith('[Request interrupted')) continue
          if (text.startsWith('<task-notification')) continue
          if (text.startsWith('<command-message>')) continue
          if (text.startsWith('<local-command')) continue
          if (text.startsWith('Base directory')) continue
          if (text.startsWith('Here is the conversation transcript')) continue

          // Take first line, cap at 300 chars
          const firstLine = text.split('\n')[0].slice(0, 300)
          messages.push({ text: firstLine, project, sessionFile: jf.split('/').pop()! })
          count++
          if (count >= maxPerSession) break
        } catch { /* parse error */ }
      }
    } catch { /* file error */ }
  }

  return messages
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔬 Retrieval Deep Dive\n')
  console.log('Initializing embeddings...')
  const embeddings = getDefaultEmbeddings()
  await embeddings.initialize()

  const store = new MemoryStore()
  const basePath = join(homedir(), '.local', 'share', 'memory')
  const claudeBase = join(homedir(), '.claude', 'projects')

  // ================================================================
  // STEP 1: Discover projects with memories
  // ================================================================
  const memoryProjects = readdirSync(basePath, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'global')
    .map(d => d.name)

  // Map memory project IDs to Claude project dirs
  const projectMap: { memoryId: string; claudeDir: string; memCount: number }[] = []

  for (const memId of memoryProjects) {
    // Try to find matching Claude project dir
    let claudeDirs: string[]
    try {
      claudeDirs = readdirSync(claudeBase, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => join(claudeBase, d.name))
    } catch { claudeDirs = [] }
    const match = claudeDirs.find(d => {
      const base = d.split('/').pop()!
      return base === memId || base.replace(/-/g, '/') === memId
    })

    let memCount = 0
    try {
      memCount = readdirSync(join(basePath, memId, 'memories')).length
    } catch {}

    if (memCount > 0) {
      projectMap.push({
        memoryId: memId,
        claudeDir: match || '',
        memCount,
      })
    }
  }

  projectMap.sort((a, b) => b.memCount - a.memCount)

  console.log(`\n📂 Projects with memories:`)
  for (const p of projectMap) {
    const hasTranscripts = p.claudeDir ? '✅' : '❌'
    console.log(`   ${hasTranscripts} ${p.memoryId} (${p.memCount} memories)`)
  }

  // ================================================================
  // STEP 2: Load global memories (shared across all)
  // ================================================================
  const globalMemories = await store.getGlobalMemories()
  const activeGlobals = globalMemories.filter(m => !m.status || m.status === 'active')
  console.log(`\n🌍 ${activeGlobals.length} active global memories`)

  // ================================================================
  // STEP 3: Test each project (or specific one)
  // ================================================================
  const projectsToTest = projectId
    ? projectMap.filter(p => p.memoryId === projectId || p.memoryId.includes(projectId))
    : projectMap.filter(p => p.claudeDir && p.memCount >= 5)

  if (!projectsToTest.length) {
    console.log('❌ No testable projects found.')
    process.exit(1)
  }

  const retrieval = createRetrieval()
  let grandTotalReturned = 0
  let grandTotalMessages = 0

  for (const project of projectsToTest) {
    console.log(`\n${'═'.repeat(80)}`)
    console.log(`📦 ${project.memoryId} (${project.memCount} memories)`)
    console.log('═'.repeat(80))

    // Load project memories
    const projectMemories = await store.getAllMemories(project.memoryId)
    const activeProject = projectMemories.filter(m => !m.status || m.status === 'active')
    const allActive = [...activeProject, ...activeGlobals]

    // Show memory landscape
    const typeDist: Record<string, number> = {}
    const temporalDist: Record<string, number> = {}
    for (const m of activeProject) {
      typeDist[m.context_type || '?'] = (typeDist[m.context_type || '?'] || 0) + 1
      temporalDist[m.temporal_class || 'medium_term'] = (temporalDist[m.temporal_class || 'medium_term'] || 0) + 1
    }
    console.log(`   Types: ${Object.entries(typeDist).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}:${v}`).join(' ')}`)
    console.log(`   Temporal: ${Object.entries(temporalDist).map(([k,v]) => `${k}:${v}`).join(' ')}`)

    // Extract real messages from transcripts
    const realMessages = project.claudeDir
      ? extractRealMessages(project.claudeDir, 15)
      : []

    if (!realMessages.length) {
      console.log('   ⚠️  No conversation transcripts found — skipping\n')
      continue
    }

    console.log(`   📝 ${realMessages.length} real messages extracted\n`)

    // Run each message through retrieval
    let projectReturned = 0
    const hitMessages: string[] = []
    const missMessages: string[] = []

    for (let i = 0; i < realMessages.length; i++) {
      const msg = realMessages[i]
      const queryEmbedding = await embeddings.embed(msg.text)

      const results = retrieval.retrieveRelevantMemories(
        allActive,
        msg.text,
        queryEmbedding,
        { session_id: 'test', project_id: project.memoryId, message_count: 5 },
        3, 0, 1,
      )

      projectReturned += results.length
      grandTotalReturned += results.length
      grandTotalMessages++

      const icon = results.length > 0 ? '🎯' : '·'
      const truncMsg = msg.text.length > 100 ? msg.text.slice(0, 100) + '...' : msg.text

      if (results.length > 0) {
        hitMessages.push(truncMsg)
        console.log(`   ${icon} [${results.length}] "${truncMsg}"`)
        for (const r of results) {
          const isGlobal = r.scope === 'global' || r.project_id === 'global'
          const scope = isGlobal ? '🌍' : '📁'
          const sig = Math.round((r.score || 0) * 7)
          const headline = (r.headline || r.content).slice(0, 80)
          console.log(`      ${scope} [${sig}sig ${r.value_score?.toFixed(2)}] ${r.context_type} — ${headline}`)
        }
      } else {
        missMessages.push(truncMsg)
      }
    }

    // Project summary
    const hitRate = realMessages.length ? (hitMessages.length / realMessages.length * 100).toFixed(0) : '0'
    const avgPerHit = hitMessages.length ? (projectReturned / hitMessages.length).toFixed(1) : '0'
    console.log(`\n   📊 Hit rate: ${hitMessages.length}/${realMessages.length} (${hitRate}%)`)
    console.log(`   📊 Avg memories per hit: ${avgPerHit}`)
    console.log(`   📊 Total returned: ${projectReturned}`)

    if (missMessages.length > 0) {
      const shown = missMessages.slice(0, 8)
      console.log(`\n   Misses (${missMessages.length} total${missMessages.length > 8 ? ', showing 8' : ''}):`)
      for (const m of shown) {
        console.log(`      · "${m.slice(0, 90)}"`)
      }
    }
  }

  // ================================================================
  // STEP 4: Cross-context test — personal messages against technical projects
  // ================================================================
  console.log(`\n${'═'.repeat(80)}`)
  console.log('🔄 CROSS-CONTEXT TEST')
  console.log('═'.repeat(80))
  console.log('   Testing personal/casual messages against technical projects')
  console.log('   (these should return 0 or only personal globals)\n')

  const crossMessages = [
    "hey thanks that looks great",
    "ok cool yeah sure",
    "feeling burned out lately, need to figure out my exercise routine",
    "I've been thinking about my goals and what I really want from life",
    "They did that. can I just go back? honestly do I I signed up for ADHD check-in",
    "yea lets do it Ill find domains later",
    "Yea fuck it what do we have to lose",
    "right, seems to be gone now",
    "still crashes on first thing to be honest",
    "sure that works",
  ]

  let crossHits = 0
  for (const msg of crossMessages) {
    // Test against the biggest project
    const bigProject = projectsToTest[0]
    const projectMems = await store.getAllMemories(bigProject.memoryId)
    const activeMems = [...projectMems.filter(m => !m.status || m.status === 'active'), ...activeGlobals]
    const queryEmb = await embeddings.embed(msg)

    const results = retrieval.retrieveRelevantMemories(
      activeMems, msg, queryEmb,
      { session_id: 'test', project_id: bigProject.memoryId, message_count: 5 },
      3, 0, 1,
    )

    if (results.length > 0) {
      crossHits++
      console.log(`   ⚠️  "${msg.slice(0, 80)}" → ${results.length} memories:`)
      for (const r of results) {
        console.log(`      ${r.context_type}: ${(r.headline || r.content).slice(0, 70)}`)
      }
    } else {
      console.log(`   ✅ "${msg.slice(0, 80)}" → silence`)
    }
  }
  console.log(`\n   Cross-context leaks: ${crossHits}/${crossMessages.length}`)

  // ================================================================
  // GRAND SUMMARY
  // ================================================================
  console.log(`\n${'═'.repeat(80)}`)
  console.log('📊 GRAND SUMMARY')
  console.log('═'.repeat(80))
  console.log(`   Messages tested: ${grandTotalMessages}`)
  console.log(`   Total memories returned: ${grandTotalReturned}`)
  console.log(`   Average per message: ${grandTotalMessages ? (grandTotalReturned / grandTotalMessages).toFixed(2) : '0'}`)
  console.log(`   Cross-context leaks: ${crossHits}/${crossMessages.length}`)
  console.log()

  const avg = grandTotalMessages ? grandTotalReturned / grandTotalMessages : 0
  if (avg > 3) {
    console.log('   ⚠️  Too noisy — average above 3 per message')
  } else if (avg < 0.1) {
    console.log('   ⚠️  Too quiet — almost nothing surfacing. MIN_SIGNALS=3 may be too strict.')
  } else if (avg < 0.5) {
    console.log('   ℹ️  Very selective — few memories surface. Good for noise, may miss useful context.')
  } else {
    console.log('   ✅ Good balance — selective but not silent.')
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
