#!/usr/bin/env bash
#
# netbird-networks.sh - Interactive network selector for NetBird VPN
#
# Parses `netbird networks list` and presents a menu via wofi/rofi/dmenu.
# Supports selecting, deselecting, and toggling individual networks
# as well as bulk select-all / deselect-all.
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
# Preflight -- netbird binary
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

# ---------------------------------------------------------------------------
# Build launcher command
# ---------------------------------------------------------------------------
launch_menu() {
    case "$LAUNCHER" in
        wofi)   wofi --dmenu --prompt "NetBird Networks" ;;
        rofi)   rofi -dmenu -p "NetBird Networks" ;;
        dmenu)  dmenu -p "NetBird Networks" ;;
        *)      $LAUNCHER ;;
    esac
}

# ---------------------------------------------------------------------------
# Fetch network list
# ---------------------------------------------------------------------------
NETWORK_OUTPUT=$(netbird networks list 2>/dev/null) || {
    notify "NetBird" "NetBird not connected"
    exit 1
}

# ---------------------------------------------------------------------------
# Parse text output into parallel arrays
#
# The format is:
#   - ID: <id>
#     Network: ... / Domains: ...
#     Status: Selected | Not Selected
# ---------------------------------------------------------------------------
declare -a NET_IDS=()
declare -a NET_SELECTED=()

CURRENT_ID=""
while IFS= read -r line; do
    # Match ID line
    if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*ID:[[:space:]]*(.+)$ ]]; then
        CURRENT_ID="${BASH_REMATCH[1]}"
        CURRENT_ID="${CURRENT_ID#"${CURRENT_ID%%[![:space:]]*}"}"   # trim leading
        CURRENT_ID="${CURRENT_ID%"${CURRENT_ID##*[![:space:]]}"}"   # trim trailing
    fi
    # Match Status line
    if [[ -n "$CURRENT_ID" && "$line" =~ ^[[:space:]]*Status:[[:space:]]*(.+)$ ]]; then
        STATUS="${BASH_REMATCH[1]}"
        STATUS="${STATUS#"${STATUS%%[![:space:]]*}"}"
        STATUS="${STATUS%"${STATUS##*[![:space:]]}"}"
        NET_IDS+=("$CURRENT_ID")
        if [[ "$STATUS" == "Selected" ]]; then
            NET_SELECTED+=("yes")
        else
            NET_SELECTED+=("no")
        fi
        CURRENT_ID=""
    fi
done <<< "$NETWORK_OUTPUT"

# ---------------------------------------------------------------------------
# Build menu entries
# ---------------------------------------------------------------------------
MENU=""
MENU+="[Select All]"$'\n'
MENU+="[Deselect All]"$'\n'

for i in "${!NET_IDS[@]}"; do
    if [[ "${NET_SELECTED[$i]}" == "yes" ]]; then
        MENU+="[✓] ${NET_IDS[$i]}"$'\n'
    else
        MENU+="[ ] ${NET_IDS[$i]}"$'\n'
    fi
done

# Remove trailing newline
MENU="${MENU%$'\n'}"

# ---------------------------------------------------------------------------
# Present menu and act on selection
# ---------------------------------------------------------------------------
CHOICE=$(echo "$MENU" | launch_menu) || exit 0

case "$CHOICE" in
    "[Select All]")
        netbird networks select all &>/dev/null
        notify "NetBird" "All networks selected"
        ;;
    "[Deselect All]")
        netbird networks deselect all &>/dev/null
        notify "NetBird" "All networks deselected"
        ;;
    *)
        # Extract the ID from "[✓] id" or "[ ] id"
        SELECTED_ID="${CHOICE#\[?\] }"
        # Trim whitespace
        SELECTED_ID="${SELECTED_ID#"${SELECTED_ID%%[![:space:]]*}"}"
        SELECTED_ID="${SELECTED_ID%"${SELECTED_ID##*[![:space:]]}"}"

        # Determine current state of this network
        IS_SELECTED="no"
        for i in "${!NET_IDS[@]}"; do
            if [[ "${NET_IDS[$i]}" == "$SELECTED_ID" ]]; then
                IS_SELECTED="${NET_SELECTED[$i]}"
                break
            fi
        done

        if [[ "$IS_SELECTED" == "yes" ]]; then
            netbird networks deselect "$SELECTED_ID" &>/dev/null
            notify "NetBird" "Deselected network: $SELECTED_ID"
        else
            netbird networks select -a "$SELECTED_ID" &>/dev/null
            notify "NetBird" "Selected network: $SELECTED_ID"
        fi
        ;;
esac
