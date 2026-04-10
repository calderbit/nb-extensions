#!/usr/bin/env bash
#
# netbird-toggle.sh - Connect, disconnect, or toggle NetBird VPN
#
# Usage: netbird-toggle.sh [up|down]
#
# With no argument the script toggles: connected -> down, everything else -> up.
# Sends desktop notifications via notify-send when available.

set -euo pipefail

ACTION="${1:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
notify() {
    if command -v notify-send &>/dev/null; then
        notify-send "$@"
    fi
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if ! command -v netbird &>/dev/null; then
    notify "NetBird" "netbird binary not found"
    exit 1
fi

# ---------------------------------------------------------------------------
# Explicit up / down -- skip status query
# ---------------------------------------------------------------------------
if [[ "$ACTION" == "up" ]]; then
    notify "NetBird" "Connecting..."
    netbird up &>/dev/null &
    exit 0
fi

if [[ "$ACTION" == "down" ]]; then
    notify "NetBird" "Disconnecting..."
    netbird down &>/dev/null &
    exit 0
fi

# ---------------------------------------------------------------------------
# Toggle mode -- determine current state
# ---------------------------------------------------------------------------
CURRENT_STATUS=$(netbird status --json 2>/dev/null | jq -r '.daemonStatus // empty') || CURRENT_STATUS=""

case "$CURRENT_STATUS" in
    Connected)
        notify "NetBird" "Disconnecting..."
        netbird down &>/dev/null &
        ;;
    NeedsLogin|LoginFailed|SessionExpired)
        notify "NetBird" "Login required — opening browser..."
        netbird up &>/dev/null &
        ;;
    *)
        notify "NetBird" "Connecting..."
        netbird up &>/dev/null &
        ;;
esac
