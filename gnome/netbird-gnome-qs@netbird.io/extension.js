import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// ---------------------------------------------------------------------------
// NetBirdClient — plain class, all subprocess work is async / Promise-based
// ---------------------------------------------------------------------------

class NetBirdClient {
    /**
     * Run an argv command asynchronously via Gio.Subprocess.
     * Returns the trimmed stdout string on success.
     */
    _runCommand(argv) {
        return new Promise((resolve, reject) => {
            let proc;
            try {
                proc = Gio.Subprocess.new(
                    argv,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
            } catch (e) {
                reject(new Error(`Failed to spawn ${argv[0]}: ${e.message}`));
                return;
            }

            proc.communicate_utf8_async(null, null, (source, res) => {
                try {
                    const [ok, stdout, stderr] = source.communicate_utf8_finish(res);
                    if (source.get_successful()) {
                        resolve((stdout ?? '').trim());
                    } else {
                        reject(new Error(
                            `Command ${argv.join(' ')} failed: ${(stderr ?? '').trim()}`
                        ));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /** Fetch the full NetBird status object. */
    async getStatus() {
        const out = await this._runCommand(['netbird', 'status', '--json']);
        return JSON.parse(out);
    }

    /** Bring the tunnel up. */
    async connect() {
        await this._runCommand(['netbird', 'up']);
    }

    /** Bring the tunnel down. */
    async disconnect() {
        await this._runCommand(['netbird', 'down']);
    }

    /** Reconnect with a specific flag set to a value. */
    async setFlag(flag, value) {
        await this._runCommand(['netbird', 'up', `--${flag}=${value}`]);
    }

    /**
     * Parse the text output of `netbird networks list` into an array of
     * {id, selected, name} objects.
     */
    async getNetworks() {
        let out;
        try {
            out = await this._runCommand(['netbird', 'networks', 'list']);
        } catch (_e) {
            return [];
        }

        const networks = [];
        const lines = out.split('\n');
        let current = null;

        for (const raw of lines) {
            const line = raw.trim();

            if (line.startsWith('- ID:')) {
                if (current) networks.push(current);
                current = {
                    id: line.replace('- ID:', '').trim(),
                    selected: false,
                    name: '',
                };
            } else if (current) {
                if (line.startsWith('Network:')) {
                    current.name = line.replace('Network:', '').trim();
                } else if (line.startsWith('Domains:')) {
                    const domains = line.replace('Domains:', '').trim();
                    if (domains) current.name = domains;
                } else if (line.startsWith('Status:')) {
                    current.selected =
                        line.replace('Status:', '').trim().toLowerCase() === 'selected';
                }
            }
        }
        if (current) networks.push(current);

        return networks;
    }

    /** Select a network by ID. */
    async selectNetwork(id) {
        await this._runCommand(['netbird', 'networks', 'select', '-a', id]);
    }

    /** Deselect a network by ID. */
    async deselectNetwork(id) {
        await this._runCommand(['netbird', 'networks', 'deselect', id]);
    }

    /**
     * Parse `netbird profile list` into an array of {name, active} objects.
     */
    async getProfiles() {
        let out;
        try {
            out = await this._runCommand(['netbird', 'profile', 'list']);
        } catch (_e) {
            return [];
        }

        const profiles = [];
        for (const raw of out.split('\n')) {
            const line = raw.trim();
            if (!line || line.startsWith('Available') || line.startsWith('Profiles'))
                continue;

            const cleaned = line.replace(/^[-*]\s*/, '');
            const active = cleaned.includes('(active)') || cleaned.includes('(selected)');
            const name = cleaned
                .replace(/\(active\)/g, '')
                .replace(/\(selected\)/g, '')
                .trim();
            if (name) profiles.push({ name, active });
        }
        return profiles;
    }

    /** Switch to a different profile. */
    async selectProfile(name) {
        await this._runCommand(['netbird', 'profile', 'select', name]);
    }

    /** Deregister this peer from the management service. */
    async deregister() {
        try { await this._runCommand(['netbird', 'down']); } catch (_e) { /* ignore */ }
        await this._runCommand(['netbird', 'deregister']);
    }

    /** Create a debug bundle and return the output. */
    async createDebugBundle() {
        return await this._runCommand(['netbird', 'debug', 'bundle']);
    }
}

// ---------------------------------------------------------------------------
// NetBirdToggle — the quick-settings menu toggle
// ---------------------------------------------------------------------------

const NetBirdToggle = GObject.registerClass(
class NetBirdToggle extends QuickSettings.QuickMenuToggle {
    _init(client) {
        super._init({
            title: 'NetBird',
            iconName: 'network-vpn-symbolic',
            toggleMode: true,
        });

        this._client = client;
        this.add_style_class_name('netbird-toggle');

        // ---- Status section ------------------------------------------------
        this._statusSection = new PopupMenu.PopupMenuSection();

        this._ipLabel = new PopupMenu.PopupMenuItem('IP: --', {
            reactive: false,
            style_class: 'netbird-status-label',
        });
        this._fqdnLabel = new PopupMenu.PopupMenuItem('FQDN: --', {
            reactive: false,
            style_class: 'netbird-status-label',
        });
        this._peersLabel = new PopupMenu.PopupMenuItem('Peers: --', {
            reactive: false,
            style_class: 'netbird-status-label',
        });

        this._statusSection.addMenuItem(this._ipLabel);
        this._statusSection.addMenuItem(this._fqdnLabel);
        this._statusSection.addMenuItem(this._peersLabel);
        this.menu.addMenuItem(this._statusSection);

        // ---- Separator -----------------------------------------------------
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Networks section ----------------------------------------------
        this._networksSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._networksSection);

        // ---- Separator -----------------------------------------------------
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Settings section ----------------------------------------------
        this._settingsHeader = new PopupMenu.PopupMenuItem('Settings', {
            reactive: false,
            style_class: 'netbird-section-header',
        });
        this.menu.addMenuItem(this._settingsHeader);

        this._sshToggle = new PopupMenu.PopupSwitchMenuItem('Allow SSH', false);
        this._sshToggle.connect('toggled', (_item, state) => {
            this._client.setFlag('allow-server-ssh', state).catch(e =>
                console.error(`[NetBird] set SSH failed: ${e.message}`)
            );
        });
        this.menu.addMenuItem(this._sshToggle);

        this._quantumToggle = new PopupMenu.PopupSwitchMenuItem('Quantum Resistance', false);
        this._quantumToggle.connect('toggled', (_item, state) => {
            this._client.setFlag('enable-rosenpass', state).catch(e =>
                console.error(`[NetBird] set quantum failed: ${e.message}`)
            );
        });
        this.menu.addMenuItem(this._quantumToggle);

        this._lazyToggle = new PopupMenu.PopupSwitchMenuItem('Lazy Connections', false);
        this._lazyToggle.connect('toggled', (_item, state) => {
            this._client.setFlag('enable-lazy-connection', state).catch(e =>
                console.error(`[NetBird] set lazy failed: ${e.message}`)
            );
        });
        this.menu.addMenuItem(this._lazyToggle);

        // ---- Debug bundle --------------------------------------------------
        this._debugBundleItem = new PopupMenu.PopupMenuItem('Create Debug Bundle');
        this._debugBundleItem.connect('activate', () => {
            this._client.createDebugBundle().then(out => {
                Main.notify('NetBird', `Debug bundle created\n${out}`);
            }).catch(e => {
                Main.notify('NetBird', `Debug bundle failed: ${e.message}`);
            });
        });
        this.menu.addMenuItem(this._debugBundleItem);

        // ---- Separator -----------------------------------------------------
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Profiles section ----------------------------------------------
        this._profilesHeader = new PopupMenu.PopupMenuItem('Profiles', {
            reactive: false,
            style_class: 'netbird-section-header',
        });
        this.menu.addMenuItem(this._profilesHeader);

        this._profilesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._profilesSection);

        // ---- Deregister ----------------------------------------------------
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._deregisterItem = new PopupMenu.PopupMenuItem('Deregister');
        this._deregisterItem.add_style_class_name('netbird-destructive');
        this._deregisterItem.connect('activate', () => {
            this._client.deregister().then(() => {
                Main.notify('NetBird', 'Peer deregistered');
            }).catch(e => {
                Main.notify('NetBird', `Deregister failed: ${e.message}`);
            });
        });
        this.menu.addMenuItem(this._deregisterItem);

        // ---- Toggle handler ------------------------------------------------
        this.connect('clicked', () => {
            if (this.checked) {
                this._client.connect().catch(e =>
                    console.error(`[NetBird] connect failed: ${e.message}`)
                );
            } else {
                this._client.disconnect().catch(e =>
                    console.error(`[NetBird] disconnect failed: ${e.message}`)
                );
            }
        });
    }

    // -- Public helpers called by the indicator during refresh ----------------

    _updateStatus(status) {
        if (!status) {
            this.checked = false;
            this.subtitle = 'Unavailable';
            this._ipLabel.label.text = 'IP: --';
            this._fqdnLabel.label.text = 'FQDN: --';
            this._peersLabel.label.text = 'Peers: --';
            this._sshToggle.setToggleState(false);
            this._quantumToggle.setToggleState(false);
            this._lazyToggle.setToggleState(false);
            this._setStateClass('disconnected');
            return;
        }

        const daemon = status.daemonStatus ?? '';

        // Toggle state
        this.checked = daemon === 'Connected';

        // Subtitle
        switch (daemon) {
            case 'Connected':
                this.subtitle = 'Connected';
                break;
            case 'NeedsLogin':
            case 'LoginFailed':
            case 'SessionExpired':
                this.subtitle = 'Login Required';
                break;
            case 'Connecting':
                this.subtitle = 'Connecting\u2026';
                break;
            default:
                this.subtitle = 'Disconnected';
                break;
        }

        // Status labels
        this._ipLabel.label.text = `IP: ${status.netbirdIp ?? '--'}`;
        this._fqdnLabel.label.text = `FQDN: ${status.fqdn ?? '--'}`;

        const peers = status.peers ?? {};
        this._peersLabel.label.text =
            `Peers: ${peers.connected ?? 0} / ${peers.total ?? 0} connected`;

        // Settings toggles (update without re-triggering the toggled signal)
        const ssh = status.sshServer?.enabled ?? false;
        if (this._sshToggle.state !== ssh)
            this._sshToggle.setToggleState(ssh);

        const quantum = status.quantumResistance ?? false;
        if (this._quantumToggle.state !== quantum)
            this._quantumToggle.setToggleState(quantum);

        const lazy = status.lazyConnectionEnabled ?? false;
        if (this._lazyToggle.state !== lazy)
            this._lazyToggle.setToggleState(lazy);

        // CSS state class
        if (daemon === 'Connected') {
            this._setStateClass('connected');
        } else if (['NeedsLogin', 'LoginFailed', 'SessionExpired'].includes(daemon)) {
            this._setStateClass('needslogin');
        } else {
            this._setStateClass('disconnected');
        }
    }

    _setStateClass(cls) {
        for (const c of ['connected', 'disconnected', 'needslogin'])
            this.remove_style_class_name(c);
        this.add_style_class_name(cls);
    }

    _updateNetworks(networks) {
        this._networksSection.removeAll();

        if (!networks || networks.length === 0) return;

        for (const net of networks) {
            const item = new PopupMenu.PopupSwitchMenuItem(
                net.name || net.id,
                net.selected
            );
            item.connect('toggled', (_item, state) => {
                if (state) {
                    this._client.selectNetwork(net.id).catch(e =>
                        console.error(`[NetBird] select network failed: ${e.message}`)
                    );
                } else {
                    this._client.deselectNetwork(net.id).catch(e =>
                        console.error(`[NetBird] deselect network failed: ${e.message}`)
                    );
                }
            });
            this._networksSection.addMenuItem(item);
        }
    }

    _updateProfiles(profiles, currentProfile) {
        this._profilesSection.removeAll();

        if (!profiles || profiles.length === 0) {
            const item = new PopupMenu.PopupMenuItem(
                `Profile: ${currentProfile ?? '--'}`,
                { reactive: false }
            );
            this._profilesSection.addMenuItem(item);
            return;
        }

        for (const prof of profiles) {
            const isActive = prof.active || prof.name === currentProfile;
            const label = isActive ? `● ${prof.name}` : `  ${prof.name}`;
            const item = new PopupMenu.PopupMenuItem(label);
            if (isActive) {
                item.setSensitive(false);
            } else {
                item.connect('activate', () => {
                    this._client.disconnect().then(() =>
                        this._client.selectProfile(prof.name)
                    ).then(() =>
                        this._client.connect()
                    ).then(() => {
                        Main.notify('NetBird', `Switched to profile: ${prof.name}`);
                    }).catch(e => {
                        console.error(`[NetBird] switch profile failed: ${e.message}`);
                    });
                });
            }
            this._profilesSection.addMenuItem(item);
        }
    }
});

// ---------------------------------------------------------------------------
// NetBirdIndicator — the panel system indicator that owns the toggle
// ---------------------------------------------------------------------------

const NetBirdIndicator = GObject.registerClass(
class NetBirdIndicator extends QuickSettings.SystemIndicator {
    _init() {
        super._init();

        // Panel icon
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'network-vpn-symbolic';
        this._indicator.visible = false;

        // Client & toggle
        this._client = new NetBirdClient();
        this._toggle = new NetBirdToggle(this._client);
        this.quickSettingsItems.push(this._toggle);

        // Kick off first refresh immediately
        this._refresh();

        // Start polling every 5 seconds
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    async _refresh() {
        let status = null;
        try {
            status = await this._client.getStatus();
        } catch (_e) {
            // netbird not installed or daemon not running — treat as offline
        }

        try {
            this._toggle._updateStatus(status);
        } catch (e) {
            console.error(`[NetBird] _updateStatus error: ${e.message}`);
        }

        // Show panel icon only when connected
        this._indicator.visible =
            status !== null && status.daemonStatus === 'Connected';

        // Refresh networks list
        try {
            const networks = await this._client.getNetworks();
            this._toggle._updateNetworks(networks);
        } catch (e) {
            console.error(`[NetBird] _updateNetworks error: ${e.message}`);
        }

        // Refresh profiles list
        try {
            const profiles = await this._client.getProfiles();
            this._toggle._updateProfiles(profiles, status?.profileName);
        } catch (e) {
            console.error(`[NetBird] _updateProfiles error: ${e.message}`);
        }
    }

    destroy() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = null;
        }
        this._toggle?.destroy();
        super.destroy();
    }
});

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default class NetBirdExtension extends Extension {
    enable() {
        this._indicator = new NetBirdIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
