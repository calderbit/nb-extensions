// NetBird VPN widgets for AGS v2 (Astal)
//
// NetBirdButton — compact bar indicator with click-to-toggle.
// NetBirdPopup  — expanded details panel (IP, peers, relays, profile,
//                 settings toggles, profiles, debug bundle, deregister).

import { bind } from "astal";
import { Gtk, Gdk } from "astal/gtk3";
import {
    netbirdStatus,
    stateClass,
    peerCount,
    toggle,
    isConnected,
    sshEnabled,
    quantumResistance,
    lazyConnections,
    toggleSSH,
    toggleQuantumResistance,
    toggleLazyConnections,
    createDebugBundle,
    deregister,
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
            {/* Header */}
            <box className="netbird-header">
                <icon icon="network-vpn-symbolic" />
                <label label="NetBird VPN" className="netbird-title" />
                <switch
                    active={bind(isConnected)}
                    onActivate={toggle}
                />
            </box>

            {/* Status details */}
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

            {/* Settings */}
            <box className="netbird-settings" vertical>
                <label label="Settings" className="netbird-section-header" />
                <box className="netbird-setting-row">
                    <label label="Allow SSH" hexpand halign={Gtk.Align.START} />
                    <switch
                        active={bind(sshEnabled)}
                        onActivate={toggleSSH}
                    />
                </box>
                <box className="netbird-setting-row">
                    <label label="Quantum Resistance" hexpand halign={Gtk.Align.START} />
                    <switch
                        active={bind(quantumResistance)}
                        onActivate={toggleQuantumResistance}
                    />
                </box>
                <box className="netbird-setting-row">
                    <label label="Lazy Connections" hexpand halign={Gtk.Align.START} />
                    <switch
                        active={bind(lazyConnections)}
                        onActivate={toggleLazyConnections}
                    />
                </box>
            </box>

            {/* Actions */}
            <box className="netbird-actions" vertical>
                <button
                    className="netbird-action-button"
                    onClicked={() => {
                        createDebugBundle().catch(e =>
                            console.error(`[NetBird] debug bundle failed: ${e}`)
                        );
                    }}
                >
                    <label label="Create Debug Bundle" />
                </button>
                <button
                    className="netbird-action-button netbird-destructive"
                    onClicked={() => {
                        deregister().catch(e =>
                            console.error(`[NetBird] deregister failed: ${e}`)
                        );
                    }}
                >
                    <label label="Deregister" />
                </button>
            </box>
        </box>
    );
}
