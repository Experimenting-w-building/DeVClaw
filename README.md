# DeVClaw

**A lightweight, self-hosted AI agent framework that builds its own tools, remembers everything, and runs a team.**

By [Automated Engineering](https://github.com/Experimenting-w-building)

---

DeVClaw started as [DeVitalik](https://github.com/automated-engineering/devitalik) -- an AI agent project that went through ElizaOS, ZerePy, LangChain/LangGraph, custom multi-agent builds, and OpenClaw before we decided to build our own. Each framework taught us something: what works, what doesn't, and how much code you actually need.

Inspired by [OpenClaw](https://github.com/openclaw) and the many iterations the community has shipped since -- with less code, more security, and specialized use-cases -- DeVClaw is our take on the personal AI agent framework. It's ~2K lines of TypeScript at its core, runs on a Mac Mini or a $5 VPS, talks to you on Telegram, remembers your conversations without burning tokens, and can spin up a team of specialist sub-agents on demand.

No cloud dependencies. No vendor lock-in. Your data stays on your machine.

## Deploy

| Method | Difficulty | What you need |
|--------|-----------|---------------|
| **[Docker Compose](#docker-compose-recommended)** | Easiest | Docker only |
| **[One-click cloud](#cloud-deploy)** | Easy | Railway or Fly.io account |
| **[Setup script](#setup-script)** | Moderate | Node.js 22+ and Docker |
| **[Manual](#manual-setup)** | Advanced | Full dev environment |

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/devclaw?referralCode=automated-engineering)

## Features

- **Multi-agent orchestration** -- A main agent that delegates to specialist sub-agents, each with their own personality, skills, and Telegram bot
- **Long-term memory** -- Tiered memory system with local vector embeddings (no API calls), semantic retrieval, automatic fact extraction, and conversation summarization. ~3K tokens per call instead of 10K+
- **Self-building tools** -- Agents write their own JavaScript skills, which run in sandboxed Docker containers and persist across sessions
- **Container isolation** -- Every shell command, skill execution, and browser session runs inside Docker. Nothing touches the host
- **Telegram or WhatsApp (or both)** -- Choose your messaging channel during setup. Use either one independently or both together. Sub-agents work via delegation on any channel, with optional dedicated Telegram bots
- **MCP compatible** -- Plug in any [Model Context Protocol](https://modelcontextprotocol.io) server and its tools become available to all agents
- **Multi-provider LLM** -- Anthropic, OpenAI, and Google supported natively via their official SDKs. No abstraction layer in between
- **WhatsApp support** -- Connect via WhatsApp alongside Telegram. QR-code pairing, owner-only access, automatic reconnection
- **Scheduled tasks** -- Cron-based task scheduling with automatic execution and Telegram delivery
- **Web dashboard** -- Real-time view of agents, skills, tasks, and audit logs. Password-protected, accessible remotely via Cloudflare Tunnel
- **Encrypted secrets** -- Bot tokens and API keys encrypted with AES-256-GCM at rest. Never stored in plaintext

## Architecture

```
          You
           │
    ┌──────┼──────────┐
    │      │          │
Telegram WhatsApp  Dashboard
 (grammY) (Baileys) (Hono/HTMX)
    │      │          │
    └──────┴────┬─────┘
           │
           ▼
   ┌───────────────────────────────────────┐
   │            Agent Team                 │
   │                                       │
   │  Main Agent ──► Trader Agent          │
   │       │──────► Research Agent         │
   │       │──────► ...more agents         │
   │                                       │
   │  each has: personality, skills,       │
   │  conversation history, telegram bot   │
   └───────────────┬───────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   ┌─────────┐ ┌────────┐ ┌─────────────────┐
   │  Tools  │ │ Memory │ │      LLM        │
   │         │ │        │ │                 │
   │ shell   │ │ embed  │ │ Claude / GPT /  │
   │ browser │ │ search │ │ Gemini          │
   │ files   │ │ recall │ │                 │
   │ cron    │ │ facts  │ │ (direct SDKs,   │
   │ skills  │ │ summ.  │ │  no wrappers)   │
   │ MCP ────┼─┼────────┼─► external tools  │
   └────┬────┘ └───┬────┘ └─────────────────┘
        │          │
        ▼          ▼
   ┌─────────┐ ┌────────────┐
   │ Docker  │ │  SQLite    │
   │ sandbox │ │  + vec     │
   │         │ │            │
   │ isolated│ │ messages   │
   │ per-run │ │ memories   │
   │ no host │ │ skills     │
   │ access  │ │ tasks      │
   └─────────┘ └────────────┘
```

## Quick Start

### Docker Compose (recommended)

The easiest path. You only need [Docker](https://docs.docker.com/desktop/) installed.

```bash
git clone https://github.com/Experimenting-w-building/DeVClaw.git
cd DeVClaw
docker compose up
```

Open `http://localhost:3000/setup` in your browser. The setup wizard walks you through everything:

1. Choose your LLM provider and paste your API key (validated live)
2. Create a Telegram bot with @BotFather and paste the token (validated live)
3. Set a dashboard password
4. Optionally configure WhatsApp
5. Review and launch

The wizard writes your `.env` file automatically, generates encryption keys, and restarts the agent. No terminal editing required.

### Cloud Deploy

**Railway** -- One click, no server needed. LLM + Telegram + memory + dashboard all work. Sandbox tools (shell, browser) require Docker socket access and are unavailable on Railway.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/devclaw?referralCode=automated-engineering)

**Fly.io** -- Full functionality including sandbox tools with persistent volumes.

```bash
fly launch --copy-config
fly secrets set MASTER_KEY=$(openssl rand -hex 32)
# Set remaining secrets via: fly secrets set KEY=VALUE
fly deploy
```

### Setup Script

For local machines (Mac Mini, laptop, VPS) where you want the full experience with background service:

```bash
git clone https://github.com/Experimenting-w-building/DeVClaw.git
cd DeVClaw
bash scripts/setup.sh
```

The script checks prerequisites, installs dependencies, walks you through configuration with live validation (verifies your Telegram token and API keys), builds containers, compiles TypeScript, runs a security audit, and installs DeVClaw as a background service.

### Manual Setup

```bash
git clone https://github.com/Experimenting-w-building/DeVClaw.git
cd DeVClaw
npm install
cp .env.example .env
# Edit .env with your keys (see Configuration below)
docker compose build
npm run build
bash scripts/install-service.sh   # installs + starts the background service
```

### Development Commands

```bash
npm run dev          # Dev mode with hot reload (auto-starts configured channels)
npm start            # Starts configured channels + REPL if no channels active
npm start -- --telegram --repl   # Override: Telegram only + local REPL
npm start -- --whatsapp          # Override: WhatsApp only
npm run audit        # Security audit
npm test             # Run tests
npm run test:watch   # Tests in watch mode
npm run typecheck    # TypeScript check
```

Channels auto-start based on your `.env` configuration. The `--telegram` and `--whatsapp` flags are optional overrides when you want to selectively enable only one channel.

## Configuration

All configuration lives in a single `.env` file:

| Variable | Required | Description |
|---|---|---|
| `MASTER_KEY` | Yes | 64-char hex key for encrypting secrets. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | No | Runtime mode: `development`, `test`, `production` (default: `development`) |
| `ANTHROPIC_API_KEY` | One of three | Anthropic API key |
| `OPENAI_API_KEY` | One of three | OpenAI API key |
| `GOOGLE_API_KEY` | One of three | Google AI API key |
| `OWNER_CHAT_ID` | If Telegram | Your Telegram numeric user ID. Message [@userinfobot](https://t.me/userinfobot) to find it |
| `MAIN_BOT_TOKEN` | If Telegram | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `MAIN_MODEL_PROVIDER` | No | Main agent provider: `anthropic`, `openai`, `google` (default: `anthropic`) |
| `MAIN_MODEL_NAME` | No | Main agent model name (default: `claude-sonnet-4-20250514`) |
| `LLM_TIMEOUT_MS` | No | Per-provider request timeout in ms (default: `45000`) |
| `LLM_MAX_RETRIES` | No | Number of retries for transient LLM call failures (default: `1`) |
| `DASHBOARD_PASSWORD` | Yes | Password for the web dashboard |
| `DASHBOARD_PORT` | No | Dashboard port (default: 3000) |
| `DASHBOARD_SKIP_AUTH` | No | Set to `true` to skip login (local dev only -- never use in production) |
| `DASHBOARD_ALLOWED_ORIGINS` | No | Comma-separated extra trusted origins for dashboard POST checks |
| `LOG_LEVEL` | No | Log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `WHATSAPP_OWNER_JID` | If WhatsApp | Your WhatsApp JID (`<country><number>@s.whatsapp.net`) |
| `MCP_SERVERS` | No | JSON array of MCP server configs (see MCP section) |
| `MCP_TOOL_AGENTS` | No | Comma-separated agent names allowed to use MCP tools (default: `main`) |
| `MCP_ENV_ALLOWLIST` | No | Comma-separated host env vars passed to MCP processes |

## Personality

DeVClaw agents have fully customizable personalities defined in free-form text.

### Main agent

Edit `src/agent/prompts.ts` and replace `MAIN_AGENT_PERSONALITY` with whatever you want your agent to be -- name, tone, expertise, quirks, communication style. This text is injected as the system prompt on every call.

For quick iteration without recompiling, create a file at `agents/main/personality.md` -- if present, it overrides the code-defined personality.

### Sub-agents

When proposing a new sub-agent (either through the main agent's `propose_agent` tool or via Telegram), you provide a personality string that defines who they are. Each sub-agent gets its own Telegram bot, skill directory, and conversation history.

Example -- ask your main agent:

> "I need a trader agent that specializes in crypto markets. It should be analytical, risk-aware, and report in short bullet points."

The main agent will draft the personality, propose the agent, and guide you through approval.

## WhatsApp

DeVClaw supports WhatsApp as an alternative (or additional) messaging channel alongside Telegram.

### Setup

1. Set your WhatsApp phone number in `.env`:

```bash
WHATSAPP_OWNER_JID=14155551234@s.whatsapp.net
```

2. Start with the `--whatsapp` flag:

```bash
npm start -- --whatsapp
# or both channels:
npm start -- --telegram --whatsapp
```

3. On first run, a QR code will be logged to the console. Scan it with your phone's WhatsApp (Linked Devices > Link a Device).

4. Auth state is persisted in `agents/main/whatsapp-auth/`. Subsequent restarts reconnect automatically without re-scanning.

### How it works

- Uses `@whiskeysockets/baileys` (WhatsApp Web protocol, no browser required)
- Only messages from `WHATSAPP_OWNER_JID` are processed (same owner-only model as Telegram)
- Automatic reconnection on connection drops (except logout)
- Typing indicators while the agent thinks
- Messages chunked at 4096 chars (matching Telegram behavior)

## MCP Servers

DeVClaw natively supports the [Model Context Protocol](https://modelcontextprotocol.io). Any MCP-compatible server can be plugged in, and its tools can be exposed to selected agents.

### Configuration

Add MCP servers to your `.env` as a JSON array:

```bash
MCP_SERVERS='[
  {
    "name": "filesystem",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
  },
  {
    "name": "postgres",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "DATABASE_URL": "postgresql://..." }
  }
]'
```

Each server's tools are automatically discovered on startup and prefixed with `mcp_<name>_` to avoid collisions. For example, the filesystem server's `read_file` tool becomes `mcp_filesystem_read_file`.

You can scope MCP access with:

```bash
# Only these agents receive MCP tools
MCP_TOOL_AGENTS=main,research

# Limit which host env vars are exposed to MCP server processes
MCP_ENV_ALLOWLIST=PATH,HOME,SHELL,TMPDIR,LANG,LC_ALL
```

Per-server permission profiles are also supported inside `MCP_SERVERS` entries:

```json
{
  "name": "postgres",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres"],
  "allowAgents": ["main", "research"],
  "allowTools": ["query", "describe_schema"],
  "envAllowlist": ["PATH", "HOME", "DATABASE_URL"]
}
```

### How it works

DeVClaw acts as an MCP **client**. On boot, it connects to each configured server via stdio, calls `tools/list` to discover available tools, and wraps each one as a native `ToolDefinition`. From the agent's perspective, MCP tools are indistinguishable from built-in tools.

## Memory System

DeVClaw uses a tiered memory architecture that gives agents persistent, relevant recall without flooding every LLM call with tokens.

**How it works:**

1. **Personality** (~500 tokens) -- Always present. The agent's core identity.
2. **Recalled memories** (~500-1000 tokens) -- Before each LLM call, the user's message is embedded locally using `all-MiniLM-L6-v2` and matched against stored memories via vector search. Only the most relevant 5-8 memories are included.
3. **Recent conversation** (~2000-3000 tokens) -- The last 10 messages for immediate context.
4. **Post-turn extraction** -- After each exchange, a lightweight LLM call extracts facts, preferences, and decisions worth remembering. These are embedded and stored for future retrieval.
5. **Automatic summarization** -- When conversation history exceeds 20 messages, older messages are compressed into a summary and stored as a long-term memory.

All embeddings run locally via `@huggingface/transformers` with a 384-dimension model (~80MB, downloaded once). No data leaves your machine. Vector search uses `sqlite-vec` for sub-millisecond retrieval.

## Dynamic Sub-Agents

Create new agents on the fly, through conversation or the web dashboard:

1. Ask your main agent to create a specialist (or it proposes one itself)
2. The agent stores a proposal in the database
3. Approve via Telegram (`/approve <name> [bot_token]`), WhatsApp, or the **Agents** page in the web dashboard
4. The new agent starts immediately -- no restart needed
5. Sub-agents work via delegation. With Telegram, they can optionally get their own bot for direct messaging

**Telegram commands** (main bot only, when Telegram is configured):

| Command | Description |
|---|---|
| `/approve <name> [token]` | Approve a pending agent. Bot token is optional -- omit for delegation-only agents |
| `/reject <name>` | Reject a pending agent proposal |
| `/agents` | List all active and pending agents |
| `/stop <name>` | Stop a sub-agent's Telegram bot |
| `/restart <name>` | Restart a sub-agent's Telegram bot |

**Dashboard approval** (works with any channel): Navigate to the **Agents** page in the web dashboard. Pending proposals appear with approve/reject buttons and an optional field for a Telegram bot token.

Bot tokens are encrypted with AES-256-GCM before storage. When approved via Telegram, the approval message is auto-deleted from chat history.

## Security

- **Container isolation** -- All tool execution (shell, browser, skills) happens inside Docker containers with constrained CPU/memory/PIDs and dropped capabilities
- **Encrypted secrets** -- Bot tokens and sensitive config encrypted at rest with AES-256-GCM using a master key
- **Owner-only access** -- Only messages from your `OWNER_CHAT_ID` (Telegram) or `WHATSAPP_OWNER_JID` (WhatsApp) are processed
- **Prompt injection defense** -- Every LLM call includes a canary token in the system prompt. If the model leaks it (indicating injection success), the response is automatically redacted. Incoming messages are also scanned against 15+ heuristic patterns for known injection techniques (ignore-previous-instructions, persona overrides, special token injection, etc.)
- **Skill sandboxing + integrity** -- Agent-created skills start in a sandbox tier. When promoted to trusted, skills are HMAC-signed with the master key. On every load, trusted skills are verified against their stored signature -- tampered files are refused and logged
- **Rate limiting** -- Built-in rate limits on LLM calls to prevent runaway costs, and brute-force protection on dashboard login
- **Audit logging** -- Every action (LLM calls, tool executions, skill runs, agent proposals, injection attempts) is logged with timestamps
- **Audit redaction** -- Sensitive tool input fields (tokens, passwords, API keys, auth headers) are redacted before audit persistence
- **Structured logging** -- All runtime logs use a leveled logger (`LOG_LEVEL` env var: debug/info/warn/error) with timestamps and module tags
- **Dashboard auth** -- Password-protected with signed session cookies (HttpOnly, SameSite=Lax, Secure over HTTPS)
- **CSRF + origin checks** -- Dashboard state-changing POST routes validate same-origin and CSRF tokens
- **Security headers** -- Dashboard responses set CSP, frame deny, content-type nosniff, referrer policy, and permissions policy
- **LLM resilience controls** -- Configurable timeout/retry policy for provider calls (`LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`)
- **Security audit CLI** -- `npm run audit` checks your configuration for weak passwords, missing env vars, Docker availability, container image health, MCP env exposure, file permissions, and more. Returns exit code 1 on failures for CI integration

## Remote Dashboard Access

The web dashboard runs on your machine. To access it from anywhere:

```bash
# Install Cloudflare Tunnel
brew install cloudflared  # macOS
# or: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Run the helper script
bash scripts/setup-tunnel.sh
```

This creates a Cloudflare Tunnel that routes `https://your-subdomain.cfargotunnel.com` to your local dashboard. The dashboard's password auth protects it independently.

## Background Service

The setup script automatically installs DeVClaw as a background service. It starts on login, restarts on crash, and persists across reboots. The installer detects your OS and uses the native service manager:

**macOS (launchd)**

| Action | Command |
|---|---|
| Status | `launchctl print gui/$(id -u)/com.devclaw.agent` |
| Logs | `tail -f ~/.devclaw/logs/devclaw.out.log` |
| Stop | `launchctl bootout gui/$(id -u)/com.devclaw.agent` |
| Restart | `launchctl kickstart -k gui/$(id -u)/com.devclaw.agent` |

**Linux VPS (systemd)**

| Action | Command |
|---|---|
| Status | `systemctl --user status devclaw` |
| Logs | `journalctl --user -u devclaw -f` |
| Stop | `systemctl --user stop devclaw` |
| Restart | `systemctl --user restart devclaw` |

The Linux installer enables `loginctl enable-linger` so the service survives SSH logout on headless VPS environments. No root required.

To reinstall or remove the service manually:

```bash
bash scripts/install-service.sh             # reinstall
bash scripts/install-service.sh --uninstall  # remove
```

## Project Structure

```
devclaw/
├── src/
│   ├── index.ts              # Entry point
│   ├── audit.ts              # Security audit CLI entry point
│   ├── config.ts             # Environment config + validation
│   ├── types.ts              # Core types, tool system
│   ├── agent/
│   │   ├── llm.ts            # Multi-provider LLM adapter + tool loop
│   │   ├── runtime.ts        # Agent execution with memory integration
│   │   ├── context.ts        # System prompt + memory-aware context building
│   │   ├── registry.ts       # Agent lifecycle management
│   │   └── prompts.ts        # Personality templates
│   ├── memory/
│   │   ├── embedder.ts       # Local embedding (all-MiniLM-L6-v2)
│   │   ├── store.ts          # Vector memory CRUD (sqlite-vec)
│   │   ├── extractor.ts      # Post-turn fact extraction
│   │   └── summarizer.ts     # Conversation compression
│   ├── tools/
│   │   ├── registry.ts       # Tool builder per agent capabilities
│   │   ├── shell.ts          # Containerized shell execution
│   │   ├── filesystem.ts     # Containerized file read/write
│   │   ├── browser.ts        # Headless Playwright in container
│   │   ├── scheduler.ts      # Cron-based task scheduling
│   │   ├── skill-builder.ts  # Agent skill creation
│   │   ├── delegate.ts       # Inter-agent delegation
│   │   ├── propose-agent.ts  # Dynamic agent proposals
│   │   └── mcp-bridge.ts     # MCP server connector
│   ├── channels/
│   │   ├── router.ts         # Channel-agnostic message routing
│   │   ├── telegram.ts       # grammY multi-bot management
│   │   └── whatsapp.ts       # Baileys WhatsApp Web connection
│   ├── web/
│   │   ├── server.ts         # Hono dashboard server + auth
│   │   ├── setup.ts          # First-run setup wizard
│   │   ├── views/layout.ts   # Dashboard HTML template
│   │   ├── views/setup-layout.ts  # Setup wizard template
│   │   └── routes/           # Dashboard pages
│   ├── db/
│   │   ├── index.ts          # SQLite + sqlite-vec init
│   │   └── schema.ts         # Table migrations
│   ├── security/
│   │   ├── crypto.ts         # AES-256-GCM encryption
│   │   ├── rate-limiter.ts   # Request rate limiting
│   │   ├── injection.ts      # Prompt injection canary + heuristic scanner
│   │   └── audit.ts          # Security audit checks
│   ├── skills/
│   │   ├── manager.ts        # Skill CRUD
│   │   ├── loader.ts         # Skills-to-tools converter
│   │   └── types.ts          # Skill metadata schema
│   ├── bus/
│   │   ├── message-bus.ts    # Inter-agent messaging
│   │   └── types.ts          # Bus types
│   ├── managed/
│   │   ├── reporter.ts       # Health/usage reporting (managed mode)
│   │   └── bootstrap.ts      # Remote provisioning API (managed mode)
│   ├── container/
│   │   └── docker.ts         # Docker API client
│   └── util/
│       ├── zod-to-json.ts    # Zod v4 JSON Schema converter
│       ├── html.ts           # HTML escaping for XSS prevention
│       ├── logger.ts         # Structured leveled logger
│       └── validate.ts       # Token/key validation helpers
├── container/
│   ├── Dockerfile            # Sandbox container (Node.js + common tools)
│   ├── Dockerfile.browser    # Browser container (Playwright + Chromium)
│   └── browser-script.js     # Browser automation script
├── scripts/
│   ├── setup.sh              # One-command setup
│   ├── install-service.sh    # Autostart service installer (launchd/systemd)
│   └── setup-tunnel.sh       # Cloudflare Tunnel helper
├── Dockerfile                # App container (multi-stage build)
├── docker-compose.yml        # Full-stack orchestration (app + sandbox + browser)
├── railway.json              # Railway deploy config
├── fly.toml                  # Fly.io deploy config
├── .dockerignore             # Docker build exclusions
├── .github/workflows/ci.yml  # CI pipeline (typecheck, test, build)
├── vitest.config.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Tech Stack

- **Runtime**: Node.js 22+ / TypeScript
- **LLM**: Anthropic SDK, OpenAI SDK, Google GenAI SDK (direct, no abstraction layer)
- **Telegram**: grammY
- **WhatsApp**: @whiskeysockets/baileys
- **Database**: better-sqlite3 + sqlite-vec (vector search)
- **Embeddings**: @huggingface/transformers (local ONNX, all-MiniLM-L6-v2)
- **Containers**: dockerode (Docker API client)
- **Dashboard**: Hono + HTMX
- **MCP**: @modelcontextprotocol/sdk
- **Scheduling**: node-cron
- **Validation**: Zod v4

## Benchmarks

How DeVClaw compares to other agent frameworks, ordered by resource footprint:

| | NullClaw | ZeroClaw | PicoClaw | NanoBot | **DeVClaw** | OpenClaw |
|---|---|---|---|---|---|---|
| **Language** | Zig | Rust | Go | Python | TypeScript | TypeScript |
| **RAM** | ~1 MB | < 5 MB | < 10 MB | > 100 MB | ~300-400 MB | > 1 GB |
| **Startup (0.8 GHz)** | < 8 ms | < 10 ms | < 1 s | > 30 s | ~30-60 s | > 500 s |
| **Binary Size** | 678 KB | 3.4 MB | ~8 MB | N/A (scripts) | ~100 KB (dist) | ~28 MB (dist) |
| **Tests** | 3,230+ | 1,017 | -- | -- | 62+ | -- |
| **Source Files** | ~110 | ~120 | -- | -- | ~35 | ~400+ |
| **Cost** | Any $5 hardware | Any $10 hardware | Linux board $10 | Linux SBC ~$50 | Any $5 VPS / Mac Mini | Mac Mini $599 |

DeVClaw uses ~1/3 the RAM of OpenClaw with ~1/13 the source files. The embedding model (~150MB resident) is the main memory cost -- without it, the core agent sits around ~150MB. Startup is dominated by ONNX model loading; on a modern Mac Mini it's closer to ~5s.

The compiled-language frameworks (Zig, Rust, Go) will always win on raw efficiency. DeVClaw trades that for development speed, readability (~30 files you can audit in an afternoon), and access to the npm ecosystem -- MCP SDK, grammY, HuggingFace transformers, and hundreds of other packages that just work.

## DeVClaw Cloud (Managed Hosting)

Don't want to self-host? **DeVClaw Cloud** provisions a dedicated DigitalOcean server for you with managed LLM access, so you can deploy an agent without touching a terminal.

**How it works:** Sign up, pick a plan, and we provision a dedicated server running your own DeVClaw instance. LLM calls are proxied through the control plane for usage metering and cap enforcement. Your data stays on your server -- we never see your conversations.

| Tier | Price | Server | Token Cap | Models |
|------|-------|--------|-----------|--------|
| Starter | $15/mo | 1 vCPU, 1 GB | 200K/mo | GPT-4o-mini, Haiku |
| Pro | $35/mo | 2 vCPU, 2 GB | 1M/mo | Sonnet, GPT-4o + mini for background |
| Power | $75/mo | 4 vCPU, 8 GB | 5M/mo | Full model access |
| BYOK | $8/mo | 1 vCPU, 1 GB | Unlimited | Your own API keys |

The control plane is a separate Next.js app: [devclaw-cloud](https://github.com/Experimenting-w-building/devclaw-cloud).

## Troubleshooting

**Docker Compose won't start / port conflict**

```bash
# Check what's using port 3000
lsof -i :3000
# Use a different port
DASHBOARD_PORT=3001 docker compose up
```

**"MASTER_KEY is required" on startup**

Your `.env` is missing or incomplete. Run through the setup wizard (`http://localhost:3000/setup`) or generate one manually:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output as MASTER_KEY in .env
```

**WhatsApp QR code doesn't appear**

Make sure you're running with `--whatsapp` and check the container logs. The QR code is printed to stdout. If you previously paired, delete `agents/main/whatsapp-auth/` and restart.

**Embedding model download hangs**

The first run downloads `all-MiniLM-L6-v2` (~80MB). If your network is slow or blocked, the agent may appear to hang during startup. Wait for the download to complete, or pre-download by running:

```bash
npx tsx -e "import('@huggingface/transformers').then(m => m.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'))"
```

**Security audit fails in CI**

`npm run audit` exits with code 1 when checks fail. Common issues: `NODE_ENV` not set to `production`, `DASHBOARD_SKIP_AUTH=true` in production, weak dashboard password. Review the audit output for specifics.

**Container sandbox tools fail**

Ensure Docker is running and the socket is accessible. On Linux, your user may need to be in the `docker` group:

```bash
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect
```

On cloud platforms without Docker socket access (like Railway), sandbox tools (shell, browser) are unavailable. Memory, LLM, scheduling, and messaging channels all work without Docker.

## License

MIT
