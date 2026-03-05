#!/usr/bin/env bun
/**
 * clean-dupes.ts
 * Cleans up duplicate/stale memories and moves global-scoped memories.
 *
 * Usage:
 *   bun scripts/clean-dupes.ts           # dry-run (no changes)
 *   bun scripts/clean-dupes.ts --execute  # actually make changes
 */

import { readdirSync, statSync, mkdirSync } from "fs";
import { join } from "path";

const DRY_RUN = !process.argv.includes("--execute");
const PROJECT_DIR = `${process.env.HOME}/.local/share/memory/-Users-ned-Desktop-Productive/memories`;
const GLOBAL_DIR = `${process.env.HOME}/.local/share/memory/global/memories`;

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface Frontmatter {
  [key: string]: unknown;
  status?: string;
  scope?: string;
  headline?: string;
  superseded_by?: string | null;
}

function parseFrontmatter(raw: string): Frontmatter {
  const fm: Frontmatter = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // key: value — handle quoted strings, arrays, numbers, booleans, null
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();

    fm[key] = parseValue(rawVal);
  }
  return fm;
}

function parseValue(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  if (raw.startsWith("[")) {
    // Simple inline array — extract quoted string elements
    const inner = raw.slice(1, -1);
    if (inner.trim() === "") return [];
    return inner
      .split(",")
      .map((s) => {
        const t = s.trim();
        if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
        if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
        return t;
      })
      .filter(Boolean);
  }
  const num = Number(raw);
  if (!isNaN(num) && raw !== "") return num;
  return raw;
}

function splitFile(content: string): { fm: Frontmatter; fmRaw: string; body: string } | null {
  // Must start with ---
  if (!content.startsWith("---")) return null;
  const rest = content.slice(3);
  const endIdx = rest.indexOf("\n---");
  if (endIdx === -1) return null;
  const fmRaw = rest.slice(0, endIdx);
  const body = rest.slice(endIdx + 4); // skip \n---
  return { fm: parseFrontmatter(fmRaw), fmRaw, body };
}

// ---------------------------------------------------------------------------
// Frontmatter serialisation (update a single scalar field)
// ---------------------------------------------------------------------------

function updateFrontmatterField(fmRaw: string, key: string, value: string | null): string {
  const lines = fmRaw.split("\n");
  const updated: string[] = [];
  let found = false;
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1 && line.slice(0, colonIdx).trim() === key) {
      const serialised = value === null ? "null" : `"${value}"`;
      updated.push(`${line.slice(0, colonIdx + 1)} ${serialised}`);
      found = true;
    } else {
      updated.push(line);
    }
  }
  if (!found) {
    const serialised = value === null ? "null" : `"${value}"`;
    updated.push(`${key}: ${serialised}`);
  }
  return updated.join("\n");
}

function rebuildFile(fmRaw: string, body: string): string {
  return `---${fmRaw}\n---${body}`;
}

// ---------------------------------------------------------------------------
// Word-overlap similarity
// ---------------------------------------------------------------------------

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function wordOverlap(a: string, b: string): number {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let intersection = 0;
  for (const w of wa) {
    if (wb.has(w)) intersection++;
  }
  return intersection / Math.min(wa.size, wb.size);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface MemoryFile {
  path: string;
  filename: string;
  content: string;
  fm: Frontmatter;
  fmRaw: string;
  body: string;
  mtime: number;
}

async function loadMemories(dir: string): Promise<MemoryFile[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const memories: MemoryFile[] = [];

  for (const filename of files) {
    const path = join(dir, filename);
    const content = await Bun.file(path).text();
    const parsed = splitFile(content);
    if (!parsed) {
      console.warn(`  [WARN] Could not parse frontmatter: ${filename}`);
      continue;
    }
    const stat = statSync(path);
    memories.push({
      path,
      filename,
      content,
      fm: parsed.fm,
      fmRaw: parsed.fmRaw,
      body: parsed.body,
      mtime: stat.mtimeMs,
    });
  }

  return memories;
}

async function main() {
  console.log(`\nMemory Cleanup Script`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (pass --execute to apply changes)" : "EXECUTE"}`);
  console.log(`Source: ${PROJECT_DIR}`);
  console.log(`Global: ${GLOBAL_DIR}\n`);

  const memories = await loadMemories(PROJECT_DIR);
  console.log(`Loaded ${memories.length} memory files.\n`);

  const active = memories.filter((m) => m.fm.status === "active");
  console.log(`Active memories: ${active.length}`);

  let supersededCount = 0;
  let movedToGlobalCount = 0;

  // Track which files have been superseded in this run (by path)
  const supersededPaths = new Set<string>();

  // -------------------------------------------------------------------------
  // Step 1: Mark stale action items (URGENT / THIS SESSION in headline)
  // -------------------------------------------------------------------------
  console.log("\n--- Step 1: Stale action items (URGENT / THIS SESSION) ---");

  for (const mem of active) {
    const headline = String(mem.fm.headline ?? "");
    if (/URGENT|THIS SESSION/i.test(headline)) {
      console.log(`  [STALE] ${mem.filename}: "${headline}"`);
      if (!DRY_RUN) {
        const newFmRaw = updateFrontmatterField(mem.fmRaw, "status", "superseded");
        const newContent = rebuildFile(newFmRaw, mem.body);
        await Bun.write(mem.path, newContent);
        // Update in-memory so dedup step sees correct status
        mem.fm.status = "superseded";
        mem.fmRaw = newFmRaw;
        mem.content = newContent;
      }
      supersededCount++;
      supersededPaths.add(mem.path);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Deduplicate by headline word overlap
  // -------------------------------------------------------------------------
  console.log("\n--- Step 2: Duplicate detection (>80% headline word overlap) ---");

  // Only consider still-active memories that haven't been superseded this run
  const dedupePool = active.filter(
    (m) => !supersededPaths.has(m.path) && m.fm.status === "active"
  );

  // Build clusters greedily
  const visited = new Set<string>();
  const clusters: MemoryFile[][] = [];

  for (let i = 0; i < dedupePool.length; i++) {
    if (visited.has(dedupePool[i].path)) continue;
    const cluster: MemoryFile[] = [dedupePool[i]];
    visited.add(dedupePool[i].path);

    for (let j = i + 1; j < dedupePool.length; j++) {
      if (visited.has(dedupePool[j].path)) continue;
      const overlap = wordOverlap(
        String(dedupePool[i].fm.headline ?? ""),
        String(dedupePool[j].fm.headline ?? "")
      );
      if (overlap > 0.8) {
        cluster.push(dedupePool[j]);
        visited.add(dedupePool[j].path);
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  console.log(`  Found ${clusters.length} duplicate cluster(s).`);

  for (const cluster of clusters) {
    // Sort by mtime descending — newest first
    cluster.sort((a, b) => b.mtime - a.mtime);
    const keeper = cluster[0];
    const losers = cluster.slice(1);

    console.log(`\n  Cluster (keeping newest):`);
    console.log(`    KEEP   ${keeper.filename} (mtime: ${new Date(keeper.mtime).toISOString()}): "${keeper.fm.headline}"`);
    for (const loser of losers) {
      console.log(`    SUPER  ${loser.filename} (mtime: ${new Date(loser.mtime).toISOString()}): "${loser.fm.headline}"`);
      if (!DRY_RUN) {
        let newFmRaw = updateFrontmatterField(loser.fmRaw, "status", "superseded");
        // Set superseded_by to keeper id if available
        const keeperId = String(keeper.fm.id ?? keeper.filename.replace(".md", ""));
        newFmRaw = updateFrontmatterField(newFmRaw, "superseded_by", keeperId);
        const newContent = rebuildFile(newFmRaw, loser.body);
        await Bun.write(loser.path, newContent);
        loser.fm.status = "superseded";
      }
      supersededCount++;
      supersededPaths.add(loser.path);
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Move global-scoped active memories to global dir
  // -------------------------------------------------------------------------
  console.log("\n--- Step 3: Move global-scoped memories ---");

  const toMove = active.filter(
    (m) =>
      m.fm.scope === "global" &&
      !supersededPaths.has(m.path)
    // status check: we use the possibly-updated in-memory status
    && m.fm.status === "active"
  );

  console.log(`  Found ${toMove.length} global-scoped active memories to move.`);

  if (!DRY_RUN && toMove.length > 0) {
    mkdirSync(GLOBAL_DIR, { recursive: true });
  }

  for (const mem of toMove) {
    const dest = join(GLOBAL_DIR, mem.filename);
    console.log(`  MOVE  ${mem.filename} → ${GLOBAL_DIR}`);
    if (!DRY_RUN) {
      // Write to destination then remove source
      await Bun.write(dest, mem.content);
      const { unlink } = await import("fs/promises");
      await unlink(mem.path);
    }
    movedToGlobalCount++;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=== Summary ===");
  console.log(`  Superseded : ${supersededCount}`);
  console.log(`  Moved to global: ${movedToGlobalCount}`);
  if (DRY_RUN) {
    console.log("\n  (Dry run — no files were modified. Pass --execute to apply.)\n");
  } else {
    console.log("\n  Changes applied.\n");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
