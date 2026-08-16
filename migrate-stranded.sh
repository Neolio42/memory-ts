#!/usr/bin/env bash
set -euo pipefail

MEMORY_BASE="$HOME/.local/share/memory"

# Pairs: "old_dir:canonical_dir"
MAPPINGS=(
  "-Users-ned-Desktop-Productive:Productive"
  "-Users-ned-Desktop-Projects-whisnap:whisnap"
  "-Users-ned-Desktop-Projects-whisnap-ios:whisnap-ios"
  "-Users-ned-Desktop-Projects-whisnap-web:whisnap-web"
  "-Users-ned-Desktop-Projects-whisnap-brand:whisnap-brand"
)

total_copied=0
total_skipped_inactive=0
total_skipped_exists=0
total_nonmemory_copied=0
total_nonmemory_skipped=0

for pair in "${MAPPINGS[@]}"; do
  old_name="${pair%%:*}"
  canonical="${pair##*:}"
  old_dir="$MEMORY_BASE/$old_name"
  new_dir="$MEMORY_BASE/$canonical"

  echo ""
  echo "========================================"
  echo "Migrating: $old_name -> $canonical"
  echo "========================================"

  if [[ ! -d "$old_dir" ]]; then
    echo "  [SKIP] Source dir does not exist: $old_dir"
    continue
  fi

  # --- memories/ : apply active filter and project_id rewrite ---
  src_mem="$old_dir/memories"
  dst_mem="$new_dir/memories"

  if [[ -d "$src_mem" ]]; then
    mkdir -p "$dst_mem"
    mem_copied=0
    mem_skipped_inactive=0
    mem_skipped_exists=0

    for src_file in "$src_mem"/*; do
      [[ -f "$src_file" ]] || continue
      filename="$(basename "$src_file")"
      dst_file="$dst_mem/$filename"

      # Rule 1: only active memories
      if ! grep -qE '^status:.*active' "$src_file" 2>/dev/null; then
        mem_skipped_inactive=$((mem_skipped_inactive + 1))
        continue
      fi

      # Rule 2: don't overwrite existing
      if [[ -f "$dst_file" ]]; then
        mem_skipped_exists=$((mem_skipped_exists + 1))
        continue
      fi

      # Copy and rewrite project_id
      cp "$src_file" "$dst_file"
      # Replace project_id line — handles both quoted and unquoted values
      sed -i '' "s|^project_id:.*|project_id: \"$canonical\"|" "$dst_file"

      mem_copied=$((mem_copied + 1))
      echo "  [COPIED] memories/$filename"
    done

    echo "  memories/: copied=$mem_copied, skipped_inactive=$mem_skipped_inactive, skipped_exists=$mem_skipped_exists"
    total_copied=$((total_copied + mem_copied))
    total_skipped_inactive=$((total_skipped_inactive + mem_skipped_inactive))
    total_skipped_exists=$((total_skipped_exists + mem_skipped_exists))
  fi

  # --- other subdirs: sessions, snapshots, summaries (no active filter, no rewrite) ---
  for subdir in sessions snapshots summaries; do
    src_sub="$old_dir/$subdir"
    dst_sub="$new_dir/$subdir"

    if [[ ! -d "$src_sub" ]]; then
      continue
    fi

    # Check if there are any files
    shopt -s nullglob
    files=("$src_sub"/*)
    shopt -u nullglob

    if [[ ${#files[@]} -eq 0 ]]; then
      continue
    fi

    mkdir -p "$dst_sub"
    sub_copied=0
    sub_skipped=0

    for src_file in "${files[@]}"; do
      [[ -f "$src_file" ]] || continue
      filename="$(basename "$src_file")"
      dst_file="$dst_sub/$filename"

      if [[ -f "$dst_file" ]]; then
        sub_skipped=$((sub_skipped + 1))
        continue
      fi

      cp "$src_file" "$dst_file"
      sub_copied=$((sub_copied + 1))
    done

    if [[ $((sub_copied + sub_skipped)) -gt 0 ]]; then
      echo "  $subdir/: copied=$sub_copied, skipped_exists=$sub_skipped"
      total_nonmemory_copied=$((total_nonmemory_copied + sub_copied))
      total_nonmemory_skipped=$((total_nonmemory_skipped + sub_skipped))
    fi
  done
done

echo ""
echo "========================================"
echo "MIGRATION COMPLETE"
echo "========================================"
echo "  memories/ copied:           $total_copied"
echo "  memories/ skipped (inactive): $total_skipped_inactive"
echo "  memories/ skipped (exists):  $total_skipped_exists"
echo "  other files copied:          $total_nonmemory_copied"
echo "  other files skipped (exists): $total_nonmemory_skipped"
