# @neolio42/memory

> Fork of [@rlabs-inc/memory](https://github.com/RLabs-Inc/memory-ts) with dedup-aware curation, deterministic memory management, and global scope routing fixes.

**Context continuity for Claude Code and Gemini CLI sessions.**

The memory system preserves context, insights, and relationship across conversations. When you start a new session, your AI remembers who you are, what you've built together, and picks up right where you left off.

Works with both **Claude Code** and **Gemini CLI** - use your preferred AI coding assistant, or even both simultaneously.

## Quick Start

```bash
# Install globally (from GitHub)
bun install -g github:Neolio42/memory-ts

# Set up hooks (one time) - choose your CLI:
memory install              # For Claude Code
memory install --gemini     # For Gemini CLI

# Start the memory server
memory serve

# Verify everything works
memory doctor
```

That's it. Use your AI coding assistant normally — memories are extracted and surfaced automatically.

## What's Different in This Fork

### v0.7.0 — Curation Pipeline Rewrite

The original curation pipeline produced massive duplication — 155 memories with ~15 unique concepts. This fork fixes the root causes:

**Dedup-aware curation**: The curator now receives a compact list of all existing memories before extracting new ones. It can skip duplicates and declare `supersedes: "#old-id"` to replace outdated memories.

**Deterministic manager**: Replaced the LLM-based manager agent with fast, deterministic rules:
- Same domain + feature + >80% headline overlap → supersede older memory
- Multiple state/snapshot memories for same domain → keep newest
- 3+ shared semantic tags → link via `related_to`

No LLM calls, runs in <10ms, no hallucinated actions.

**Global scope routing fix**: Memories marked `scope: "global"` (personal, philosophy) now correctly route to the global database instead of staying in project scope.

**Cross-segment dedup**: When curating large sessions split into segments, extracted headlines carry forward to prevent re-extraction across segments.

**New fields**: `event_date` for temporal context, `supersedes` for explicit replacement chains.

## How It Works

### 1. Session Start
The `SessionStart` hook injects a primer: time since last session, previous session summary, project status, personal context.

### 2. Every Message
The `UserPromptSubmit` hook embeds your message (~5ms), searches global + project memories, applies the activation signal algorithm, and injects relevant matches.

### 3. Session End
The `PreCompact` or `SessionEnd` hook triggers curation:
1. Resumes the Claude session (or parses transcript as fallback)
2. Claude reviews the conversation with existing memories context
3. Extracts memories with rich metadata, skipping duplicates
4. Stores as markdown files with 384d embeddings
5. Routes to global or project scope

### 4. Memory Management
After curation, the deterministic manager deduplicates, supersedes stale memories, and links related ones. No LLM needed.

## Activation Signal Retrieval

Philosophy: **silence over noise**. A memory surfaces only if multiple signals agree.

**Phase 1 — 7 binary signals** (need 2+ to proceed):

| Signal | Description |
|--------|-------------|
| Trigger | Trigger phrase matched (>50% word match) |
| Tags | 2+ semantic tags found in message |
| Domain | Domain word found in message |
| Feature | Feature word found in message |
| Content | 3+ significant content words overlap |
| Files | Related file path matched in message |
| Vector | Semantic similarity >= 40% |

**Phase 2 — Importance ranking** among activated memories (base weight + signal/temporal/context bonuses).

**Selection**: Sort by signal count then importance. Max 2 global memories, project memories fill remaining slots.

## Architecture

```
Claude Code / Gemini CLI
  │
  ├─ SessionStart  → session-start.ts ──┐
  ├─ UserPrompt    → user-prompt.ts   ──┼──→ Memory Server (HTTP :8765)
  └─ SessionEnd    → curation.ts      ──┘         │
                                                   ▼
                                    ┌──────────────────────────┐
                                    │  Engine → Retrieval       │
                                    │  Curator → Store          │
                                    │  Manager (deterministic)  │
                                    │  Embeddings (MiniLM-L6)   │
                                    └──────────┬───────────────┘
                                               │
                                    ~/.local/share/memory/
                                      ├── global/memories/
                                      └── {project}/memories/
```

## Memory Schema

Memories are markdown files with YAML frontmatter:

```yaml
headline: "CLI returns error object when context full - check response.type"
importance_weight: 0.9
context_type: technical        # 11 types: technical, debug, architecture, decision, personal, philosophy, workflow, milestone, breakthrough, unresolved, state
status: active                 # active, superseded, deprecated, archived
scope: project                 # global or project
temporal_class: long_term      # eternal, long_term, medium_term, short_term, ephemeral
domain: embeddings
feature: vector-search
semantic_tags: [embeddings, vectors, memory-system]
trigger_phrases: [working with embeddings, vector search]
supersedes: "old-memory-id"    # explicit replacement chain
event_date: "2026-03-05"       # when it happened
```

## Two-Tier Structure

| Part | Purpose |
|------|---------|
| **Headline** | 1-2 line summary, always shown in retrieval |
| **Content** | Full structured template, expanded on demand via `/memory/expand` |

Type-specific templates: technical (WHAT/WHERE/HOW/WHY/GOTCHA), debug (SYMPTOM/CAUSE/FIX/PREVENT), decision (DECISION/OPTIONS/REASONING/REVISIT_WHEN), etc.

## Global vs Project Memories

- **Global** (`~/.local/share/memory/global/`): Personal, philosophy, preferences, cross-project breakthroughs — shared across ALL projects
- **Project** (`~/.local/share/memory/{project}/`): Technical details, debugging insights, project-specific decisions — isolated per project

Max 2 global memories per retrieval, technical types prioritized.

## CLI Commands

```bash
memory serve [--verbose] [--quiet] [--port 9000]
memory install [--gemini] [--force]
memory doctor [--verbose]
memory stats [--project x]
memory migrate [--dry-run] [--analyze] [--embeddings]
memory ingest [--session <id>] [--project <name>] [--all] [--dry-run]
```

## Action Items Signal

Add `***` at the end of any message to retrieve all pending action items (memories marked `action_required`, `awaiting_implementation`, `awaiting_decision`, or `unresolved`).

## Environment Variables

```bash
MEMORY_PORT=8765
MEMORY_HOST=localhost
MEMORY_STORAGE_MODE=central        # 'central' or 'local'
MEMORY_API_URL=http://localhost:8765
MEMORY_MANAGER_ENABLED=1
MEMORY_PERSONAL_ENABLED=1
ANTHROPIC_API_KEY=sk-...           # Optional: for SDK curation mode
```

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) and/or [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- ~100MB disk for embeddings model (downloaded on first run)

## License

MIT

## Credits

Fork of [RLabs-Inc/memory-ts](https://github.com/RLabs-Inc/memory-ts). Built with [fsdb](https://github.com/RLabs-Inc/fsdb), [@huggingface/transformers](https://github.com/xenova/transformers.js), and [Bun](https://bun.sh).
