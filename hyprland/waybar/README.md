# NetBird Waybar Module

Custom Waybar module for NetBird VPN status and control.

## Prerequisites

- [Waybar](https://github.com/Alexays/Waybar)
- [NetBird](https://netbird.io/) client installed
- `jq` for JSON processing
- `wofi`, `rofi`, or `dmenu` for network selection menu

## Installation

1. **Install shared scripts** (choose one):

   ```bash
   # Via the installer:
   bash install.sh --waybar

   # Or manually:
   mkdir -p ~/.config/netbird-widget
   cp shared/netbird-status.sh shared/netbird-toggle.sh shared/netbird-networks.sh ~/.config/netbird-widget/
   chmod +x ~/.config/netbird-widget/*.sh
   ```

2. **Merge module config** into `~/.config/waybar/config.jsonc`:

   Copy the contents of `config.jsonc` into your Waybar config file, adding the `"custom/netbird"` object alongside your other modules.

3. **Add styles** to `~/.config/waybar/style.css`:

   ```css
   @import url("path/to/style.css");
   ```

   Or copy the contents of `style.css` directly into your Waybar stylesheet.

4. **Add the module** to your modules array in the Waybar config:

   ```jsonc
   "modules-right": ["custom/netbird", ...]
   ```

5. **Restart Waybar**:

   ```bash
   killall waybar && waybar &
   ```

## Usage

| Action      | Behavior                        |
|-------------|---------------------------------|
| Left-click  | Toggle VPN connection on/off    |
| Right-click | Open network selector menu      |
| Hover       | Show tooltip with connection details |

## Screenshot

<!-- Add a screenshot of the module in action -->
