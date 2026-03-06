#!/usr/bin/env bash
set -euo pipefail

# ─── DeVClaw Setup ──────────────────────────────────────────────
# Interactive setup script for macOS and Linux (Ubuntu/Debian).
# Run: bash scripts/setup.sh
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

echo -e "\n${BOLD}DeVClaw${NC} ${DIM}by Automated Engineering${NC}"
echo -e "${DIM}────────────────────────────${NC}\n"

# ─── Detect OS ──────────────────────────────────────────────────
step "Detecting platform"
OS="$(uname -s)"
case "$OS" in
  Darwin) ok "macOS detected" ;;
  Linux)  ok "Linux detected" ;;
  *)      fail "Unsupported OS: $OS"; exit 1 ;;
esac

# ─── Check prerequisites ───────────────────────────────────────
step "Checking prerequisites"

MISSING=0

if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 22 ]; then
    ok "Node.js $(node -v)"
  else
    fail "Node.js $(node -v) found but v22+ required"
    if [ "$OS" = "Darwin" ]; then
      echo "       Install: brew install node@22"
    else
      echo "       Install: https://nodejs.org/en/download/"
    fi
    MISSING=1
  fi
else
  fail "Node.js not found"
  if [ "$OS" = "Darwin" ]; then
    echo "       Install: brew install node@22"
  else
    echo "       Install: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  fi
  MISSING=1
fi

if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo 'available')
  if docker info &>/dev/null; then
    ok "Docker ${DOCKER_VER}"
  else
    fail "Docker installed but daemon not running"
    echo "       Start Docker Desktop or run: sudo systemctl start docker"
    MISSING=1
  fi
else
  fail "Docker not found (required for container-isolated tool execution)"
  if [ "$OS" = "Darwin" ]; then
    echo "       Install: https://docs.docker.com/desktop/install/mac-install/"
  else
    echo "       Install: https://docs.docker.com/engine/install/"
  fi
  MISSING=1
fi

if command -v git &>/dev/null; then
  GIT_VER=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo 'available')
  ok "Git ${GIT_VER}"
else
  warn "Git not found (optional, needed only for cloning)"
fi

if [ "$MISSING" -eq 1 ]; then
  echo ""
  fail "Missing required prerequisites. Install them and re-run this script."
  exit 1
fi

# ─── Install dependencies ──────────────────────────────────────
step "Installing npm dependencies"
npm install --silent
ok "Dependencies installed"

# ─── Generate .env ──────────────────────────────────────────────
step "Configuring environment"

if [ -f .env ]; then
  warn ".env already exists"
  read -rp "       Overwrite? (y/N): " OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    ok "Keeping existing .env"
    SKIP_ENV=1
  else
    SKIP_ENV=0
  fi
else
  SKIP_ENV=0
fi

if [ "$SKIP_ENV" -eq 0 ]; then
  MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  ok "Generated MASTER_KEY automatically"

  echo ""
  echo -e "  ${DIM}You'll need a few things from Telegram:${NC}"
  echo -e "  ${DIM}  1. Your numeric user ID (message @userinfobot on Telegram)${NC}"
  echo -e "  ${DIM}  2. A bot token (create one with @BotFather on Telegram)${NC}"
  echo ""

  # --- LLM API Keys ---
  read -rp "  Anthropic API key (or press Enter to skip): " ANTHROPIC_KEY
  read -rp "  OpenAI API key (or press Enter to skip): " OPENAI_KEY
  read -rp "  Google AI API key (or press Enter to skip): " GOOGLE_KEY

  if [ -z "$ANTHROPIC_KEY" ] && [ -z "$OPENAI_KEY" ] && [ -z "$GOOGLE_KEY" ]; then
    fail "At least one LLM API key is required"
    exit 1
  fi

  # Auto-detect provider
  if [ -n "$ANTHROPIC_KEY" ]; then
    PROVIDER="anthropic"
  elif [ -n "$OPENAI_KEY" ]; then
    PROVIDER="openai"
  else
    PROVIDER="google"
  fi
  ok "Default provider: ${PROVIDER}"

  # --- Telegram ---
  read -rp "  Telegram user ID (OWNER_CHAT_ID): " OWNER_CHAT_ID
  if ! [[ "$OWNER_CHAT_ID" =~ ^[0-9]+$ ]]; then
    fail "OWNER_CHAT_ID must be numeric (get it from @userinfobot on Telegram)"
    exit 1
  fi

  read -rp "  Main bot token (MAIN_BOT_TOKEN): " MAIN_BOT_TOKEN
  if [ -z "$MAIN_BOT_TOKEN" ]; then
    fail "Bot token is required"
    exit 1
  fi

  # Validate Telegram token
  echo -e "  ${DIM}Verifying bot token...${NC}"
  BOT_RESPONSE=$(curl -s "https://api.telegram.org/bot${MAIN_BOT_TOKEN}/getMe" 2>/dev/null || echo '{"ok":false}')
  if echo "$BOT_RESPONSE" | grep -q '"ok":true'; then
    BOT_USERNAME=$(echo "$BOT_RESPONSE" | grep -oE '"username":"[^"]+"' | head -1 | cut -d'"' -f4)
    ok "Bot verified: @${BOT_USERNAME}"
  else
    warn "Could not verify bot token (may still work -- check your token if issues arise)"
  fi

  # --- Dashboard ---
  read -rsp "  Dashboard password (min 8 chars): " DASHBOARD_PASSWORD
  echo ""
  if [ ${#DASHBOARD_PASSWORD} -lt 8 ]; then
    fail "Password must be at least 8 characters"
    exit 1
  fi
  ok "Dashboard password set"

  cat > .env <<ENVEOF
NODE_ENV=production
MASTER_KEY=${MASTER_KEY}

ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
OPENAI_API_KEY=${OPENAI_KEY}
GOOGLE_API_KEY=${GOOGLE_KEY}
MAIN_MODEL_PROVIDER=${PROVIDER}

OWNER_CHAT_ID=${OWNER_CHAT_ID}
MAIN_BOT_TOKEN=${MAIN_BOT_TOKEN}

DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
ENVEOF

  chmod 600 .env
  ok ".env written (permissions: 600)"
fi

# ─── Build containers ──────────────────────────────────────────
step "Building Docker containers"

if docker info &>/dev/null; then
  echo -e "  ${DIM}Building sandbox container...${NC}"
  if docker build -t devclaw-sandbox container/ -q >/dev/null 2>&1; then
    ok "devclaw-sandbox built"
  else
    fail "Sandbox container build failed"
    echo "       Fix Docker issues and run: docker build -t devclaw-sandbox container/"
    exit 1
  fi

  echo -e "  ${DIM}Building browser container...${NC}"
  if docker build -t devclaw-browser -f container/Dockerfile.browser container/ -q >/dev/null 2>&1; then
    ok "devclaw-browser built"
  else
    warn "Browser container build failed (browse tool will be unavailable)"
    echo "       Run later: docker build -t devclaw-browser -f container/Dockerfile.browser container/"
  fi
else
  fail "Docker daemon not running -- cannot build containers"
  echo "       Start Docker and re-run this script"
  exit 1
fi

# ─── Build TypeScript ──────────────────────────────────────────
step "Building TypeScript"
npm run build --silent
ok "Build complete"

# ─── Run security audit ────────────────────────────────────────
step "Running security audit"
if npx tsx src/audit.ts 2>/dev/null; then
  ok "Security audit passed"
else
  warn "Security audit found issues (review output above)"
fi

# ─── Install background service ────────────────────────────────
step "Installing background service"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/install-service.sh"

# ─── Done ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Setup complete! DeVClaw is running.${NC}"
echo ""
echo -e "  ${DIM}The agent is already running as a background service.${NC}"
echo -e "  ${DIM}It will start on boot and restart on crash automatically.${NC}"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}  http://localhost:3000"
echo ""
case "$(uname -s)" in
  Darwin)
    echo -e "  ${BOLD}Status:${NC}     launchctl print gui/\$(id -u)/com.devclaw.agent"
    echo -e "  ${BOLD}Logs:${NC}       tail -f ~/.devclaw/logs/devclaw.out.log"
    echo -e "  ${BOLD}Restart:${NC}    launchctl kickstart -k gui/\$(id -u)/com.devclaw.agent"
    echo -e "  ${BOLD}Stop:${NC}       launchctl bootout gui/\$(id -u)/com.devclaw.agent"
    ;;
  Linux)
    echo -e "  ${BOLD}Status:${NC}     systemctl --user status devclaw"
    echo -e "  ${BOLD}Logs:${NC}       journalctl --user -u devclaw -f"
    echo -e "  ${BOLD}Restart:${NC}    systemctl --user restart devclaw"
    echo -e "  ${BOLD}Stop:${NC}       systemctl --user stop devclaw"
    ;;
esac
echo ""
echo -e "  ${BOLD}Audit:${NC}      npm run audit"
echo -e "  ${BOLD}Uninstall:${NC}  bash scripts/install-service.sh --uninstall"
echo -e "  ${BOLD}Dev mode:${NC}   npm run dev ${DIM}(stop service first)${NC}"
echo ""
echo -e "  ${DIM}First run downloads the embedding model (~80MB)${NC}"
echo ""
