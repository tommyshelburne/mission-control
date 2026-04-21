#!/usr/bin/env bash
# Wraps an openclaw agent invocation with before/after heartbeat POSTs to Mission Control.
#
# Usage: with-heartbeat.sh AGENT_NAME CMD [ARGS...]
# Example cron line:
#   * * * * * /home/claw/.openclaw/workspace/mission-control/scripts/with-heartbeat.sh warden openclaw agent --agent warden --message "scan"
#
# Env:
#   MC_URL — Mission Control base URL (default: http://localhost:3000)

set -u

AGENT_NAME="${1:?agent name required as first arg}"
shift

MC_URL="${MC_URL:-http://localhost:3000}"
HB_ENDPOINT="$MC_URL/api/agents/heartbeat"

beat() {
  # Never fail the wrapped command because the heartbeat post failed.
  curl -sf --max-time 3 -X POST "$HB_ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d "$1" >/dev/null 2>&1 || true
}

# Always report idle on exit (success or failure).
# NOTE: do NOT use `exec` — it replaces the shell process and the EXIT trap never fires.
trap 'beat "{\"name\":\"$AGENT_NAME\",\"status\":\"idle\"}"' EXIT

beat "{\"name\":\"$AGENT_NAME\",\"status\":\"busy\"}"

"$@"
exit "$?"
