# NetBird Quick Settings

GNOME Shell Quick Settings extension for NetBird VPN.

## Requirements

- GNOME Shell 45+
- NetBird installed and daemon running (`netbird` CLI available in `$PATH`)

## Install

Build and install with:

```sh
make install
```

Then restart GNOME Shell (log out and back in on Wayland) or press `Alt+F2`, type `r`, and press Enter (X11 only).

### Manual install

Copy the extension directory to your local extensions folder:

```sh
cp -r netbird-gnome-qs@netbird.io ~/.local/share/gnome-shell/extensions/
```

## Enable

```sh
gnome-extensions enable netbird-gnome-qs@netbird.io
```
