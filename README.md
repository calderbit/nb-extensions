# NetBird Desktop Extensions

Native desktop integrations for [NetBird](https://netbird.io/) — a WireGuard-based mesh VPN. Control NetBird from your desktop shell without opening a terminal.

Inspired by [tailscale-gnome-qs](https://github.com/tailscale-qs/tailscale-gnome-qs).

## Supported Platforms

| Platform | Type | Directory |
|----------|------|-----------|
| GNOME Shell 45+ | Quick Settings toggle | `gnome/` |
| Cinnamon | System tray applet | `cinnamon/` |
| Waybar | Custom module | `hyprland/waybar/` |
| HyprPanel | Custom module | `hyprland/hyprpanel/` |
| AGS (Astal) | TypeScript widget | `hyprland/ags/` |

## Features

- **Toggle** NetBird connection on/off
- **Status** display: IP, peer count, connection state
- **Network selection** via launcher (wofi/rofi/dmenu)
- **Profile** display
- **Notifications** for state changes (connect, login required)

## Prerequisites

- [NetBird](https://docs.netbird.io/how-to/installation) installed and configured
- `jq` for JSON parsing (shared scripts)
- Desktop-specific requirements noted in each component's README

## Quick Install

```bash
# Auto-detect your desktop and install
bash install.sh

# Or install for a specific platform
bash install.sh --waybar
bash install.sh --gnome
bash install.sh --cinnamon
bash install.sh --hyprpanel
bash install.sh --ags

# Uninstall
bash install.sh --uninstall
```

## Architecture

```
shared/                    # Shell scripts used by Waybar, HyprPanel, AGS
  netbird-status.sh        # Polls netbird status --json, outputs widget-ready JSON
  netbird-toggle.sh        # Toggles connection up/down with notifications
  netbird-networks.sh      # Network selector via wofi/rofi/dmenu

gnome/                     # GNOME Shell Quick Settings extension
cinnamon/                  # Cinnamon system tray applet
hyprland/                  # Wayland compositor integrations
  waybar/                  # Waybar custom module config + style
  hyprpanel/               # HyprPanel custom module config + style
  ags/                     # AGS/Astal TypeScript widget
```

The GNOME and Cinnamon extensions are self-contained — they call the NetBird CLI directly via GLib subprocess. The Hyprland-ecosystem integrations (Waybar, HyprPanel, AGS) share the shell scripts in `shared/`.

## License

BSD 3-Clause — see [LICENSE](LICENSE).
