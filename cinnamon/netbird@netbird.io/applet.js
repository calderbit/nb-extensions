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
        this._suppressSettingsToggle = false;

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

        // ---- Settings section ----------------------------------------------
        this._settingsLabel = new PopupMenu.PopupMenuItem("Settings", { reactive: false });
        this.menu.addMenuItem(this._settingsLabel);

        this._sshToggle = new PopupMenu.PopupSwitchMenuItem("Allow SSH", false);
        this._sshToggle.connect("toggled", Lang.bind(this, function(_item, state) {
            if (this._suppressSettingsToggle) return;
            this._setFlag("allow-server-ssh", state);
        }));
        this.menu.addMenuItem(this._sshToggle);

        this._quantumToggle = new PopupMenu.PopupSwitchMenuItem("Quantum Resistance", false);
        this._quantumToggle.connect("toggled", Lang.bind(this, function(_item, state) {
            if (this._suppressSettingsToggle) return;
            this._setFlag("enable-rosenpass", state);
        }));
        this.menu.addMenuItem(this._quantumToggle);

        this._lazyToggle = new PopupMenu.PopupSwitchMenuItem("Lazy Connections", false);
        this._lazyToggle.connect("toggled", Lang.bind(this, function(_item, state) {
            if (this._suppressSettingsToggle) return;
            this._setFlag("enable-lazy-connection", state);
        }));
        this.menu.addMenuItem(this._lazyToggle);

        // Debug bundle
        this._debugBundleItem = new PopupMenu.PopupMenuItem("Create Debug Bundle");
        this._debugBundleItem.connect("activate", Lang.bind(this, this._createDebugBundle));
        this.menu.addMenuItem(this._debugBundleItem);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Profiles section ----------------------------------------------
        this._profilesLabel = new PopupMenu.PopupMenuItem("Profiles", { reactive: false });
        this.menu.addMenuItem(this._profilesLabel);

        this._profilesSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._profilesSection);

        // Separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Deregister
        this._deregisterItem = new PopupMenu.PopupMenuItem("Deregister");
        this._deregisterItem.connect("activate", Lang.bind(this, this._deregister));
        this.menu.addMenuItem(this._deregisterItem);
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

        // Also fetch networks and profiles
        this._getNetworks();
        this._getProfiles();
    },

    _connect: function() {
        this._toggleItem.setSensitive(false);
        this.set_applet_tooltip("NetBird VPN - Connecting...");

        this._runCommandAsync([NETBIRD_BIN, "up"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._toggleItem.setSensitive(true);
            this._getStatus();
        }));
    },

    _disconnect: function() {
        this._toggleItem.setSensitive(false);
        this.set_applet_tooltip("NetBird VPN - Disconnecting...");

        this._runCommandAsync([NETBIRD_BIN, "down"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._toggleItem.setSensitive(true);
            this._getStatus();
        }));
    },

    _setFlag: function(flag, value) {
        this._runCommandAsync([NETBIRD_BIN, "up", "--" + flag + "=" + value], Lang.bind(this, function(stdout, stderr, exitStatus) {
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

    _getProfiles: function() {
        this._runCommandAsync([NETBIRD_BIN, "profile", "list"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            this._updateProfiles(stdout, exitStatus);
        }));
    },

    _selectProfile: function(name) {
        // Disconnect, switch profile, reconnect
        this._runCommandAsync([NETBIRD_BIN, "down"], Lang.bind(this, function() {
            this._runCommandAsync([NETBIRD_BIN, "profile", "select", name], Lang.bind(this, function() {
                this._runCommandAsync([NETBIRD_BIN, "up"], Lang.bind(this, function() {
                    this._getStatus();
                }));
            }));
        }));
    },

    _createDebugBundle: function() {
        this._runCommandAsync([NETBIRD_BIN, "debug", "bundle"], Lang.bind(this, function(stdout, stderr, exitStatus) {
            if (exitStatus === 0) {
                global.log("NetBird: Debug bundle created");
            } else {
                global.logError("NetBird: Debug bundle failed: " + (stderr || "unknown error"));
            }
        }));
    },

    _deregister: function() {
        this._runCommandAsync([NETBIRD_BIN, "down"], Lang.bind(this, function() {
            this._runCommandAsync([NETBIRD_BIN, "deregister"], Lang.bind(this, function(stdout, stderr, exitStatus) {
                if (exitStatus === 0) {
                    global.log("NetBird: Peer deregistered");
                }
                this._getStatus();
            }));
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

        // Settings toggles (suppress signal to avoid triggering setFlag)
        this._suppressSettingsToggle = true;
        try {
            let sshEnabled = (status.sshServer && status.sshServer.enabled) || false;
            this._sshToggle.setToggleState(sshEnabled);

            let quantum = status.quantumResistance || false;
            this._quantumToggle.setToggleState(quantum);

            let lazy = status.lazyConnectionEnabled || false;
            this._lazyToggle.setToggleState(lazy);
        } finally {
            this._suppressSettingsToggle = false;
        }

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
        this.set_applet_label("");
        this.set_applet_tooltip("NetBird VPN - " + (reason || "Disconnected"));
        this.set_applet_icon_symbolic_name("network-vpn-disabled-symbolic");

        this._suppressSettingsToggle = true;
        try {
            this._sshToggle.setToggleState(false);
            this._quantumToggle.setToggleState(false);
            this._lazyToggle.setToggleState(false);
        } finally {
            this._suppressSettingsToggle = false;
        }
    },

    _updateNetworks: function(stdout, exitStatus) {
        // Clear existing network items
        this._networksSection.removeAll();

        if (exitStatus !== 0 || !stdout) {
            let noNetItem = new PopupMenu.PopupMenuItem("No networks available", { reactive: false });
            this._networksSection.addMenuItem(noNetItem);
            return;
        }

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

    _updateProfiles: function(stdout, exitStatus) {
        this._profilesSection.removeAll();

        if (exitStatus !== 0 || !stdout) {
            let item = new PopupMenu.PopupMenuItem("No profiles", { reactive: false });
            this._profilesSection.addMenuItem(item);
            return;
        }

        let lines = stdout.split("\n");
        let profiles = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.indexOf("Available") === 0 || line.indexOf("Profiles") === 0)
                continue;

            // Strip leading bullet/dash
            line = line.replace(/^[-*]\s*/, "");

            let active = (line.indexOf("(active)") !== -1 || line.indexOf("(selected)") !== -1);
            let name = line.replace(/\(active\)/g, "").replace(/\(selected\)/g, "").trim();
            if (name) {
                profiles.push({ name: name, active: active });
            }
        }

        if (profiles.length === 0) {
            let item = new PopupMenu.PopupMenuItem("No profiles", { reactive: false });
            this._profilesSection.addMenuItem(item);
            return;
        }

        for (let i = 0; i < profiles.length; i++) {
            let prof = profiles[i];
            let label = prof.active ? "\u25CF " + prof.name : "  " + prof.name;
            let item = new PopupMenu.PopupMenuItem(label);

            if (prof.active) {
                item.setSensitive(false);
            } else {
                (function(applet, profileName) {
                    item.connect("activate", Lang.bind(applet, function() {
                        applet._selectProfile(profileName);
                    }));
                })(this, prof.name);
            }

            this._profilesSection.addMenuItem(item);
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
            return true;
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
