#!/bin/bash
[ "$PIXEL_OFFICE_HAIKU" = "1" ] && exit 0
# Memory user-prompt hook — pure shell, no bun
set -e

MEMORY_API="${MEMORY_API_URL:-http://localhost:8765}"
[ "$MEMORY_CURATOR_ACTIVE" = "1" ] && exit 0

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')
CWD="${CLAUDE_PROJECT_DIR:-$(echo "$INPUT" | jq -r '.cwd // ""')}"
PROJECT_ID=$(basename "$CWD")

RESULT=$(curl -s --max-time 5 -X POST "$MEMORY_API/memory/context" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg s "$SESSION_ID" --arg p "$PROJECT_ID" --arg m "$PROMPT" \
    '{session_id:$s, project_id:$p, current_message:$m, max_memories:5}')" 2>/dev/null) || true

curl -s --max-time 3 -X POST "$MEMORY_API/memory/process" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg s "$SESSION_ID" --arg p "$PROJECT_ID" \
    '{session_id:$s, project_id:$p}')" >/dev/null 2>&1 || true

echo "$RESULT" | jq -r '.context_text // empty' 2>/dev/null

exit 0
