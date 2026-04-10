// NetBird VPN service for AGS v2 (Astal)
//
// Provides reactive state variables and action functions for the NetBird
// bar widget and popup. Polls `netbird status --json` every 5 seconds.

import { Variable, bind } from "astal";
import { execAsync } from "astal/process";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PeerDetail {
    fqdn: string;
    netbirdIp: string;
    status: string;
    connectionType: string;
    latency: number;
}

export interface NetBirdStatus {
    peers: {
        total: number;
        connected: number;
        details: PeerDetail[];
    };
    daemonStatus: string;
    relays: {
        total: number;
        available: number;
    };
    netbirdIp: string;
    fqdn: string;
    networks: string[];
    profileName: string;
    daemonVersion: string;
    quantumResistance: boolean;
    quantumResistancePermissive: boolean;
    lazyConnectionEnabled: boolean;
    sshServer: {
        enabled: boolean;
        sessions: unknown[];
    };
}

export interface NetworkEntry {
    id: string;
    selected: boolean;
    name: string;
}

export interface ProfileEntry {
    name: string;
    active: boolean;
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

/** Polled NetBird status (null when the daemon is unreachable). */
export const netbirdStatus = Variable<NetBirdStatus | null>(null).poll(
    5000,
    ["netbird", "status", "--json"],
    (out: string) => {
        try {
            return JSON.parse(out) as NetBirdStatus;
        } catch {
            return null;
        }
    },
);

// ---------------------------------------------------------------------------
// Derived variables
// ---------------------------------------------------------------------------

/** Whether the daemon reports "Connected". */
export const isConnected = Variable.derive(
    [bind(netbirdStatus)],
    (s: NetBirdStatus | null) => s?.daemonStatus === "Connected",
);

/** CSS-friendly state class name. */
export const stateClass = Variable.derive(
    [bind(netbirdStatus)],
    (s: NetBirdStatus | null): string => {
        if (!s) return "error";
        switch (s.daemonStatus) {
            case "Connected":
                return "connected";
            case "NeedsLogin":
            case "LoginFailed":
            case "SessionExpired":
                return "needslogin";
            case "Connecting":
                return "connecting";
            default:
                return "disconnected";
        }
    },
);

/** Short text label for the bar: "2/3", "Off", or "Login". */
export const peerCount = Variable.derive(
    [bind(netbirdStatus)],
    (s: NetBirdStatus | null): string => {
        if (!s) return "Off";
        switch (s.daemonStatus) {
            case "Connected":
                return `${s.peers.connected}/${s.peers.total}`;
            case "NeedsLogin":
            case "LoginFailed":
            case "SessionExpired":
                return "Login";
            default:
                return "Off";
        }
    },
);

/** Whether SSH server is enabled. */
export const sshEnabled = Variable.derive(
    [bind(netbirdStatus)],
    (s: NetBirdStatus | null) => s?.sshServer?.enabled ?? false,
);

/** Whether quantum resistance (Rosenpass) is enabled. */
export const quantumResistance = Variable.derive(
    [bind(netbirdStatus)],
    (s: NetBirdStatus | null) => s?.quantumResistance ?? false,
);

/** Whether lazy connections are enabled. */
export const lazyConnections = Variable.derive(
    [bind(netbirdStatus)],
    (s: NetBirdStatus | null) => s?.lazyConnectionEnabled ?? false,
);

// ---------------------------------------------------------------------------
// Actions — connection
// ---------------------------------------------------------------------------

/** Toggle: disconnect if connected, connect otherwise. */
export async function toggle(): Promise<void> {
    const s = netbirdStatus.get();
    if (s?.daemonStatus === "Connected") {
        await execAsync(["netbird", "down"]);
    } else {
        await execAsync(["netbird", "up"]);
    }
}

/** Explicitly bring the tunnel up. */
export async function connect(): Promise<void> {
    await execAsync(["netbird", "up"]);
}

/** Explicitly bring the tunnel down. */
export async function disconnect(): Promise<void> {
    await execAsync(["netbird", "down"]);
}

// ---------------------------------------------------------------------------
// Actions — settings
// ---------------------------------------------------------------------------

/** Set a netbird up flag to a boolean value. */
export async function setFlag(flag: string, value: boolean): Promise<void> {
    await execAsync(["netbird", "up", `--${flag}=${value}`]);
}

/** Toggle SSH server. */
export async function toggleSSH(): Promise<void> {
    const current = netbirdStatus.get()?.sshServer?.enabled ?? false;
    await setFlag("allow-server-ssh", !current);
}

/** Toggle quantum resistance (Rosenpass). */
export async function toggleQuantumResistance(): Promise<void> {
    const current = netbirdStatus.get()?.quantumResistance ?? false;
    await setFlag("enable-rosenpass", !current);
}

/** Toggle lazy connections. */
export async function toggleLazyConnections(): Promise<void> {
    const current = netbirdStatus.get()?.lazyConnectionEnabled ?? false;
    await setFlag("enable-lazy-connection", !current);
}

// ---------------------------------------------------------------------------
// Actions — networks
// ---------------------------------------------------------------------------

/**
 * Parse `netbird networks list` text output into a structured array.
 */
export async function getNetworks(): Promise<NetworkEntry[]> {
    const raw = await execAsync(["netbird", "networks", "list"]);
    const entries: NetworkEntry[] = [];
    let currentId = "";

    for (const line of raw.split("\n")) {
        const idMatch = line.match(/^\s*-\s*ID:\s*(.+)$/);
        if (idMatch) {
            currentId = idMatch[1].trim();
        }

        if (currentId) {
            const statusMatch = line.match(/^\s*Status:\s*(.+)$/);
            if (statusMatch) {
                entries.push({
                    id: currentId,
                    selected: statusMatch[1].trim() === "Selected",
                    name: currentId,
                });
                currentId = "";
            }
        }
    }

    return entries;
}

/** Select a network by ID. */
export async function selectNetwork(id: string): Promise<void> {
    await execAsync(["netbird", "networks", "select", "-a", id]);
}

/** Deselect a network by ID. */
export async function deselectNetwork(id: string): Promise<void> {
    await execAsync(["netbird", "networks", "deselect", id]);
}

// ---------------------------------------------------------------------------
// Actions — profiles
// ---------------------------------------------------------------------------

/** Parse `netbird profile list` into structured entries. */
export async function getProfiles(): Promise<ProfileEntry[]> {
    let raw: string;
    try {
        raw = await execAsync(["netbird", "profile", "list"]);
    } catch {
        return [];
    }

    const profiles: ProfileEntry[] = [];
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("Available") || trimmed.startsWith("Profiles"))
            continue;

        const cleaned = trimmed.replace(/^[-*]\s*/, "");
        const active = cleaned.includes("(active)") || cleaned.includes("(selected)");
        const name = cleaned
            .replace(/\(active\)/g, "")
            .replace(/\(selected\)/g, "")
            .trim();
        if (name) profiles.push({ name, active });
    }
    return profiles;
}

/** Switch to a different profile. */
export async function selectProfile(name: string): Promise<void> {
    await execAsync(["netbird", "down"]);
    await execAsync(["netbird", "profile", "select", name]);
    await execAsync(["netbird", "up"]);
}

// ---------------------------------------------------------------------------
// Actions — management
// ---------------------------------------------------------------------------

/** Deregister this peer from the management service. */
export async function deregister(): Promise<void> {
    try { await execAsync(["netbird", "down"]); } catch { /* ignore */ }
    await execAsync(["netbird", "deregister"]);
}

/** Create a debug bundle. Returns the command output. */
export async function createDebugBundle(): Promise<string> {
    return await execAsync(["netbird", "debug", "bundle"]);
}
