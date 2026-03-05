// ============================================================================
// MEMORY MANAGER - Deterministic post-curation deduplication
// No LLM calls - fast, reliable rules-based cleanup
// ============================================================================

import type { StoredMemory } from "../types/memory.ts";
import { logger } from "../utils/logger.ts";
import type { MemoryStore } from "./store.ts";

// Re-export StoragePaths for backwards compatibility
export type { StoragePaths } from "../utils/paths.ts";

/**
 * Manager configuration
 */
export interface ManagerConfig {
  /**
   * Enable the management agent
   * When disabled, memories are stored but not organized/linked
   * Default: true
   */
  enabled?: boolean;
}

/**
 * Management result - what the manager did
 */
export interface ManagementResult {
  success: boolean;
  superseded: number;
  resolved: number;
  linked: number;
  filesRead: number;
  filesWritten: number;
  primerUpdated: boolean;
  actions: string[];
  summary: string;
  fullReport: string;
  error?: string;
}

/**
 * Calculate word overlap ratio between two strings
 * Returns 0-1 where 1 means all words match
 */
function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const smaller = Math.min(wordsA.size, wordsB.size);
  return overlap / smaller;
}

/**
 * Count shared tags between two memories
 */
function sharedTagCount(a: StoredMemory, b: StoredMemory): number {
  const tagsA = new Set((a.semantic_tags || []).map(t => t.toLowerCase()));
  const tagsB = new Set((b.semantic_tags || []).map(t => t.toLowerCase()));
  let count = 0;
  for (const tag of tagsA) {
    if (tagsB.has(tag)) count++;
  }
  return count;
}

/**
 * Memory Manager - Deterministic deduplication and linking
 */
export class Manager {
  private _config: { enabled: boolean };

  constructor(config: ManagerConfig = {}) {
    this._config = {
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Run deterministic dedup and linking on all active memories
   *
   * Rules:
   * 1. Same domain + feature + >80% headline overlap → supersede older
   * 2. Same context_type='state' for same project → supersede older (state is always latest)
   * 3. 3+ shared semantic tags → link via related_to
   */
  async manage(
    store: MemoryStore,
    projectId: string,
    newMemoryIds: string[],
  ): Promise<ManagementResult> {
    if (!this._config.enabled || process.env.MEMORY_MANAGER_DISABLED === "1") {
      return {
        success: true, superseded: 0, resolved: 0, linked: 0,
        filesRead: 0, filesWritten: 0, primerUpdated: false,
        actions: [], summary: "Manager disabled", fullReport: "Manager disabled",
      };
    }

    if (newMemoryIds.length === 0) {
      return {
        success: true, superseded: 0, resolved: 0, linked: 0,
        filesRead: 0, filesWritten: 0, primerUpdated: false,
        actions: [], summary: "No new memories", fullReport: "No new memories to process",
      };
    }

    const actions: string[] = [];
    let supersededCount = 0;
    let linkedCount = 0;

    try {
      // Load all active memories
      const [projectMemories, globalMemories] = await Promise.all([
        store.getAllMemories(projectId),
        store.getGlobalMemories(),
      ]);
      const allMemories = [...projectMemories, ...globalMemories]
        .filter(m => !m.status || m.status === "active");

      const newMemories = allMemories.filter(m => newMemoryIds.includes(m.id));
      const existingMemories = allMemories.filter(m => !newMemoryIds.includes(m.id));

      logger.debug(
        `Manager: ${newMemories.length} new, ${existingMemories.length} existing active memories`,
        "manager",
      );

      // Rule 1: Dedup by domain + feature + headline overlap
      for (const newMem of newMemories) {
        if (!newMem.domain || !newMem.feature) continue;

        for (const existing of existingMemories) {
          if (existing.domain !== newMem.domain) continue;
          if (existing.feature !== newMem.feature) continue;

          // Check headline overlap
          const newHeadline = newMem.headline || newMem.content.slice(0, 100);
          const existingHeadline = existing.headline || existing.content.slice(0, 100);
          const overlap = wordOverlap(newHeadline, existingHeadline);

          if (overlap >= 0.8) {
            // Supersede the older memory
            const isGlobal = existing.project_id === "global";
            if (isGlobal) {
              await store.updateGlobalMemory(existing.id, {
                status: "superseded",
                superseded_by: newMem.id,
              });
            } else {
              await store.updateMemory(projectId, existing.id, {
                status: "superseded",
                superseded_by: newMem.id,
              });
            }
            supersededCount++;
            actions.push(
              `SUPERSEDED ${existing.id.slice(-6)} by ${newMem.id.slice(-6)} (domain=${newMem.domain}, feature=${newMem.feature}, overlap=${(overlap * 100).toFixed(0)}%)`,
            );
          }
        }
      }

      // Rule 2: State memories — only keep the latest per project
      const stateMemories = allMemories.filter(
        m => m.context_type === "state" && m.project_id === projectId,
      );
      if (stateMemories.length > 1) {
        // Sort by created_at desc, keep newest
        const sorted = stateMemories.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        for (let i = 1; i < sorted.length; i++) {
          const older = sorted[i]!;
          await store.updateMemory(projectId, older.id, { status: "superseded" });
          supersededCount++;
          actions.push(
            `SUPERSEDED ${older.id.slice(-6)} (older state memory, keeping ${sorted[0]!.id.slice(-6)})`,
          );
        }
      }

      // Rule 3: Link memories with 3+ shared semantic tags
      for (const newMem of newMemories) {
        for (const other of allMemories) {
          if (other.id === newMem.id) continue;
          if (sharedTagCount(newMem, other) >= 3) {
            // Add related_to link (both directions would be ideal but we only update the new one)
            const isGlobal = newMem.project_id === "global";
            const existingRelated = newMem.related_to || [];
            if (!existingRelated.includes(other.id)) {
              if (isGlobal) {
                await store.updateGlobalMemory(newMem.id, {
                  related_to: [...existingRelated, other.id],
                });
              } else {
                await store.updateMemory(projectId, newMem.id, {
                  related_to: [...existingRelated, other.id],
                });
              }
              linkedCount++;
              actions.push(
                `LINKED ${newMem.id.slice(-6)} ↔ ${other.id.slice(-6)} (${sharedTagCount(newMem, other)} shared tags)`,
              );
            }
          }
        }
      }

      const summary = `Superseded: ${supersededCount}, Linked: ${linkedCount}`;
      logger.debug(`Manager complete: ${summary}`, "manager");

      return {
        success: true,
        superseded: supersededCount,
        resolved: 0,
        linked: linkedCount,
        filesRead: 0,
        filesWritten: supersededCount + linkedCount,
        primerUpdated: false,
        actions,
        summary,
        fullReport: `=== MANAGEMENT ACTIONS ===\n${actions.join("\n")}\n\n=== SUMMARY ===\n${summary}`,
      };
    } catch (error: any) {
      logger.error(`Manager failed: ${error.message}`);
      return {
        success: false, superseded: supersededCount, resolved: 0, linked: linkedCount,
        filesRead: 0, filesWritten: 0, primerUpdated: false,
        actions, summary: "", fullReport: `Manager error: ${error.message}`,
        error: error.message,
      };
    }
  }
}

/**
 * Create a new manager
 */
export function createManager(config?: ManagerConfig): Manager {
  return new Manager(config);
}
