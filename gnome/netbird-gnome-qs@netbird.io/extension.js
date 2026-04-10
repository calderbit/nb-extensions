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

    /**
     * Parse the text output of `netbird networks list` into an array of
     * {id, selected, name} objects.
     *
     * Expected format:
     *   Available Networks:
     *     - ID: route1
     *       Network: 10.0.0.0/24
     *       Domains: example.com    (optional — may be absent)
     *       Status: Selected
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
                    // Use as fallback name; may be overridden by Domains.
                    current.name = line.replace('Network:', '').trim();
                } else if (line.startsWith('Domains:')) {
                    // Prefer Domains over Network for the display name.
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

        // ---- Profile item (informational, insensitive) ---------------------
        this._profileItem = new PopupMenu.PopupMenuItem('Profile: --', {
            reactive: false,
            style_class: 'netbird-status-label',
        });
        this.menu.addMenuItem(this._profileItem);

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
            this._profileItem.label.text = 'Profile: --';
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

        this._profileItem.label.text =
            `Profile: ${status.profileName ?? '--'}`;

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
