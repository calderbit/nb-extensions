// Example: integrating the NetBird widget into an AGS v2 bar.
//
// Copy `service/` and `widget/` into your AGS config directory, then
// import the component wherever you build your bar layout.

import { NetBirdButton, NetBirdPopup } from "./widget/NetBird";

// In your bar widget, add the button to the desired section:
//
//   <box className="bar-right">
//       <NetBirdButton />
//   </box>
//
// To show the popup (e.g. in a RevealerWindow triggered by the button),
// render <NetBirdPopup /> inside your popup container.
