#!/bin/bash
# Test the curation prompt with a fake conversation
# Run from a separate terminal: bash test-curator.sh

cd "$(dirname "$0")"

# Build the prompt + fake transcript, pipe to claude
bun -e '
import { MemoryCurator } from "./src/core/curator.ts";
import { MemoryStore } from "./src/core/store.ts";

const store = new MemoryStore({ storageMode: "central" });
const curator = new MemoryCurator();

// Get existing memories for context
const projectId = "test-project";
const projectMems = await store.getAllMemories(projectId);
const globalMems = await store.getGlobalMemories();

let existingContext = "";
if (projectMems.length || globalMems.length) {
  existingContext = "\n## EXISTING MEMORIES (do not re-extract):\n";
  for (const m of [...globalMems, ...projectMems].slice(0, 20)) {
    existingContext += `- [${m.id?.slice(-6)}] ${m.headline || m.content?.slice(0, 80)}\n`;
  }
}

const prompt = curator.buildCurationPrompt("session_end", existingContext);

// Fake conversation that mixes personal + technical + cross-project stuff
const fakeTranscript = `
USER: Hey, I just finished setting up the new auth system for whisnap-web. Using Clerk now instead of rolling our own.

ASSISTANT: Got it. I see you switched from the custom JWT auth to Clerk. That should simplify things significantly. The integration looks clean.

USER: Yeah. Also I talked to my psychiatrist today - she finally prescribed bupropion. Starting 150mg tomorrow. Took 3 appointments to get here but whatever.

ASSISTANT: That is good news. The persistence paid off.

USER: Anyway back to work. The Clerk webhook needs to sync with our Supabase users table. I wrote a Next.js API route at /api/webhooks/clerk but it keeps timing out because the Supabase client is using the wrong connection pool.

ASSISTANT: The timeout is likely because you are creating a new Supabase client per request instead of reusing a singleton. In Next.js API routes with the App Router, each request gets a fresh module context. You need to use a module-level client or connection pooler like PgBouncer.

USER: Oh shit yeah, we hit that exact bug in pixel-office too. The module isolation thing. OK fixed it with a singleton.

ASSISTANT: That is the same Next.js App Router module isolation issue. Good catch reusing that knowledge.

USER: Also random thought - I think for the memory system, the curator should weigh recent memories higher. Like if something was created today vs 2 weeks ago, the today one should matter more for dedup decisions. Just a thought for later.

ASSISTANT: That is a good insight. Currently the curator sees existing memories but does not consider recency. A time-weighted dedup where newer memories take priority over older ones with similar content would reduce stale accumulation.

USER: yep. OK clerk webhooks working now. Ship it.
`;

// Output the full prompt + transcript for claude -p
const fullPrompt = prompt + "\n\n---\n\nHere is the conversation transcript:\n" + fakeTranscript;
process.stdout.write(fullPrompt);
' 2>/dev/null | claude -p --strict-mcp-config --output-format json "$(cat /dev/stdin)"
