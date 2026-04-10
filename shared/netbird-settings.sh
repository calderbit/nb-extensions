#!/usr/bin/env bash
#
# netbird-settings.sh - Interactive settings menu for NetBird VPN
#
# Reads current settings from `netbird status --json` and presents toggles
# via wofi/rofi/dmenu. Applies changes via `netbird up --flag=value`.
#
# The launcher can be forced via the NETBIRD_LAUNCHER environment variable.

set -euo pipefail

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
# Detect launcher
# ---------------------------------------------------------------------------
if [[ -n "${NETBIRD_LAUNCHER:-}" ]]; then
    LAUNCHER="$NETBIRD_LAUNCHER"
elif command -v wofi &>/dev/null; then
    LAUNCHER="wofi"
elif command -v rofi &>/dev/null; then
    LAUNCHER="rofi"
elif command -v dmenu &>/dev/null; then
    LAUNCHER="dmenu"
else
    notify "NetBird" "No launcher found (wofi, rofi, or dmenu)"
    exit 1
fi

launch_menu() {
    case "$LAUNCHER" in
        wofi)   wofi --dmenu --prompt "NetBird Settings" ;;
        rofi)   rofi -dmenu -p "NetBird Settings" ;;
        dmenu)  dmenu -p "NetBird Settings" ;;
        *)      $LAUNCHER ;;
    esac
}

# ---------------------------------------------------------------------------
# Fetch current status
# ---------------------------------------------------------------------------
STATUS_JSON=$(netbird status --json 2>/dev/null) || {
    notify "NetBird" "Could not read NetBird status"
    exit 1
}

# Parse settings from status JSON
SSH_ENABLED=$(echo "$STATUS_JSON" | jq -r '.sshServer.enabled // false')
QUANTUM=$(echo "$STATUS_JSON" | jq -r '.quantumResistance // false')
LAZY=$(echo "$STATUS_JSON" | jq -r '.lazyConnectionEnabled // false')

# ---------------------------------------------------------------------------
# Build menu entries
# ---------------------------------------------------------------------------
check() {
    if [[ "$1" == "true" ]]; then
        echo "[✓]"
    else
        echo "[ ]"
    fi
}

MENU=""
MENU+="$(check "$SSH_ENABLED") Allow SSH"$'\n'
MENU+="$(check "$QUANTUM") Quantum Resistance"$'\n'
MENU+="$(check "$LAZY") Lazy Connections"$'\n'
MENU+="---"$'\n'
MENU+="[Create Debug Bundle]"

# ---------------------------------------------------------------------------
# Present menu and act on selection
# ---------------------------------------------------------------------------
CHOICE=$(echo "$MENU" | launch_menu) || exit 0

# Strip the checkbox prefix to get the setting name
SETTING="${CHOICE#\[?\] }"
SETTING="${SETTING#"${SETTING%%[![:space:]]*}"}"
SETTING="${SETTING%"${SETTING##*[![:space:]]}"}"

case "$SETTING" in
    "Allow SSH")
        if [[ "$SSH_ENABLED" == "true" ]]; then
            netbird up --allow-server-ssh=false &>/dev/null &
            notify "NetBird" "SSH server disabled"
        else
            netbird up --allow-server-ssh &>/dev/null &
            notify "NetBird" "SSH server enabled"
        fi
        ;;
    "Quantum Resistance")
        if [[ "$QUANTUM" == "true" ]]; then
            netbird up --enable-rosenpass=false &>/dev/null &
            notify "NetBird" "Quantum resistance disabled"
        else
            netbird up --enable-rosenpass &>/dev/null &
            notify "NetBird" "Quantum resistance enabled"
        fi
        ;;
    "Lazy Connections")
        if [[ "$LAZY" == "true" ]]; then
            netbird up --enable-lazy-connection=false &>/dev/null &
            notify "NetBird" "Lazy connections disabled"
        else
            netbird up --enable-lazy-connection &>/dev/null &
            notify "NetBird" "Lazy connections enabled"
        fi
        ;;
    "---")
        # Separator, do nothing
        ;;
    "Create Debug Bundle"|"[Create Debug Bundle]")
        OUTPUT=$(netbird debug bundle 2>&1) || true
        notify "NetBird" "Debug bundle created\n$OUTPUT"
        ;;
esac
