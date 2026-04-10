#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# NetBird Desktop Extensions — Smart Installer
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.config/netbird-widget"

# --- Colors (only when stdout is a terminal) -------------------------------

if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# --- Logging helpers -------------------------------------------------------

info()  { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
ok()    { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
err()   { printf "${RED}[ERR]${NC}   %s\n" "$*" >&2; }

# Track what was installed for the summary line
INSTALLED=()

# --- Banner ----------------------------------------------------------------

banner() {
    printf "\n"
    printf "${BLUE}========================================${NC}\n"
    printf "${BLUE}  NetBird Desktop Extensions Installer${NC}\n"
    printf "${BLUE}========================================${NC}\n"
    printf "\n"
}

# --- DE detection ----------------------------------------------------------

detect_de() {
    local detected=()

    # 1. XDG_CURRENT_DESKTOP (may contain colon-separated values)
    if [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
        local desktop_upper
        desktop_upper="$(echo "$XDG_CURRENT_DESKTOP" | tr '[:lower:]' '[:upper:]')"
        case "$desktop_upper" in
            *GNOME*)      detected+=(gnome) ;;
        esac
        case "$desktop_upper" in
            *X-CINNAMON*|*CINNAMON*) detected+=(cinnamon) ;;
        esac
        case "$desktop_upper" in
            *HYPRLAND*)   detected+=(waybar hyprpanel ags) ;;
        esac
        case "$desktop_upper" in
            *SWAY*)       detected+=(waybar) ;;
        esac
    fi

    # 2-3. Process checks (only add if not already detected)
    if ! printf '%s\n' "${detected[@]+"${detected[@]}"}" | grep -qx gnome; then
        if pgrep -x gnome-shell >/dev/null 2>&1; then
            detected+=(gnome)
        fi
    fi

    if ! printf '%s\n' "${detected[@]+"${detected[@]}"}" | grep -qx cinnamon; then
        if pgrep -x cinnamon >/dev/null 2>&1; then
            detected+=(cinnamon)
        fi
    fi

    # 4. Waybar running → likely Hyprland/Sway compositor
    if ! printf '%s\n' "${detected[@]+"${detected[@]}"}" | grep -qx waybar; then
        if pgrep -x waybar >/dev/null 2>&1; then
            detected+=(waybar)
        fi
    fi

    # 5. HyprPanel running
    if ! printf '%s\n' "${detected[@]+"${detected[@]}"}" | grep -qx hyprpanel; then
        if pgrep -x hyprpanel >/dev/null 2>&1; then
            detected+=(hyprpanel)
        fi
    fi

    # 6. AGS available on PATH
    if ! printf '%s\n' "${detected[@]+"${detected[@]}"}" | grep -qx ags; then
        if command -v ags >/dev/null 2>&1; then
            detected+=(ags)
        fi
    fi

    # Return space-separated list
    echo "${detected[*]+"${detected[*]}"}"
}

# --- Shared scripts --------------------------------------------------------

install_shared() {
    info "Installing shared helper scripts to $INSTALL_DIR"

    mkdir -p "$INSTALL_DIR"

    local scripts=(netbird-status.sh netbird-toggle.sh netbird-networks.sh)
    for s in "${scripts[@]}"; do
        local src="$SCRIPT_DIR/shared/$s"
        if [ ! -f "$src" ]; then
            warn "Missing shared script: $src — skipping"
            continue
        fi
        cp "$src" "$INSTALL_DIR/$s"
        chmod +x "$INSTALL_DIR/$s"
    done

    ok "Shared scripts installed to $INSTALL_DIR"
    INSTALLED+=(shared)
}

# --- Per-DE installers -----------------------------------------------------

install_gnome() {
    info "Installing GNOME Quick Settings extension"

    if ! command -v gnome-extensions >/dev/null 2>&1; then
        err "gnome-extensions command not found — is GNOME Shell installed?"
        return 1
    fi

    local ext_id="netbird-gnome-qs@netbird.io"
    local src_dir="$SCRIPT_DIR/gnome/$ext_id"

    if [ ! -d "$src_dir" ]; then
        err "Source directory not found: $src_dir"
        return 1
    fi

    if [ -f "$src_dir/Makefile" ]; then
        info "Running make install in $src_dir"
        make -C "$src_dir" install
    else
        local dest="$HOME/.local/share/gnome-shell/extensions/$ext_id"
        info "Copying extension to $dest"
        mkdir -p "$dest"
        cp -r "$src_dir/." "$dest/"
    fi

    ok "GNOME extension installed"
    info "Enable with:  gnome-extensions enable $ext_id"
    INSTALLED+=(gnome)
}

install_cinnamon() {
    info "Installing Cinnamon applet"

    local applet_id="netbird@netbird.io"
    local src_dir="$SCRIPT_DIR/cinnamon/$applet_id"
    local dest="$HOME/.local/share/cinnamon/applets/$applet_id"

    if [ ! -d "$src_dir" ]; then
        err "Source directory not found: $src_dir"
        return 1
    fi

    mkdir -p "$dest"
    cp -r "$src_dir/." "$dest/"

    ok "Cinnamon applet installed to $dest"
    info "Enable via Cinnamon Applets settings"
    INSTALLED+=(cinnamon)
}

install_waybar() {
    info "Installing Waybar integration"

    install_shared

    local waybar_dir="$SCRIPT_DIR/hyprland/waybar"
    if [ ! -d "$waybar_dir" ]; then
        err "Waybar source directory not found: $waybar_dir"
        return 1
    fi

    printf "\n"
    info "Merge the following into your Waybar configuration:"
    info "  Config:  $waybar_dir/config.jsonc"
    info "  Style:   $waybar_dir/style.css"
    info "Add 'custom/netbird' to your Waybar modules array"
    printf "\n"

    ok "Waybar integration ready"
    INSTALLED+=(waybar)
}

install_hyprpanel() {
    info "Installing HyprPanel integration"

    install_shared

    local hp_dir="$SCRIPT_DIR/hyprland/hyprpanel"
    if [ ! -d "$hp_dir" ]; then
        err "HyprPanel source directory not found: $hp_dir"
        return 1
    fi

    printf "\n"
    info "Merge the following into your HyprPanel configuration:"
    info "  Modules: $hp_dir/modules.json"
    info "  Style:   $hp_dir/style.scss"
    printf "\n"

    ok "HyprPanel integration ready"
    INSTALLED+=(hyprpanel)
}

install_ags() {
    info "Installing AGS widget"

    install_shared

    local ags_dir="$SCRIPT_DIR/hyprland/ags"
    if [ ! -d "$ags_dir" ]; then
        err "AGS source directory not found: $ags_dir"
        return 1
    fi

    printf "\n"
    info "Copy the following into your AGS config directory:"
    info "  Service: $ags_dir/service/"
    info "  Widget:  $ags_dir/widget/"
    info "Then import the widget in your AGS config file."
    printf "\n"

    ok "AGS widget ready"
    INSTALLED+=(ags)
}

# --- Install everything ----------------------------------------------------

install_all() {
    info "Installing all components"
    printf "\n"

    install_shared

    install_gnome   || warn "GNOME installation skipped (see above)"
    install_cinnamon || warn "Cinnamon installation skipped (see above)"
    install_waybar
    install_hyprpanel
    install_ags
}

# --- Uninstall -------------------------------------------------------------

uninstall() {
    info "Uninstalling NetBird Desktop Extensions"

    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        ok "Removed shared scripts ($INSTALL_DIR)"
    else
        info "Shared scripts directory not present — nothing to remove"
    fi

    local gnome_ext="$HOME/.local/share/gnome-shell/extensions/netbird-gnome-qs@netbird.io"
    if [ -d "$gnome_ext" ]; then
        rm -rf "$gnome_ext"
        ok "Removed GNOME extension"
    fi

    local cinnamon_applet="$HOME/.local/share/cinnamon/applets/netbird@netbird.io"
    if [ -d "$cinnamon_applet" ]; then
        rm -rf "$cinnamon_applet"
        ok "Removed Cinnamon applet"
    fi

    printf "\n"
    warn "Waybar, HyprPanel, and AGS config changes must be reverted manually."
    printf "\n"

    ok "Uninstall complete"
}

# --- Interactive menu ------------------------------------------------------

show_menu() {
    local detected="$1"

    if [ -n "$detected" ]; then
        info "Detected environments: $detected"
    else
        warn "No desktop environment detected automatically"
    fi

    printf "\n"
    printf "  ${BLUE}[1]${NC}  GNOME\n"
    printf "  ${BLUE}[2]${NC}  Cinnamon\n"
    printf "  ${BLUE}[3]${NC}  Waybar\n"
    printf "  ${BLUE}[4]${NC}  HyprPanel\n"
    printf "  ${BLUE}[5]${NC}  AGS\n"
    printf "  ${BLUE}[6]${NC}  All\n"
    printf "  ${BLUE}[0]${NC}  Cancel\n"
    printf "\n"
    printf "Choose an option: "

    local choice
    read -r choice

    case "$choice" in
        1) install_shared; install_gnome ;;
        2) install_shared; install_cinnamon ;;
        3) install_waybar ;;
        4) install_hyprpanel ;;
        5) install_ags ;;
        6) install_all ;;
        0) info "Cancelled."; exit 0 ;;
        *) err "Invalid selection"; exit 1 ;;
    esac
}

# --- Usage -----------------------------------------------------------------

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

NetBird Desktop Extensions Installer

Options:
  --gnome       Install GNOME Quick Settings extension
  --cinnamon    Install Cinnamon applet
  --waybar      Install Waybar integration (includes shared scripts)
  --hyprpanel   Install HyprPanel integration (includes shared scripts)
  --ags         Install AGS widget (includes shared scripts)
  --all         Install all components
  --uninstall   Remove all installed components
  -h, --help    Show this help message

If no options are given, the installer will attempt to detect your
desktop environment and either auto-install or present a menu.
EOF
}

# --- Summary ---------------------------------------------------------------

print_summary() {
    if [ ${#INSTALLED[@]} -eq 0 ]; then
        return
    fi

    # Deduplicate
    local unique
    unique="$(printf '%s\n' "${INSTALLED[@]}" | sort -u | tr '\n' ' ')"

    printf "\n"
    printf "${GREEN}========================================${NC}\n"
    printf "${GREEN}  Installation Summary${NC}\n"
    printf "${GREEN}========================================${NC}\n"
    ok "Installed components: $unique"
    printf "\n"
}

# --- Main ------------------------------------------------------------------

main() {
    banner

    # If arguments were provided, parse them
    if [ $# -gt 0 ]; then
        local did_something=false
        while [ $# -gt 0 ]; do
            case "$1" in
                --gnome)
                    install_shared; install_gnome
                    did_something=true
                    ;;
                --cinnamon)
                    install_shared; install_cinnamon
                    did_something=true
                    ;;
                --waybar)
                    install_waybar
                    did_something=true
                    ;;
                --hyprpanel)
                    install_hyprpanel
                    did_something=true
                    ;;
                --ags)
                    install_ags
                    did_something=true
                    ;;
                --all)
                    install_all
                    did_something=true
                    ;;
                --uninstall)
                    uninstall
                    exit 0
                    ;;
                -h|--help)
                    usage
                    exit 0
                    ;;
                *)
                    err "Unknown option: $1"
                    usage
                    exit 1
                    ;;
            esac
            shift
        done
        if $did_something; then
            print_summary
        fi
        exit 0
    fi

    # No arguments — auto-detect
    local detected
    detected="$(detect_de)"

    # Count detected environments
    local count=0
    local single=""
    if [ -n "$detected" ]; then
        for env in $detected; do
            count=$((count + 1))
            single="$env"
        done
    fi

    if [ "$count" -eq 0 ]; then
        warn "Could not auto-detect desktop environment"
        show_menu ""
    elif [ "$count" -eq 1 ]; then
        info "Detected environment: $single"
        info "Auto-installing for $single"
        printf "\n"
        case "$single" in
            gnome)     install_shared; install_gnome ;;
            cinnamon)  install_shared; install_cinnamon ;;
            waybar)    install_waybar ;;
            hyprpanel) install_hyprpanel ;;
            ags)       install_ags ;;
        esac
    else
        show_menu "$detected"
    fi

    print_summary
}

main "$@"
