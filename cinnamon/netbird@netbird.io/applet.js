const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Lang = imports.lang;

const NETBIRD_BIN = "netbird";

function NetBirdApplet(metadata, orientation, panelHeight, instanceId) {
    this._init(metadata, orientation, panelHeight, instanceId);
}

NetBirdApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    _init: function(metadata, orientation, panelHeight, instanceId) {
        Applet.TextIconApplet.prototype._init.call(this, orientation, panelHeight, instanceId);

        this._metadata = metadata;
        this._timerId = null;
        this._connected = false;

        // Icon and tooltip
        this.set_applet_icon_symbolic_name("network-vpn-symbolic");
        this.set_applet_tooltip("NetBird VPN");

        // Settings
        this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
        this.settings.bind("pollInterval", "pollInterval", Lang.bind(this, this._onPollIntervalChanged));
        this.settings.bind("showPeerCount", "showPeerCount", Lang.bind(this, this._onShowPeerCountChanged));

        // Menu
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager.addMenu(this.menu);

        this._buildMenu();

        // Initial status fetch and start polling
        this._getStatus();
        this._startPolling();
    },

    // ---------------------------------------------------------------
    // Menu construction
    // ---------------------------------------------------------------

    _buildMenu: function() {
        // Toggle switch
        this._toggleItem = new PopupMenu.PopupSwitchMenuItem("NetBird VPN", false);
        this._toggleItem.connect("toggled", Lang.bind(this, this._onToggled));
        this.menu.addMenuItem(this._toggleItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Status section
        this._statusSection = new PopupMenu.PopupMenuSection();

        this._ipItem = new PopupMenu.PopupMenuItem("IP: --", { reactive: false });
        this._statusSection.addMenuItem(this._ipItem);

        this._fqdnItem = new PopupMenu.PopupMenuItem("FQDN: --", { reactive: false });
        this._statusSection.addMenuItem(this._fqdnItem);

        this._peersItem = new PopupMenu.PopupMenuItem("Peers: --", { reactive: false });
        this._statusSection.addMenuItem(this._peersItem);

        this._relaysItem = new PopupMenu.PopupMenuItem("Relays: --", { reactive: false });
        this._statusSection.addMenuItem(this._relaysItem);

        this.menu.addMenuItem(this._statusSection);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Networks header
        this._networksLabel = new PopupMenu.PopupMenuItem("Networks", { reactive: false });
        this.menu.addMenuItem(this._networksLabel);

        // Networks section (dynamic)
        this._networksSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._networksSection);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Profile
        this._profileItem = new PopupMenu.PopupMenuItem("Profile: --", { reactive: false });
        this.menu.addMenuItem(this._profileItem);
    },

    // ---------------------------------------------------------------
    // Subprocess helper
    // ---------------------------------------------------------------

    _runCommandAsync: function(argv, callback) {
        try {
            let proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            });
            proc.init(null);

            proc.communicate_utf8_async(null, null, Lang.bind(this, function(source, result) {
                try {
                    let [ok, stdout, stderr] = source.communicate_utf8_finish(result);
                    let exitStatus = source.get_exit_status();
                    if (callback) {
                        callback(stdout, stderr, exitStatus);
                    }
                } catch (e) {
                    global.logError("NetBird applet: command callback error: " + e.message);
                    if (callback) {
                        callback(null, e.message, -1);
                    }
                }
            }));
        } catch (e) {
            global.logError("NetBird applet: failed to run command: " + e.message);
            if (callback) {
                callback(null, e.message, -1);
            }
        }
    },

    // ---------------------------------------------------------------
    // NetBird CLI operations
    // ---------------------------------------------------------------

    _getStatus: function() {
        this._runCommandAsync([NETBIRD_BIN, "status", "--json"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            if (exitStatus !== 0 || !stdout) {
                this._updateUIDisconnected("NetBird unavailable");
                return;
            }

            try {
                let status = JSON.parse(stdout);
                this._updateUI(status);
            } catch (e) {
                global.logError("NetBird applet: failed to parse status JSON: " + e.message);
                this._updateUIDisconnected("Parse error");
            }
        }));

        // Also fetch networks
        this._getNetworks();
    },

    _connect: function() {
        this._toggleItem.setSensitive(false);
        this.set_applet_tooltip("NetBird VPN - Connecting...");

        this._runCommandAsync([NETBIRD_BIN, "up"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._toggleItem.setSensitive(true);
            // Refresh status after connect attempt
            this._getStatus();
        }));
    },

    _disconnect: function() {
        this._toggleItem.setSensitive(false);
        this.set_applet_tooltip("NetBird VPN - Disconnecting...");

        this._runCommandAsync([NETBIRD_BIN, "down"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._toggleItem.setSensitive(true);
            // Refresh status after disconnect attempt
            this._getStatus();
        }));
    },

    _getNetworks: function() {
        this._runCommandAsync([NETBIRD_BIN, "networks", "list"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._updateNetworks(stdout, exitStatus);
        }));
    },

    _selectNetwork: function(id) {
        this._runCommandAsync([NETBIRD_BIN, "networks", "select", id], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._getNetworks();
        }));
    },

    _deselectNetwork: function(id) {
        this._runCommandAsync([NETBIRD_BIN, "networks", "deselect", id], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._getNetworks();
        }));
    },

    // ---------------------------------------------------------------
    // UI updates
    // ---------------------------------------------------------------

    _updateUI: function(status) {
        let daemonStatus = status.daemonStatus || "Unknown";
        let isConnected = (daemonStatus === "Connected");
        let needsLogin = (daemonStatus === "NeedsLogin" ||
                          daemonStatus === "LoginFailed" ||
                          daemonStatus === "SessionExpired");

        this._connected = isConnected;

        // Toggle switch
        this._toggleItem.setToggleState(isConnected);

        // IP
        let ip = status.netbirdIp || "--";
        this._ipItem.label.set_text("IP: " + ip);

        // FQDN
        let fqdn = status.fqdn || "--";
        this._fqdnItem.label.set_text("FQDN: " + fqdn);

        // Peers
        let peers = status.peers || {};
        let peersConnected = (peers.connected !== undefined) ? peers.connected : 0;
        let peersTotal = (peers.total !== undefined) ? peers.total : 0;
        this._peersItem.label.set_text("Peers: " + peersConnected + "/" + peersTotal);

        // Relays
        let relays = status.relays || {};
        let relaysAvailable = (relays.available !== undefined) ? relays.available : 0;
        let relaysTotal = (relays.total !== undefined) ? relays.total : 0;
        this._relaysItem.label.set_text("Relays: " + relaysAvailable + "/" + relaysTotal);

        // Profile
        let profile = status.profileName || "--";
        this._profileItem.label.set_text("Profile: " + profile);

        // Applet label (peer count on panel)
        if (isConnected && this.showPeerCount) {
            this.set_applet_label(peersConnected + "/" + peersTotal);
        } else {
            this.set_applet_label("");
        }

        // Tooltip
        if (isConnected) {
            this.set_applet_tooltip("NetBird VPN - Connected (" + peersConnected + "/" + peersTotal + " peers)");
        } else if (needsLogin) {
            this.set_applet_tooltip("NetBird VPN - Login Required");
        } else {
            this.set_applet_tooltip("NetBird VPN - " + daemonStatus);
        }

        // Icon style based on state
        if (isConnected) {
            this.set_applet_icon_symbolic_name("network-vpn-symbolic");
        } else {
            this.set_applet_icon_symbolic_name("network-vpn-disabled-symbolic");
        }

        // Status section sensitivity
        let statusSensitive = isConnected;
        this._ipItem.setSensitive(statusSensitive);
        this._fqdnItem.setSensitive(statusSensitive);
        this._peersItem.setSensitive(statusSensitive);
        this._relaysItem.setSensitive(statusSensitive);

        // Handle login-required states
        if (needsLogin) {
            this._ipItem.label.set_text("Login Required");
            this._fqdnItem.label.set_text("Run: netbird up");
            this._peersItem.label.set_text("Peers: --");
            this._relaysItem.label.set_text("Relays: --");
        }
    },

    _updateUIDisconnected: function(reason) {
        this._connected = false;
        this._toggleItem.setToggleState(false);
        this._ipItem.label.set_text("IP: --");
        this._fqdnItem.label.set_text(reason || "Disconnected");
        this._peersItem.label.set_text("Peers: --");
        this._relaysItem.label.set_text("Relays: --");
        this._profileItem.label.set_text("Profile: --");
        this.set_applet_label("");
        this.set_applet_tooltip("NetBird VPN - " + (reason || "Disconnected"));
        this.set_applet_icon_symbolic_name("network-vpn-disabled-symbolic");
    },

    _updateNetworks: function(stdout, exitStatus) {
        // Clear existing network items
        this._networksSection.removeAll();

        if (exitStatus !== 0 || !stdout) {
            let noNetItem = new PopupMenu.PopupMenuItem("No networks available", { reactive: false });
            this._networksSection.addMenuItem(noNetItem);
            return;
        }

        // Parse the text output of `netbird networks list`
        // Format:
        //   Available Networks:
        //     - ID: route1
        //       Network: 10.0.0.0/24
        //       Status: Selected
        let lines = stdout.split("\n");
        let networks = [];
        let current = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            if (line.indexOf("ID:") === 0) {
                if (current) {
                    networks.push(current);
                }
                current = {
                    id: line.substring(3).trim(),
                    network: "",
                    selected: false
                };
            } else if (current && line.indexOf("Network:") === 0) {
                current.network = line.substring(8).trim();
            } else if (current && line.indexOf("Status:") === 0) {
                let statusVal = line.substring(7).trim();
                current.selected = (statusVal === "Selected");
            }
        }
        if (current) {
            networks.push(current);
        }

        if (networks.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem("No networks", { reactive: false });
            this._networksSection.addMenuItem(emptyItem);
            return;
        }

        for (let i = 0; i < networks.length; i++) {
            let net = networks[i];
            let label = net.network + " (" + net.id + ")";
            let item = new PopupMenu.PopupSwitchMenuItem(label, net.selected);

            // Use a closure to capture the network id and selected state
            (function(applet, networkId, isSelected) {
                item.connect("toggled", Lang.bind(applet, function() {
                    if (isSelected) {
                        applet._deselectNetwork(networkId);
                    } else {
                        applet._selectNetwork(networkId);
                    }
                }));
            })(this, net.id, net.selected);

            this._networksSection.addMenuItem(item);
        }
    },

    // ---------------------------------------------------------------
    // Event handlers
    // ---------------------------------------------------------------

    _onToggled: function(item, state) {
        if (state) {
            this._connect();
        } else {
            this._disconnect();
        }
    },

    _onPollIntervalChanged: function() {
        this._stopPolling();
        this._startPolling();
    },

    _onShowPeerCountChanged: function() {
        // Re-run status to update the label immediately
        this._getStatus();
    },

    on_applet_clicked: function() {
        this.menu.toggle();
    },

    // ---------------------------------------------------------------
    // Polling
    // ---------------------------------------------------------------

    _startPolling: function() {
        this._stopPolling();
        this._timerId = Mainloop.timeout_add_seconds(this.pollInterval, Lang.bind(this, function() {
            this._getStatus();
            return true; // Keep the timer running
        }));
    },

    _stopPolling: function() {
        if (this._timerId) {
            Mainloop.source_remove(this._timerId);
            this._timerId = null;
        }
    },

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------

    on_applet_removed_from_panel: function() {
        this._stopPolling();
        if (this.settings) {
            this.settings.finalize();
        }
    }
};

function main(metadata, orientation, panelHeight, instanceId) {
    return new NetBirdApplet(metadata, orientation, panelHeight, instanceId);
}
