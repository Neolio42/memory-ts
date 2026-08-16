/**
 * Test the curation prompt with a fake conversation.
 * Run: bun test-curator.ts
 *
 * Uses claude -p (no API key needed, uses Claude Code OAuth).
 * Shows exactly what memories the curator extracts and how it scopes them.
 */

import { Curator } from "./src/core/curator.ts";
import { MemoryStore } from "./src/core/store.ts";

const store = new MemoryStore({ storageMode: "central" });
const curator = new Curator();

// Get existing memories + primer for context (mirrors what the real engine does)
const globalMems = await store.getGlobalMemories();
const primer = await store.getPersonalPrimer();
let existingContext = "";

// Include primer topics so curator knows what's already covered
if (primer?.content) {
  existingContext += "\n### ALREADY IN SESSION PRIMER (do NOT re-extract any of this):\n";
  const primerLines = primer.content.split("\n").filter((l: string) => l.trim().length > 10);
  for (const line of primerLines.slice(0, 15)) {
    existingContext += `- ${line.trim().slice(0, 120)}\n`;
  }
  existingContext += "\n";
}

const activeGlobals = globalMems.filter(m => !m.status || m.status === "active");
if (activeGlobals.length) {
  existingContext += "\n## EXISTING MEMORIES (do not re-extract these — they already exist):\n";
  for (const m of activeGlobals.slice(0, 30)) {
    const shortId = m.id?.slice(-6) || "???";
    existingContext += `- [${shortId}] [scope:${m.scope || "?"}] ${m.headline || m.content?.slice(0, 80)}\n`;
  }
}

const prompt = curator.buildCurationPrompt("session_end", existingContext);

// ============================================================================
// Fake conversation #3 — Long debugging session with lots of traps
// This one is TRICKY because:
//   1. Lots of back-and-forth debugging that should collapse into ONE memory
//   2. User shares thoughts mid-debug that restate known primer content
//   3. User references another project's bug — should NOT create memory for it
//   4. A collaboration correction that IS a new rule
//   5. User dictates exact deploy commands — ephemeral
//   6. Long tangent about AI/future that restates known "Mars/BCI" vision
//   7. A genuinely new technical discovery (Tauri IPC bottleneck)
//   8. User mentions a friend's startup — completely irrelevant noise
//
// EXPECTED:
//   GLOBAL: 0-1 (the "don't refactor while fixing bugs" rule)
//   PROJECT: 2-3 (Tauri IPC discovery, buffer root cause fix, maybe deploy config)
//   SHOULD NOT EXTRACT: AI tangent (primer), pixel-office ref (wrong project),
//     friend's startup (noise), deploy commands (ephemeral),
//     "works best under pressure" (primer), intermediate debug steps (process not result)
// ============================================================================

const lines = [
  "USER: dude the app is completely fucked. Users are reporting that recordings just stop mid-sentence. Like 30 seconds in it just dies.",
  "",
  "ASSISTANT: Let me check the audio pipeline. Is this happening on all devices or specific ones?",
  "",
  "USER: seems like mostly older Macs. M1 MacBook Air users specifically. M2+ seems fine.",
  "",
  "ASSISTANT: That could be a memory pressure issue. M1 Airs have 8GB RAM. Let me check if the audio buffer allocation is too aggressive.",
  "",
  "USER: yeah check that. This is literally killing us \u2014 our best power user just tweeted that whisnap is broken. 200 followers but still.",
  "",
  "ASSISTANT: Found it. The audio capture is allocating a 50MB ring buffer upfront regardless of available memory. On 8GB M1 Airs running Chrome with 30 tabs, the system kills the audio process. We need dynamic buffer sizing based on available memory.",
  "",
  "USER: how much memory do we actually need?",
  "",
  "ASSISTANT: For 16kHz mono Float32, a 60-second buffer is only 3.8MB. The 50MB buffer was sized for 16-minute recordings at 48kHz stereo \u2014 way overkill for the current pipeline.",
  "",
  "USER: holy shit. 50MB vs 3.8MB? Who wrote this?",
  "",
  "ASSISTANT: Looks like it was set during the early prototyping when you were testing with stereo input. The pipeline switched to mono 16kHz months ago but the buffer size never got updated.",
  "",
  "USER: classic. Fix it to 4MB with a fallback to 2MB if memory pressure is high.",
  "",
  "ASSISTANT: Done. I also added a memory pressure observer that downsizes the buffer from 4MB to 2MB when the system sends a memory warning.",
  "",
  "USER: wait don't also refactor the audio module while you're in there. I saw you touching AudioCapture.swift. Just fix the buffer, nothing else. Every time you fix a bug you try to clean up the surrounding code and it introduces new bugs.",
  "",
  "ASSISTANT: You're right, I'll revert the other changes. Only the buffer size fix.",
  "",
  "USER: yeah that's a rule from now on. When fixing bugs, ONLY fix the bug. No cleanup, no refactoring, no 'while I'm here' improvements. Separate PRs for that.",
  "",
  "ASSISTANT: Got it. Bug fixes are surgical \u2014 only the fix, nothing else. Refactoring gets its own PR.",
  "",
  "USER: ok cool. Hey btw you know what's funny \u2014 this bug is exactly like the pixel-office websocket timeout we fixed last week. Same pattern \u2014 allocated resources sized for development, never resized for production.",
  "",
  "ASSISTANT: Good pattern recognition. The pixel-office WebSocket had a 100MB receive buffer that only needed to be 1MB for the actual message sizes.",
  "",
  "USER: yeah. Anyway \u2014 I also discovered something weird. The Tauri IPC bridge has a 1MB payload limit by default. If a transcription result is longer than 1MB (which happens with hour-long meetings), the IPC call silently fails and returns undefined. No error, no warning. Just undefined.",
  "",
  "ASSISTANT: That's a significant finding. Tauri's IPC uses JSON serialization over the bridge, and the default payload limit is 1MB. For large transcriptions, you'd need to either stream the result in chunks or increase the limit in tauri.conf.json with the ipc section under app.security.",
  "",
  "USER: where in tauri.conf.json?",
  "",
  'ASSISTANT: Under the app section: app > security > ipc > maximumSize \u2014 set it to 10485760 for 10MB.',
  "",
  "USER: nice. Set it to 10MB. That should cover even the longest meetings.",
  "",
  "ASSISTANT: Done. Updated tauri.conf.json with 10MB IPC limit.",
  "",
  "USER: you know, sometimes I think about just dropping everything and going full time into AI research. Like actual research, not apps. But then I remember I need the money first. The 5M goal. Then I can do whatever I want.",
  "",
  "ASSISTANT: The sequencing makes sense \u2014 build the financial foundation with Whisnap, then pivot to deeper work.",
  "",
  "USER: yeah exactly. My friend Tomas just raised 2M for his AI startup in Vilnius. Some kind of legal document parser. Good for him but that VC path isn't for me. I want to own 100% when I sell.",
  "",
  "ASSISTANT: Solo path with full ownership is definitely more aligned with your goals. VC dilution would undermine the whole point of the 5M target.",
  "",
  "USER: right. OK let's deploy this fix. Run the standard deploy: bun run build and then rsync to agent server and pm2 restart whisnap.",
  "",
  "ASSISTANT: Running the deploy now.",
  "",
  "USER: wait actually before deploying \u2014 I work best when there's real pressure. Like right now this bug report from our power user is actually making me more focused than I've been all week. Isn't that weird?",
  "",
  "ASSISTANT: Not weird at all \u2014 it's the external pressure pattern. Real stakes activate your focus in a way that self-imposed deadlines don't.",
  "",
  "USER: hah yeah. Ship it.",
];

const fakeTranscript = lines.join("\n");

const fullPrompt = prompt + "\n\n---\n\nHere is the conversation transcript:\n" + fakeTranscript;

console.log("\u{1F9EA} Running curator prompt through claude -p...\n");
console.log(`\u{1F4CA} Prompt size: ${(fullPrompt.length / 1024).toFixed(1)}KB`);
console.log(`\u{1F4DA} Existing global memories fed: ${activeGlobals.length}\n`);
console.log("\u23F3 Waiting for claude -p response...\n");

// Run through claude -p (MEMORY_CURATOR_ACTIVE=1 prevents hooks from triggering real curation)
const proc = Bun.spawn(
  ["claude", "-p", "--strict-mcp-config", fullPrompt],
  {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, MEMORY_CURATOR_ACTIVE: "1" },
  }
);

const output = await new Response(proc.stdout).text();
const exitCode = await proc.exited;

if (exitCode !== 0) {
  const stderr = await new Response(proc.stderr).text();
  console.error("\u274C claude -p failed:", stderr);
  process.exit(1);
}

// Extract JSON from the response (may be wrapped in markdown code blocks)
try {
  // Strip markdown code fences if present
  let cleaned = output.replace(/```json\s*/g, "").replace(/```\s*/g, "");

  // Try to parse the whole thing as JSON first
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object or array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (objMatch) {
      parsed = JSON.parse(objMatch[0]);
    } else if (arrMatch) {
      parsed = JSON.parse(arrMatch[0]);
    }
  }

  if (!parsed) {
    console.log("\u26A0\uFE0F  No JSON found in output. Raw response:\n");
    console.log(output.slice(0, 3000));
    process.exit(1);
  }

  // Handle both formats: { memories: [...] } or just [...]
  const memories = Array.isArray(parsed) ? parsed : (parsed.memories || []);

  console.log(`\u2705 Extracted ${memories.length} memories:\n`);
  console.log("\u2500".repeat(80));

  let globalCount = 0;
  let projectCount = 0;

  for (const mem of memories) {
    const scope = mem.scope || "?";
    if (scope === "global") globalCount++;
    else projectCount++;

    const icon = scope === "global" ? "\u{1F30D} GLOBAL" : "\u{1F4C1} PROJECT";
    console.log(`\n${icon} | ${mem.context_type || "?"} | weight: ${mem.importance_weight || "?"}`);
    console.log(`  "${mem.headline || mem.content?.slice(0, 100)}"`);
    console.log(`  tags: [${(mem.semantic_tags || []).join(", ")}]`);
    console.log(`  triggers: [${(mem.trigger_phrases || []).join(", ")}]`);
    if (mem.domain) console.log(`  domain: ${mem.domain} | feature: ${mem.feature || "-"}`);
    if (mem.supersedes) console.log(`  \u26A0\uFE0F  supersedes: ${mem.supersedes}`);
    if (mem.event_date) console.log(`  \u{1F4C5} ${mem.event_date}`);
  }

  console.log("\n" + "\u2500".repeat(80));
  console.log(`\n\u{1F4CA} SUMMARY: ${memories.length} total \u2014 ${globalCount} global, ${projectCount} project`);

  if (globalCount > 1) {
    console.log(`\n\u26A0\uFE0F  WARNING: ${globalCount} globals \u2014 should be 0-1 for this conversation.`);
  }
  if (globalCount === 0) {
    console.log(`\n\u2705 Zero globals. Could be correct if "bug fix only" rule wasn't extracted.`);
  }
  if (globalCount === 1) {
    console.log(`\n\u2705 One global \u2014 check if it's the "bug fix only" collaboration rule.`);
  }

  // Check for things that SHOULD NOT have been extracted
  const suspiciousKeywords = [
    "tomas", "friend", "raised 2m", "vc",           // noise: friend's startup
    "5m goal", "ai research", "mars", "bci",         // primer: already known vision
    "pressure", "focused", "external",               // primer: already known pattern
    "pixel-office", "websocket",                     // wrong project reference
    "deploy", "rsync", "pm2",                        // ephemeral deploy commands
    "power user", "tweeted",                         // ephemeral event
  ];
  for (const mem of memories) {
    const text = ((mem.headline || "") + " " + (mem.content || "")).toLowerCase();
    for (const kw of suspiciousKeywords) {
      if (text.includes(kw)) {
        console.log(`\n\u{1F6A9} SUSPECT: "${(mem.headline || mem.content).slice(0, 80)}"`);
        console.log(`   Matched keyword "${kw}" \u2014 this probably should NOT have been extracted.`);
        break;
      }
    }
  }

  // Check for stuff that SHOULD have been extracted
  const expectedKeywords = [
    "buffer",           // root cause: 50MB buffer reduced to 4MB
    "tauri", "ipc",     // Tauri IPC 1MB limit discovery
    "bug fix", "refactor", "surgical",  // collaboration rule (at least one of these)
  ];
  const extractedText = memories.map((m: any) => ((m.headline || "") + " " + (m.content || "")).toLowerCase()).join(" ");
  const missing = expectedKeywords.filter(kw => !extractedText.includes(kw));
  if (missing.length) {
    console.log(`\n\u26A0\uFE0F  MISSING expected content: ${missing.join(", ")}`);
  }

  // Print session summary if present
  if (parsed.session_summary) {
    console.log(`\n\u{1F4DD} Session summary: ${parsed.session_summary}`);
  }
  if (parsed.project_snapshot) {
    console.log(`\u{1F4E6} Project snapshot: ${JSON.stringify(parsed.project_snapshot, null, 2)}`);
  }

} catch (e) {
  console.log("\u26A0\uFE0F  Parse error:", (e as Error).message);
  console.log("\nRaw output:\n");
  console.log(output.slice(0, 3000));
}
