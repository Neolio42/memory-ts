#!/bin/bash
# Trigger memory reflection after commits

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
[ "$TOOL_NAME" != "Bash" ] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
echo "$COMMAND" | grep -q "git commit" || exit 0

echo "Update your memory about this project's journey — what's happening, where it's heading, what matters."

exit 0
