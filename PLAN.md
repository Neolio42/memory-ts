# Memory-TS Fork: The Plan

## What This Is
Forked from `@rlabs-inc/memory-ts` (RLabs-Inc). Claude Code memory plugin that hooks into sessions to extract, store, and retrieve memories. The architecture is sound but the implementation is broken.

## Current State
- **Installed globally**: `~/.bun/install/global/node_modules/@rlabs-inc/memory`
- **LaunchAgent running**: `~/Library/LaunchAgents/com.rlabs.memory.plist` serves the OLD version on port 8765. Kill/update this when ready to switch.
- **Hooks in**: `~/.claude/settings.json` - SessionStart, UserPromptSubmit, PreCompact, SessionEnd all pointing to `~/.claude/hooks/` scripts that hit localhost:8765
- **155 memories stored** in `~/.local/share/memory/` but only ~15 unique concepts, rest are duplicates
- **Model already patched** to `claude-sonnet-4-6` (was Opus 4.5) in curator.ts, manager.ts, ingest.ts - these patches are in node_modules and get lost on update. Fork fixes this permanently.

## What's Actually Broken

### 1. Curator has zero dedup awareness
- Extracts memories with NO knowledge of what's already stored
- Same fact mentioned in 3 sessions = 3 separate memories
- Segmented curation (for long sessions) curates each 150k chunk independently = more dupes

### 2. Manager doesn't work
- Supposed to supersede/dedup after curator runs
- In practice it fails silently or creates MORE duplicates
- Spawned as a second Claude agent with filesystem tools - too indirect, too error-prone

### 3. Curation produces surface-level garbage
- "Ned is 24-25, Vilnius, solo founder" stored 8 different ways
- Zero texture, zero specific insights from rich conversations
- 560 voice recordings read into a session → no meaningful content extracted
- Compare to Jarvis approach: "preserve both facts AND texture"

### 4. Global scope routing bug
- Memories marked `scope: global` still land in project folder
- `~/.local/share/memory/global/memories/` is always empty
- Cross-project memories don't actually work

### 5. No timestamps/dates from conversations
- Memories have `created` timestamp (when curated) but not "when did this happen"
- "I did cocaine yesterday" curated 3 days later has no reference to the actual date
- Need `event_date` or `occurred_at` extracted from conversation context

## What Works (Keep)

- **Hook architecture**: SessionStart → inject primer, UserPromptSubmit → semantic retrieval, SessionEnd → curate. This loop is correct.
- **7-signal retrieval**: trigger phrases, tags, domain, feature, content overlap, file match, vector similarity with MIN_ACTIVATION_SIGNALS=2. Well designed, keep it.
- **Expand mechanism**: Headlines shown inline, full content via `/memory/expand?ids=`. Good UX.
- **Store format**: Markdown + YAML frontmatter with embeddings via fsdb. Human-readable, works fine.
- **Embedding model**: Local all-MiniLM-L6-v2 (384-dim). Fast, free, good enough.

## Changes to Make

### Phase 1: Fix Curation (The Big One)

**Feed existing memories into curator prompt.**
Before curation, query the store for ALL active memories (or at least headlines + IDs). Include them in the curation prompt so the model can:
- Skip things already stored
- Update/supersede existing memories with new information
- Know what's actually in the system

**Rewrite curation prompt.**
Current prompt is overengineered consciousness-engineer BS. Replace with:
- Extract specific, concrete memories - not meta-summaries
- Preserve texture: actual quotes, specific dates, emotional context
- If something is already stored, explicitly say "update memory X" or "skip, already have this"
- Extract `event_date` from conversation context when possible
- Bias toward personal/philosophical content for global scope, not technical noise

**Kill segmented curation or add cross-segment dedup.**
Either:
- Process full sessions as one (if they fit in context)
- Or carry forward extracted memories between segments so later segments know what earlier ones found

### Phase 2: Fix or Kill Manager

Option A: **Merge manager into curator.** One smart pass that both extracts AND organizes. Curator already knows existing memories (from Phase 1), so it can handle supersession inline.

Option B: **Keep manager but make it dumber.** After curation, run a simple dedup pass:
- Find memories with >80% headline similarity → supersede older one
- Find memories with same `domain` + `feature` → check if one is newer → supersede
- No Claude agent needed, just string matching + rules

### Phase 3: Fix Global Scope

- Debug the routing in `store.ts` - find why `scope: global` memories don't go to global dir
- Or simplify: ONE memory store, tag with scope, filter at retrieval time (no separate dirs)

### Phase 4: Add Event Dates

- Add `event_date` field to memory schema
- Curator prompt: "If the conversation references when something happened, extract the date"
- Retrieval can then sort by recency of the actual event, not when it was curated

### Phase 5: Cleanup Existing Memories

- Nuke all 155 current memories (they're mostly garbage)
- Re-ingest key sessions with the new curator
- Or manually seed a clean set of ~20 high-quality memories

## Deployment

When ready to switch:
1. Build the fork: `bun build` or whatever the build step is
2. Update LaunchAgent plist to point to fork instead of global npm package
3. Update hook scripts in `~/.claude/hooks/` to use fork paths
4. `launchctl unload ~/Library/LaunchAgents/com.rlabs.memory.plist` → update → `launchctl load`
5. Optionally: `bun link` to make `memory` CLI point to fork

## Reference: Jarvis Curation Philosophy

From the same author's other project (RLabs-Inc/jarvis), committed Feb 25 2026:
> "Curate my own memories with Opus + chunked processing for long sessions. Curation prompts rewritten from my perspective, not as a sub-agent. New curation philosophy: preserve both facts AND texture."

This is the direction. Facts AND texture. Not "Ned is a solo founder" but "June 2025: Ned realized winning stopped feeling like anything - not burnout, not depression, just emotional flatness despite all vitals being fine."

## Model

Use `claude-sonnet-4-6` for curation. Opus is overkill and expensive. Sonnet is more than capable of deciding what's a good memory.
