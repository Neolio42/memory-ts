#!/usr/bin/env bun
/**
 * Curated cleanup of global-scoped memories in the Productive project.
 * Applies a predefined set of actions: move_global, rescope, supersede.
 *
 * Usage:
 *   bun scripts/curated-cleanup.ts          # dry run
 *   bun scripts/curated-cleanup.ts --execute # apply changes
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'

const SOURCE_DIR = `${process.env.HOME}/.local/share/memory/-Users-ned-Desktop-Productive/memories`
const GLOBAL_DIR = `${process.env.HOME}/.local/share/memory/global/memories`
const DRY_RUN = !process.argv.includes('--execute')

type ActionType = 'move_global' | 'rescope' | 'supersede'

interface MoveGlobal {
  type: 'move_global'
  id: string
}
interface Rescope {
  type: 'rescope'
  id: string
  newScope: 'project'
}
interface Supersede {
  type: 'supersede'
  id: string
  by: string
}
type Action = MoveGlobal | Rescope | Supersede

// ============================================================
// COMPLETE ACTION LIST
// ============================================================
const actions: Action[] = [
  // MOVE TO GLOBAL (winners - genuinely cross-project)
  { type: 'move_global', id: '1772614534299-05472f' },  // Ned identity
  { type: 'move_global', id: '1772579041071-jrldfc' },  // Collab style
  { type: 'move_global', id: '1772554838435-21g940' },  // Ingestion workflow pref
  { type: 'move_global', id: '1772579695050-6lhf0a' },  // Qwen trick
  { type: 'move_global', id: '1772614534301-neh99b' },  // Claude model IDs
  { type: 'move_global', id: '1772578278625-9qvxr9' },  // SSH/pbcopy trick
  { type: 'move_global', id: '1772614534299-npc1sm' },  // Whisnap recordings catalog
  { type: 'move_global', id: '1772554838435-g84eg0' },  // Whisnap recordings archive path

  // RESCOPE TO PROJECT (memory-system specific, keep but not global)
  { type: 'rescope', id: '1772614534301-lvu05o', newScope: 'project' },  // Memory scoping
  { type: 'rescope', id: '1772553931147-hxlabm', newScope: 'project' },  // Hooks/bun path debug
  { type: 'rescope', id: '1772554838434-ndfnl0', newScope: 'project' },  // Ingest separate terminal
  { type: 'rescope', id: '1772484357811-exu2cq', newScope: 'project' },  // Curation procedure
  { type: 'rescope', id: '1772579041070-upzzgr', newScope: 'project' },  // @rlabs-inc/memory setup

  // SUPERSEDE - Ned identity dupes → 1772614534299-05472f
  { type: 'supersede', id: '1772579695050-9vu5bj', by: '1772614534299-05472f' },
  { type: 'supersede', id: '1772579041071-tm1bfd', by: '1772614534299-05472f' },
  { type: 'supersede', id: '1772616541250-yqb6d5', by: '1772614534299-05472f' },
  { type: 'supersede', id: '1772579695048-emz3a5', by: '1772614534299-05472f' },
  { type: 'supersede', id: '1772616541249-vu5zqy', by: '1772614534299-05472f' },

  // SUPERSEDE - Collab style dupes → 1772579041071-jrldfc
  { type: 'supersede', id: '1772616541250-0fkpsl', by: '1772579041071-jrldfc' },
  { type: 'supersede', id: '1772615149071-elkr3s', by: '1772579041071-jrldfc' },

  // SUPERSEDE - Ingestion workflow dupes → 1772554838435-21g940
  { type: 'supersede', id: '1772616541249-nhfrhn', by: '1772554838435-21g940' },
  { type: 'supersede', id: '1772615561125-4kvhyz', by: '1772554838435-21g940' },

  // SUPERSEDE - Qwen trick dupes → 1772579695050-6lhf0a
  { type: 'supersede', id: '1772553931151-xganft', by: '1772579695050-6lhf0a' },
  { type: 'supersede', id: '1772579041070-amsd57', by: '1772579695050-6lhf0a' },
  { type: 'supersede', id: '1772579695052-t0euyd', by: '1772579695050-6lhf0a' },
  { type: 'supersede', id: '1772484357811-jnd34w', by: '1772579695050-6lhf0a' },
  { type: 'supersede', id: '1772554838435-s7jbke', by: '1772579695050-6lhf0a' },
  { type: 'supersede', id: '1772484357809-u8yez6', by: '1772579695050-6lhf0a' },

  // SUPERSEDE - Claude model ID dupes → 1772614534301-neh99b
  { type: 'supersede', id: '1772579695051-uaigdk', by: '1772614534301-neh99b' },
  { type: 'supersede', id: '1772579041071-o6kgsg', by: '1772614534301-neh99b' },
  { type: 'supersede', id: '1772614534300-gynh3z', by: '1772614534301-neh99b' },
  { type: 'supersede', id: '1772579041071-6x1kyb', by: '1772614534301-neh99b' },

  // SUPERSEDE - Whisnap recordings dupes → 1772614534299-npc1sm
  { type: 'supersede', id: '1772579695050-bfscrg', by: '1772614534299-npc1sm' },
  { type: 'supersede', id: '1772611928828-2hiczm', by: '1772614534299-npc1sm' },
  { type: 'supersede', id: '1772578278623-ivr4st', by: '1772614534299-npc1sm' },
  { type: 'supersede', id: '1772616541250-vmnxem', by: '1772614534299-npc1sm' },

  // SUPERSEDE - Whisnap archive path dupe → 1772554838435-g84eg0
  { type: 'supersede', id: '1772484583913-5ey8fl', by: '1772554838435-g84eg0' },

  // SUPERSEDE - Memory scoping dupes → 1772614534301-lvu05o
  { type: 'supersede', id: '1772553931149-wkwi8h', by: '1772614534301-lvu05o' },
  { type: 'supersede', id: '1772579695051-m7iy92', by: '1772614534301-lvu05o' },
  { type: 'supersede', id: '1772616541246-5jodgb', by: '1772614534301-lvu05o' },
  { type: 'supersede', id: '1772611928828-3myyjb', by: '1772614534301-lvu05o' },
  { type: 'supersede', id: '1772616541248-0oid3p', by: '1772614534301-lvu05o' },

  // SUPERSEDE - @rlabs-inc/memory setup dupes → 1772579041070-upzzgr
  { type: 'supersede', id: '1772579041070-lsfeev', by: '1772579041070-upzzgr' },
  { type: 'supersede', id: '1772484357810-ij4bnn', by: '1772579041070-upzzgr' },
  { type: 'supersede', id: '1772614534299-1s5w1s', by: '1772579041070-upzzgr' },
  { type: 'supersede', id: '1772484357811-xc61el', by: '1772579041070-upzzgr' },

  // SUPERSEDE - Ingest separate terminal dupe → 1772554838434-ndfnl0
  { type: 'supersede', id: '1772610826883-djtrmb', by: '1772554838434-ndfnl0' },

  // SUPERSEDE - Personal primer milestones (stale one-time events)
  { type: 'supersede', id: '1772612422734-il8lc2', by: '' },
  { type: 'supersede', id: '1772613608187-tdxn3u', by: '' },
  { type: 'supersede', id: '1772484357811-mlfgpf', by: '' },

  // SUPERSEDE - Stale/obsolete
  { type: 'supersede', id: '1772614534301-r3y86o', by: '' },  // "Global memories near zero"
  { type: 'supersede', id: '1772579041071-421cm7', by: '' },  // "Curator patched to sonnet"
  { type: 'supersede', id: '1772616541250-5q83nr', by: '' },  // "CRITICAL: curator patched"
  { type: 'supersede', id: '1772578278623-17rsl8', by: '' },  // "Replaced stale CLAUDE.md"
  { type: 'supersede', id: '1772612422734-wggu0s', by: '' },  // stale workflow
  { type: 'supersede', id: '1772554838434-6foeos', by: '' },  // stale
  { type: 'supersede', id: '1772611477105-vu50g5', by: '' },  // stale state
  { type: 'supersede', id: '1772612915248-xwxpua', by: '' },  // stale workflow
  { type: 'supersede', id: '1772614534298-r8urvs', by: '' },  // stale
  { type: 'supersede', id: '1772579041069-xygqsf', by: '' },  // stale
  { type: 'supersede', id: '1772554838435-psvx2i', by: '' },  // stale curation procedure dupe

  // SUPERSEDE - URGENT stale session reference
  { type: 'supersede', id: '1772615561120-vct0ko', by: '' },  // "URGENT: Session 47ac9782..."

  // SUPERSEDE - Stale primer milestone
  { type: 'supersede', id: '1772580508038-327tpm', by: '' },
  { type: 'supersede', id: '1772580172417-60lemv', by: '' },
]

// ============================================================
// HELPERS
// ============================================================

function readFile(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

function parseFrontmatter(content: string): { headline: string; status: string; scope: string; context_type: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { headline: '', status: '', scope: '', context_type: '' }
  const fm = match[1]

  const get = (key: string): string => {
    const line = fm.split('\n').find(l => l.startsWith(`${key}:`))
    if (!line) return ''
    return line.replace(`${key}:`, '').trim().replace(/^"(.*)"$/, '$1')
  }

  return {
    headline: get('headline'),
    status: get('status'),
    scope: get('scope'),
    context_type: get('context_type'),
  }
}

/**
 * Replace a frontmatter key's value. If the key doesn't exist, insert it
 * after the last `---` opener line within the frontmatter block.
 */
function setFrontmatterKey(content: string, key: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/)
  if (!fmMatch) return content

  const lines = fmMatch[2].split('\n')
  const keyIndex = lines.findIndex(l => l.startsWith(`${key}:`))

  const newLine = `${key}: "${value}"`

  if (keyIndex !== -1) {
    lines[keyIndex] = newLine
  } else {
    // Append before closing ---
    lines.push(newLine)
  }

  return fmMatch[1] + lines.join('\n') + fmMatch[3] + content.slice(fmMatch[0].length)
}

function applySupersede(filePath: string, id: string, by: string, dryRun: boolean): boolean {
  if (!existsSync(filePath)) {
    console.log(`  SKIP  [${id}] file not found`)
    return false
  }

  const content = readFile(filePath)
  const fm = parseFrontmatter(content)

  if (fm.status === 'superseded') {
    console.log(`  SKIP  [${id}] already superseded — headline: "${fm.headline.slice(0, 60)}"`)
    return false
  }

  const byDisplay = by ? ` by ${by}` : ' (no replacement)'
  console.log(`  SUPERSEDE [${id}]${byDisplay}`)
  console.log(`           headline: "${fm.headline.slice(0, 70)}"`)

  if (!dryRun) {
    let updated = setFrontmatterKey(content, 'status', 'superseded')
    if (by) {
      updated = setFrontmatterKey(updated, 'superseded_by', by)
    }
    writeFileSync(filePath, updated, 'utf-8')
  }
  return true
}

function applyRescope(filePath: string, id: string, newScope: string, dryRun: boolean): boolean {
  if (!existsSync(filePath)) {
    console.log(`  SKIP  [${id}] file not found`)
    return false
  }

  const content = readFile(filePath)
  const fm = parseFrontmatter(content)

  if (fm.scope === newScope) {
    console.log(`  SKIP  [${id}] scope already "${newScope}"`)
    return false
  }

  console.log(`  RESCOPE [${id}] ${fm.scope} → ${newScope}`)
  console.log(`          headline: "${fm.headline.slice(0, 70)}"`)

  if (!dryRun) {
    const updated = setFrontmatterKey(content, 'scope', newScope)
    writeFileSync(filePath, updated, 'utf-8')
  }
  return true
}

function applyMoveGlobal(sourceDir: string, globalDir: string, id: string, dryRun: boolean): boolean {
  const srcPath = join(sourceDir, `${id}.md`)
  const dstPath = join(globalDir, `${id}.md`)

  if (!existsSync(srcPath)) {
    console.log(`  SKIP  [${id}] source file not found`)
    return false
  }

  if (existsSync(dstPath)) {
    console.log(`  SKIP  [${id}] already exists in global/memories`)
    return false
  }

  const content = readFile(srcPath)
  const fm = parseFrontmatter(content)

  console.log(`  MOVE_GLOBAL [${id}]`)
  console.log(`              headline: "${fm.headline.slice(0, 70)}"`)
  console.log(`              ${srcPath}`)
  console.log(`           → ${dstPath}`)

  if (!dryRun) {
    if (!existsSync(globalDir)) {
      mkdirSync(globalDir, { recursive: true })
    }
    copyFileSync(srcPath, dstPath)
    unlinkSync(srcPath)
  }
  return true
}

// ============================================================
// MAIN
// ============================================================

console.log(`\n=== Curated Memory Cleanup ===`)
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --execute to apply)' : 'EXECUTE'}`)
console.log(`Source: ${SOURCE_DIR}`)
console.log(`Global: ${GLOBAL_DIR}`)
console.log()

let movedCount = 0
let rescopedCount = 0
let supersededCount = 0
let skippedCount = 0

for (const action of actions) {
  const filePath = join(SOURCE_DIR, `${action.id}.md`)

  if (action.type === 'move_global') {
    const ok = applyMoveGlobal(SOURCE_DIR, GLOBAL_DIR, action.id, DRY_RUN)
    if (ok) movedCount++
    else skippedCount++
  } else if (action.type === 'rescope') {
    const ok = applyRescope(filePath, action.id, action.newScope, DRY_RUN)
    if (ok) rescopedCount++
    else skippedCount++
  } else if (action.type === 'supersede') {
    const ok = applySupersede(filePath, action.id, action.by, DRY_RUN)
    if (ok) supersededCount++
    else skippedCount++
  }
}

console.log()
console.log('=== Summary ===')
console.log(`  Moved to global:  ${movedCount}`)
console.log(`  Rescoped:         ${rescopedCount}`)
console.log(`  Superseded:       ${supersededCount}`)
console.log(`  Skipped:          ${skippedCount}`)
console.log(`  Total actions:    ${actions.length}`)
if (DRY_RUN) {
  console.log()
  console.log('Dry run complete. Run with --execute to apply changes.')
}
