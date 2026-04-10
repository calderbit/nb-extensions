#!/usr/bin/env bash
#
# netbird-status.sh - Widget-ready status output for NetBird VPN
#
# Usage: netbird-status.sh [waybar|hyprpanel|raw]
#
# Wraps `netbird status --json` and emits structured JSON suitable
# for Waybar, HyprPanel, or raw passthrough consumption.

set -euo pipefail

FORMAT="${1:-waybar}"

# ---------------------------------------------------------------------------
# Error fallback -- emits a safe JSON blob every consumer can handle
# ---------------------------------------------------------------------------
error_json() {
    if command -v jq &>/dev/null; then
        jq -cn \
            --arg text "N/A" \
            --arg tooltip "NetBird: Error" \
            --arg class "error" \
            --arg alt "error" \
            --argjson percentage 0 \
            '{text: $text, tooltip: $tooltip, class: $class, alt: $alt, percentage: $percentage}'
    else
        echo '{"text":"N/A","tooltip":"NetBird: Error","class":"error","alt":"error","percentage":0}'
    fi
    exit 0
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
if ! command -v netbird &>/dev/null; then
    error_json
fi

if ! command -v jq &>/dev/null; then
    error_json
fi

# ---------------------------------------------------------------------------
# Capture raw status
# ---------------------------------------------------------------------------
RAW_JSON=$(netbird status --json 2>/dev/null) || error_json

# Quick sanity -- make sure we got valid JSON
echo "$RAW_JSON" | jq empty 2>/dev/null || error_json

# ---------------------------------------------------------------------------
# Raw mode -- passthrough
# ---------------------------------------------------------------------------
if [[ "$FORMAT" == "raw" ]]; then
    echo "$RAW_JSON"
    exit 0
fi

# ---------------------------------------------------------------------------
# Parse fields once
# ---------------------------------------------------------------------------
DAEMON_STATUS=$(echo "$RAW_JSON"  | jq -r '.daemonStatus // empty')
PEERS_CONNECTED=$(echo "$RAW_JSON" | jq -r '.peers.connected // 0')
PEERS_TOTAL=$(echo "$RAW_JSON"    | jq -r '.peers.total // 0')
NETBIRD_IP=$(echo "$RAW_JSON"     | jq -r '.netbirdIp // ""')
FQDN=$(echo "$RAW_JSON"           | jq -r '.fqdn // ""')
RELAYS_AVAILABLE=$(echo "$RAW_JSON" | jq -r '.relays.available // 0')
RELAYS_TOTAL=$(echo "$RAW_JSON"   | jq -r '.relays.total // 0')
PROFILE=$(echo "$RAW_JSON"        | jq -r '.profileName // ""')
VERSION=$(echo "$RAW_JSON"        | jq -r '.daemonVersion // .cliVersion // ""')

# ---------------------------------------------------------------------------
# State mapping
# ---------------------------------------------------------------------------
case "$DAEMON_STATUS" in
    Connected)
        CLASS="connected"
        ALT="connected"
        ;;
    NeedsLogin|LoginFailed|SessionExpired)
        CLASS="needslogin"
        ALT="needslogin"
        ;;
    Connecting)
        CLASS="connecting"
        ALT="connecting"
        ;;
    *)
        CLASS="disconnected"
        ALT="disconnected"
        ;;
esac

# ---------------------------------------------------------------------------
# Derived values
# ---------------------------------------------------------------------------
# Text label
case "$ALT" in
    connected)    TEXT="${PEERS_CONNECTED}/${PEERS_TOTAL}" ;;
    needslogin)   TEXT="Login" ;;
    *)            TEXT="Off" ;;
esac

# Percentage (peers connected / total * 100, 0 when not connected or total=0)
if [[ "$ALT" == "connected" && "$PEERS_TOTAL" -gt 0 ]] 2>/dev/null; then
    PERCENTAGE=$(( PEERS_CONNECTED * 100 / PEERS_TOTAL ))
else
    PERCENTAGE=0
fi

# ---------------------------------------------------------------------------
# Build tooltip
# ---------------------------------------------------------------------------
TOOLTIP="NetBird VPN"
TOOLTIP="${TOOLTIP}\nStatus: ${DAEMON_STATUS}"
TOOLTIP="${TOOLTIP}\nIP: ${NETBIRD_IP}"
TOOLTIP="${TOOLTIP}\nFQDN: ${FQDN}"
TOOLTIP="${TOOLTIP}\nPeers: ${PEERS_CONNECTED}/${PEERS_TOTAL} connected"
TOOLTIP="${TOOLTIP}\nRelays: ${RELAYS_AVAILABLE}/${RELAYS_TOTAL} available"
TOOLTIP="${TOOLTIP}\nProfile: ${PROFILE}"
TOOLTIP="${TOOLTIP}\nVersion: ${VERSION}"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
case "$FORMAT" in
    hyprpanel)
        jq -cn \
            --arg alt "$ALT" \
            --argjson percentage "$PERCENTAGE" \
            --arg status "$DAEMON_STATUS" \
            --arg ip "$NETBIRD_IP" \
            --argjson peers_connected "$PEERS_CONNECTED" \
            --argjson peers_total "$PEERS_TOTAL" \
            '{
                alt: $alt,
                percentage: $percentage,
                status: $status,
                ip: $ip,
                peers: { connected: $peers_connected, total: $peers_total }
            }'
        ;;
    waybar|*)
        jq -cn \
            --arg text "$TEXT" \
            --arg tooltip "$TOOLTIP" \
            --arg class "$CLASS" \
            --arg alt "$ALT" \
            --argjson percentage "$PERCENTAGE" \
            '{text: $text, tooltip: $tooltip, class: $class, alt: $alt, percentage: $percentage}'
        ;;
esac
