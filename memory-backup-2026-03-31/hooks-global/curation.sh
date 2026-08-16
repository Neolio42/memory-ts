#!/bin/bash
# Memory curation hook — pure shell, no bun
# Triggers curation at PreCompact/SessionEnd

MEMORY_API="${MEMORY_API_URL:-http://localhost:8765}"
[ "$MEMORY_CURATOR_ACTIVE" = "1" ] && exit 0

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "PreCompact"')
CWD="${CLAUDE_PROJECT_DIR:-$(echo "$INPUT" | jq -r '.cwd // ""')}"
PROJECT_ID=$(basename "$CWD")

TRIGGER="session_end"
[ "$HOOK_EVENT" = "PreCompact" ] && TRIGGER="pre_compact"

echo "🧠 Curating memories ($HOOK_EVENT)..." >&2

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST "$MEMORY_API/memory/checkpoint" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg s "$SESSION_ID" --arg p "$PROJECT_ID" --arg cs "$SESSION_ID" --arg t "$TRIGGER" --arg c "$CWD" \
    '{session_id:$s, project_id:$p, claude_session_id:$cs, trigger:$t, cwd:$c}')" 2>/dev/null) || true

[ "$RESPONSE" = "200" ] && echo "✨ Memory curation started" >&2 || echo "⚠️ Memory server not available" >&2

exit 0
