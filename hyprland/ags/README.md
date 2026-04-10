# NetBird AGS Widget

TypeScript widget for [AGS v2](https://aylur.github.io/astal/) (Astal) that displays NetBird VPN status in the bar and provides a detailed popup panel.

## Prerequisites

- AGS v2 with Astal
- TypeScript (bundled with AGS v2)
- NetBird installed and available in `$PATH`

## Installation

1. Copy `service/` and `widget/` into your AGS config directory (typically `~/.config/ags/`).
2. Import `style.scss` into your main stylesheet.
3. Import the widget into your bar layout.

## Usage

```tsx
import { NetBirdButton } from "./widget/NetBird";

// Add to your bar:
<NetBirdButton />
```

For the expanded popup panel:

```tsx
import { NetBirdPopup } from "./widget/NetBird";

// Render inside a popup container:
<NetBirdPopup />
```

## Files

| File | Purpose |
|------|---------|
| `service/netbird.ts` | Reactive service: polls status, exposes derived variables and actions |
| `widget/NetBird.tsx` | Bar button (`NetBirdButton`) and popup (`NetBirdPopup`) components |
| `style.scss` | SCSS styles with Catppuccin Mocha colors |
| `example-config.ts` | Minimal integration example |

## State Classes

The button and popup use CSS classes that reflect the daemon state:

- `connected` -- tunnel is up and peers are reachable
- `disconnected` -- tunnel is down
- `needslogin` -- browser login required
- `connecting` -- tunnel is being established (animated pulse)
- `error` -- daemon unreachable or status parse failure
