#!/usr/bin/env bash
# backup-db.sh — daily online snapshot of mc.db with keep-N rotation.
#
# mc.db is gitignored AND excluded from the nightly R2 sweep, so before this
# script the entire dashboard dataset (tasks, opportunities, cost history) had
# zero recoverable copy — one disk failure was total loss. This writes a
# consistent snapshot into data/backups/, which the R2 nightly now sweeps
# off-box (see ~/.openclaw/scripts/backup-to-cloud.sh, TREE_PATHS).
#
# A backup that can't restore is worthless, so every snapshot is integrity-
# checked and deleted if the check fails (a bad backup must never masquerade
# as a good one).
#
#   ./scripts/backup-db.sh           # -> data/backups/mc-YYYY-MM-DD.db
#   KEEP=14 ./scripts/backup-db.sh   # override 7-day retention
#   MC_DB_PATH=/tmp/x.db ./scripts/backup-db.sh   # back up a different DB
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${MC_DB_PATH:-$APP_DIR/data/mc.db}"
BACKUP_DIR="$APP_DIR/data/backups"
KEEP="${KEEP:-7}"

[[ -f "$DB" ]] || { echo "backup-db: no database at $DB" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

DEST="$BACKUP_DIR/mc-$(date +%F).db"

# Online backup via the SQLite backup API — consistent against a live WAL-mode
# DB with concurrent readers/writers (does not require stopping the server).
sqlite3 "$DB" ".backup '$DEST'"

# Refuse to keep a snapshot that won't open or fails its integrity check.
check="$(sqlite3 "$DEST" 'PRAGMA integrity_check;' 2>&1 || echo 'open-failed')"
if [[ "$check" != "ok" ]]; then
  echo "backup-db: integrity_check FAILED for $DEST ($check) — removing" >&2
  rm -f "$DEST"
  exit 1
fi

# Opportunistic maintenance: fold + truncate the live WAL so it does not sit at
# its high-water mark under the long-lived server process (triage F20).
sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null 2>&1 || true

# keep-N rotation. Date-stamped names sort lexically == chronologically, so the
# oldest beyond KEEP are the ones dropped.
ls -1 "$BACKUP_DIR"/mc-*.db 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -f

count="$(ls -1 "$BACKUP_DIR"/mc-*.db 2>/dev/null | wc -l)"
echo "backup-db: wrote $DEST ($(stat -c%s "$DEST") bytes); $count snapshot(s) retained (keep=$KEEP)"
