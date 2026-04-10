// NetBird VPN widgets for AGS v2 (Astal)
//
// NetBirdButton — compact bar indicator with click-to-toggle.
// NetBirdPopup  — expanded details panel (IP, peers, relays, profile).

import { bind } from "astal";
import { Gtk, Gdk } from "astal/gtk3";
import {
    netbirdStatus,
    stateClass,
    peerCount,
    toggle,
    isConnected,
} from "../service/netbird";

// ---------------------------------------------------------------------------
// Bar button
// ---------------------------------------------------------------------------

export function NetBirdButton() {
    return (
        <button
            className={bind(stateClass).as(s => `netbird-button ${s}`)}
            onClicked={toggle}
            tooltipText={bind(netbirdStatus).as(s => {
                if (!s) return "NetBird: Unavailable";
                return [
                    `NetBird: ${s.daemonStatus}`,
                    `IP: ${s.netbirdIp}`,
                    `Peers: ${s.peers.connected}/${s.peers.total}`,
                ].join("\n");
            })}
        >
            <label label={bind(peerCount)} />
        </button>
    );
}

// ---------------------------------------------------------------------------
// Popup / expanded panel
// ---------------------------------------------------------------------------

export function NetBirdPopup() {
    return (
        <box className="netbird-popup" vertical>
            <box className="netbird-header">
                <icon icon="network-vpn-symbolic" />
                <label label="NetBird VPN" className="netbird-title" />
                <switch
                    active={bind(isConnected)}
                    onActivate={toggle}
                />
            </box>
            <box className="netbird-details" vertical>
                <label
                    label={bind(netbirdStatus).as(s =>
                        s ? `IP: ${s.netbirdIp}` : "IP: --"
                    )}
                />
                <label
                    label={bind(netbirdStatus).as(s =>
                        s ? `FQDN: ${s.fqdn}` : "FQDN: --"
                    )}
                />
                <label
                    label={bind(netbirdStatus).as(s =>
                        s ? `Peers: ${s.peers.connected}/${s.peers.total}` : "Peers: --"
                    )}
                />
                <label
                    label={bind(netbirdStatus).as(s =>
                        s ? `Relays: ${s.relays.available}/${s.relays.total}` : "Relays: --"
                    )}
                />
                <label
                    label={bind(netbirdStatus).as(s =>
                        s ? `Profile: ${s.profileName}` : "Profile: --"
                    )}
                />
            </box>
        </box>
    );
}
