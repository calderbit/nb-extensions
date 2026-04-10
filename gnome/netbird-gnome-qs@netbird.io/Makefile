UUID = netbird-gnome-qs@netbird.io
INSTALLDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: build install uninstall clean

build:
	gnome-extensions pack --force \
		--extra-source=../README.md \
		--podir=po \
		--out-dir=build

install: build
	gnome-extensions install --force build/$(UUID).shell-extension.zip

uninstall:
	gnome-extensions uninstall $(UUID)

clean:
	rm -rf build/
