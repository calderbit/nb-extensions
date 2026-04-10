# NetBird HyprPanel Module

A custom HyprPanel bar module that displays NetBird VPN connection status, peer counts, and provides quick toggle and network-selection actions.

## Prerequisites

- [HyprPanel](https://hyprpanel.com)
- [NetBird](https://netbird.io) client installed and configured
- `jq`
- One of: `wofi`, `rofi`, or `dmenu` (for the network selector)

## Installation

1. **Install the shared scripts** to `~/.config/netbird-widget/`:

   ```sh
   mkdir -p ~/.config/netbird-widget
   cp shared/netbird-status.sh  ~/.config/netbird-widget/
   cp shared/netbird-toggle.sh  ~/.config/netbird-widget/
   cp shared/netbird-networks.sh ~/.config/netbird-widget/
   chmod +x ~/.config/netbird-widget/*.sh
   ```

2. **Merge the module definition** from `modules.json` into your HyprPanel configuration. The key to add is `bar.customModules.netbird`. You can merge it manually or with `jq`:

   ```sh
   # Example: merge into HyprPanel's options.json
   jq -s '.[0] * .[1]' \
     ~/.config/hyprpanel/options.json \
     modules.json > /tmp/hp-merged.json \
     && mv /tmp/hp-merged.json ~/.config/hyprpanel/options.json
   ```

3. **Add the styles** by appending `style.scss` to your HyprPanel user stylesheet:

   ```sh
   cat style.scss >> ~/.config/hyprpanel/style.scss
   ```

4. **Add the module to your bar** by including `custom/netbird` in your HyprPanel bar module list (e.g. under `bar.layouts`).

5. Restart HyprPanel to apply changes.

## Usage

- **Left-click** the module to toggle NetBird on/off.
- **Right-click** to open the interactive network selector.
- The icon and color change to reflect the current state: connected, disconnected, needs login, connecting, or error.
