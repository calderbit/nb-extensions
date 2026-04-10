#!/usr/bin/env bash
#
# netbird-profiles.sh - Interactive profile switcher for NetBird VPN
#
# Parses `netbird profile list` and presents a menu via wofi/rofi/dmenu.
# Allows switching profiles and deregistering (with confirmation).
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
    local prompt="${1:-NetBird Profiles}"
    case "$LAUNCHER" in
        wofi)   wofi --dmenu --prompt "$prompt" ;;
        rofi)   rofi -dmenu -p "$prompt" ;;
        dmenu)  dmenu -p "$prompt" ;;
        *)      $LAUNCHER ;;
    esac
}

# ---------------------------------------------------------------------------
# Get current profile from status
# ---------------------------------------------------------------------------
CURRENT_PROFILE=$(netbird status --json 2>/dev/null | jq -r '.profileName // "default"') || CURRENT_PROFILE="default"

# ---------------------------------------------------------------------------
# Fetch profile list
# ---------------------------------------------------------------------------
PROFILE_OUTPUT=$(netbird profile list 2>/dev/null) || {
    notify "NetBird" "Could not list profiles"
    exit 1
}

# Parse profile names from the output
# Expected format varies — extract lines that look like profile names
declare -a PROFILES=()
while IFS= read -r line; do
    # Skip empty lines and headers
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" ]] && continue
    [[ "$line" == "Available"* ]] && continue
    [[ "$line" == "Profiles:"* ]] && continue

    # Strip leading bullet/dash markers
    line="${line#- }"
    line="${line#* }"

    # Extract profile name (may have "(active)" or similar suffix)
    local_name="${line%% (*}"
    local_name="${local_name#"${local_name%%[![:space:]]*}"}"
    local_name="${local_name%"${local_name##*[![:space:]]}"}"

    [[ -n "$local_name" ]] && PROFILES+=("$local_name")
done <<< "$PROFILE_OUTPUT"

# If no profiles parsed, add at least the current one
if [[ ${#PROFILES[@]} -eq 0 ]]; then
    PROFILES+=("$CURRENT_PROFILE")
fi

# ---------------------------------------------------------------------------
# Build menu entries
# ---------------------------------------------------------------------------
MENU=""
for profile in "${PROFILES[@]}"; do
    if [[ "$profile" == "$CURRENT_PROFILE" ]]; then
        MENU+="● $profile (active)"$'\n'
    else
        MENU+="  $profile"$'\n'
    fi
done

MENU+="---"$'\n'
MENU+="⚠ Deregister"

# ---------------------------------------------------------------------------
# Present menu and act on selection
# ---------------------------------------------------------------------------
CHOICE=$(echo "$MENU" | launch_menu) || exit 0

# Trim whitespace
CHOICE="${CHOICE#"${CHOICE%%[![:space:]]*}"}"
CHOICE="${CHOICE%"${CHOICE##*[![:space:]]}"}"

case "$CHOICE" in
    "---")
        # Separator, do nothing
        ;;
    *"Deregister"*)
        # Confirmation prompt
        CONFIRM=$(printf "Yes, deregister\nNo, cancel" | launch_menu "Deregister this peer?") || exit 0
        if [[ "$CONFIRM" == "Yes, deregister" ]]; then
            netbird down &>/dev/null || true
            netbird deregister &>/dev/null || true
            notify "NetBird" "Peer deregistered"
        fi
        ;;
    *)
        # Extract profile name — strip the active marker
        SELECTED="${CHOICE#● }"
        SELECTED="${SELECTED#  }"
        SELECTED="${SELECTED% (active)}"
        SELECTED="${SELECTED#"${SELECTED%%[![:space:]]*}"}"
        SELECTED="${SELECTED%"${SELECTED##*[![:space:]]}"}"

        if [[ "$SELECTED" == "$CURRENT_PROFILE" ]]; then
            notify "NetBird" "Already on profile: $SELECTED"
        else
            netbird down &>/dev/null || true
            netbird profile select "$SELECTED" &>/dev/null
            netbird up &>/dev/null &
            notify "NetBird" "Switched to profile: $SELECTED"
        fi
        ;;
esac
