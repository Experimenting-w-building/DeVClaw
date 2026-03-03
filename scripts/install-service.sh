#!/usr/bin/env bash
set -euo pipefail

# ─── DeVClaw Service Installer ──────────────────────────────────
# Installs DeVClaw as a persistent background service.
#   macOS  → launchd (~/Library/LaunchAgents)
#   Linux  → systemd user unit (~/.config/systemd/user)
#
# Usage:
#   bash scripts/install-service.sh             # install
#   bash scripts/install-service.sh --uninstall  # remove
# ────────────────────────────────────────────────────────────────

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
step() { echo -e "\n${CYAN}${BOLD}▸ $1${NC}"; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
OS="$(uname -s)"

PLIST_LABEL="com.devclaw.agent"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
SYSTEMD_UNIT="devclaw.service"
SYSTEMD_DIR="$HOME/.config/systemd/user"
SYSTEMD_PATH="${SYSTEMD_DIR}/${SYSTEMD_UNIT}"
LOG_DIR="$HOME/.devclaw/logs"

echo -e "\n${BOLD}DeVClaw${NC} ${DIM}Service Installer${NC}"
echo -e "${DIM}────────────────────────────${NC}"

# ─── Uninstall ──────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  step "Uninstalling DeVClaw service"

  case "$OS" in
    Darwin)
      if [ -f "$PLIST_PATH" ]; then
        launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
        rm -f "$PLIST_PATH"
        ok "launchd service removed"
      else
        warn "No launchd service found at $PLIST_PATH"
      fi
      ;;
    Linux)
      if [ -f "$SYSTEMD_PATH" ]; then
        systemctl --user stop devclaw 2>/dev/null || true
        systemctl --user disable devclaw 2>/dev/null || true
        rm -f "$SYSTEMD_PATH"
        systemctl --user daemon-reload
        ok "systemd service removed"
      else
        warn "No systemd service found at $SYSTEMD_PATH"
      fi
      ;;
    *)
      fail "Unsupported OS: $OS"
      exit 1
      ;;
  esac

  echo ""
  ok "DeVClaw service uninstalled"
  exit 0
fi

# ─── Pre-checks ────────────────────────────────────────────────
step "Checking prerequisites"

if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
  fail "dist/index.js not found. Run 'npm run build' first."
  exit 1
fi
ok "Build found at $PROJECT_DIR/dist/index.js"

if [ -z "$NODE_BIN" ]; then
  fail "Node.js not found in PATH"
  exit 1
fi
ok "Node.js at $NODE_BIN"

mkdir -p "$LOG_DIR"
ok "Log directory: $LOG_DIR"

# ─── macOS (launchd) ───────────────────────────────────────────
install_launchd() {
  step "Installing launchd service"

  if [ -f "$PLIST_PATH" ]; then
    warn "Existing service found -- replacing"
    launchctl bootout "gui/$(id -u)/${PLIST_LABEL}" 2>/dev/null || true
  fi

  mkdir -p "$(dirname "$PLIST_PATH")"

  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${PROJECT_DIR}/dist/index.js</string>
    <string>--telegram</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/devclaw.out.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/devclaw.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST

  launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
  ok "Service installed and started"

  echo ""
  echo -e "  ${BOLD}Check status:${NC}  launchctl print gui/$(id -u)/${PLIST_LABEL}"
  echo -e "  ${BOLD}View logs:${NC}     tail -f ~/.devclaw/logs/devclaw.out.log"
  echo -e "  ${BOLD}Stop:${NC}          launchctl bootout gui/$(id -u)/${PLIST_LABEL}"
  echo -e "  ${BOLD}Restart:${NC}       launchctl kickstart -k gui/$(id -u)/${PLIST_LABEL}"
  echo -e "  ${BOLD}Uninstall:${NC}     bash scripts/install-service.sh --uninstall"
}

# ─── Linux (systemd) ───────────────────────────────────────────
install_systemd() {
  step "Installing systemd user service"

  mkdir -p "$SYSTEMD_DIR"

  cat > "$SYSTEMD_PATH" <<UNIT
[Unit]
Description=DeVClaw Agent Framework
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=${NODE_BIN} ${PROJECT_DIR}/dist/index.js --telegram
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  systemctl --user enable --now devclaw
  ok "Service installed and started"

  if command -v loginctl &>/dev/null; then
    loginctl enable-linger "$USER" 2>/dev/null && \
      ok "Linger enabled (service survives logout)" || \
      warn "Could not enable linger -- service may stop on logout. Run: sudo loginctl enable-linger $USER"
  fi

  echo ""
  echo -e "  ${BOLD}Check status:${NC}  systemctl --user status devclaw"
  echo -e "  ${BOLD}View logs:${NC}     journalctl --user -u devclaw -f"
  echo -e "  ${BOLD}Stop:${NC}          systemctl --user stop devclaw"
  echo -e "  ${BOLD}Restart:${NC}       systemctl --user restart devclaw"
  echo -e "  ${BOLD}Uninstall:${NC}     bash scripts/install-service.sh --uninstall"
}

# ─── Dispatch ──────────────────────────────────────────────────
case "$OS" in
  Darwin) install_launchd ;;
  Linux)  install_systemd ;;
  *)      fail "Unsupported OS: $OS"; exit 1 ;;
esac

echo ""
echo -e "${GREEN}${BOLD}DeVClaw is running as a background service.${NC}"
echo -e "${DIM}It will start automatically on boot and restart on crash.${NC}"
echo ""
