import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class NetBirdPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // -- Page ------------------------------------------------------------
        const page = new Adw.PreferencesPage({
            title: 'NetBird Settings',
            icon_name: 'network-vpn-symbolic',
        });
        window.add(page);

        // -- General group ---------------------------------------------------
        const group = new Adw.PreferencesGroup({
            title: 'General',
        });
        page.add(group);

        // Poll interval (1–60 seconds, default 5)
        const pollRow = new Adw.SpinRow({
            title: 'Poll Interval',
            subtitle: 'Seconds between status checks',
            adjustment: new Adw.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
                value: 5,
            }),
        });
        settings.bind('poll-interval', pollRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(pollRow);

        // Show peer count in panel
        const peersRow = new Adw.SwitchRow({
            title: 'Show Peer Count',
            subtitle: 'Display connected/total peers in panel',
        });
        settings.bind('show-peers', peersRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(peersRow);
    }
}
