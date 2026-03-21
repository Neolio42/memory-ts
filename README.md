# memory

Persistent memory for AI coding sessions. Your AI remembers who you are, what you've built, and picks up where you left off.

Hooks into **Claude Code** and **Gemini CLI** — memories are extracted at session end and resurface automatically when relevant.

## Quick Start

```bash
bun install -g github:Neolio42/memory-ts

memory install              # Claude Code hooks
memory install --gemini     # Gemini CLI hooks

memory serve                # Start the server
memory doctor               # Verify everything works
```

Use your AI normally. Memories are extracted and surfaced without any manual intervention.

## How It Works

A lightweight HTTP server (`localhost:8765`) sits between your AI CLI and a local memory store. Three hooks drive everything:

**Session start** — Injects a primer: who you are, last session summary, project status, temporal context.

**Every message** — Embeds your message (~5ms), runs it through the activation signal algorithm against all stored memories, injects the relevant ones as context.

**Session end** — Curates the conversation into structured memories with rich metadata (trigger phrases, semantic tags, domain/feature labels, importance weights). Stores as markdown files with 384-dimensional vector embeddings.

## Retrieval

Philosophy: **silence over noise**. A memory only surfaces when multiple independent signals agree it should.

7 binary signals are checked against each memory: trigger phrase match, semantic tag overlap, domain match, feature match, content word overlap, file path match, and vector similarity. Need 2+ to activate.

Activated memories get ranked by importance with modifiers:
- **Decay** — memories fade over sessions if not resurfaced (`fade_rate × sessions_since_surfaced`)
- **Age** — ephemeral memories expire in days, short-term in a week, medium-term in a month
- **Intent** — keyword classifier detects technical/personal/casual context and penalizes cross-type memories
- **Floor** — anything scoring below 0.4 after penalties gets dropped

Max 3 memories per message, 1 global cap. Tested against 119 real voice-transcribed messages — 0.73 avg per message, zero false cross-context leaks.

## Curation

At session end, Claude reviews the full conversation with awareness of all existing memories. It extracts new ones with structured metadata and can explicitly supersede outdated memories.

A deterministic manager runs after curation — deduplicates by domain+feature+headline overlap, links related memories, keeps the newest state snapshots. No LLM needed, runs in <10ms.

## Memory Schema

Memories are markdown files with YAML frontmatter:

```yaml
headline: "Tauri IPC has 1MB payload limit — silent failure on large transcriptions"
importance_weight: 0.85
context_type: technical        # technical, debug, architecture, decision, personal, philosophy, workflow, milestone, breakthrough, unresolved, state
status: active                 # active, superseded, deprecated, archived
scope: project                 # global (cross-project) or project (isolated)
temporal_class: long_term      # eternal, long_term, medium_term, short_term, ephemeral
domain: tauri
feature: ipc-bridge
semantic_tags: [tauri, ipc, payload, silent-failure]
trigger_phrases: [tauri ipc limit, large transcription fails, ipc undefined]
```

Two-tier structure: **headline** (always shown) + **content body** (structured template, expanded on demand). Templates vary by type — technical gets WHAT/WHERE/HOW/WHY/GOTCHA, debug gets SYMPTOM/CAUSE/FIX/PREVENT, etc.

## Storage

```
~/.local/share/memory/
  ├── global/memories/      # Personal, philosophy, preferences — shared across all projects
  └── {project}/memories/   # Technical, debug, decisions — isolated per project
```

Global memories carry identity and cross-project knowledge. Project memories stay scoped to where they're relevant.

## Architecture

```
Claude Code / Gemini CLI
  │
  ├─ SessionStart  → session-start hook ──┐
  ├─ UserPrompt    → user-prompt hook   ──┼──→ Memory Server (HTTP :8765)
  └─ SessionEnd    → curation hook      ──┘         │
                                                     ▼
                                      ┌────────────────────────┐
                                      │  Engine    → Retrieval  │
                                      │  Curator   → Store      │
                                      │  Manager   (rules)      │
                                      │  Embeddings (MiniLM-L6) │
                                      └────────────────────────┘
```

## CLI

```bash
memory serve [--verbose] [--port 9000]   # Run the server
memory install [--gemini] [--force]      # Set up hooks
memory doctor [--verbose]                # Health check
memory stats [--project x]              # Memory counts
memory migrate [--dry-run] [--embeddings] # DB maintenance
memory ingest [--session <id>] [--all]   # Manual curation
```

## Environment Variables

```bash
MEMORY_PORT=8765
MEMORY_HOST=localhost
MEMORY_STORAGE_MODE=central        # 'central' or 'local'
MEMORY_MANAGER_ENABLED=1
MEMORY_PERSONAL_ENABLED=1
ANTHROPIC_API_KEY=sk-...           # Optional: for SDK curation mode
```

## Requirements

- [Bun](https://bun.sh)
- [Claude Code](https://claude.ai/code) and/or [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- ~100MB for the embeddings model (auto-downloaded on first run)

## License

MIT

## Credits

Originally inspired by [RLabs-Inc/memory-ts](https://github.com/RLabs-Inc/memory-ts). Built with [fsdb](https://github.com/RLabs-Inc/fsdb), [@huggingface/transformers](https://github.com/xenova/transformers.js), and [Bun](https://bun.sh).
