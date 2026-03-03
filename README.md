# DeVClaw

**A lightweight, self-hosted AI agent framework that builds its own tools, remembers everything, and runs a team.**

By [Automated Engineering](https://github.com/automated-engineering)

---

DeVClaw started as [DeVitalik](https://github.com/automated-engineering/devitalik) -- an AI agent project that went through ElizaOS, ZerePy, LangChain/LangGraph, custom multi-agent builds, and OpenClaw before we decided to build our own. Each framework taught us something: what works, what doesn't, and how much code you actually need.

Inspired by [OpenClaw](https://github.com/openclaw) and the many iterations the community has shipped since -- with less code, more security, and specialized use-cases -- DeVClaw is our take on the personal AI agent framework. It's ~2K lines of TypeScript at its core, runs on a Mac Mini or a $5 VPS, talks to you on Telegram, remembers your conversations without burning tokens, and can spin up a team of specialist sub-agents on demand.

No cloud dependencies. No vendor lock-in. Your data stays on your machine.

## Features

- **Multi-agent orchestration** -- A main agent that delegates to specialist sub-agents, each with their own personality, skills, and Telegram bot
- **Long-term memory** -- Tiered memory system with local vector embeddings (no API calls), semantic retrieval, automatic fact extraction, and conversation summarization. ~3K tokens per call instead of 10K+
- **Self-building tools** -- Agents write their own JavaScript skills, which run in sandboxed Docker containers and persist across sessions
- **Container isolation** -- Every shell command, skill execution, and browser session runs inside Docker. Nothing touches the host
- **Telegram-native** -- Talk to your agents directly. Create new sub-agents via conversation. No web UI required (but there is one)
- **MCP compatible** -- Plug in any [Model Context Protocol](https://modelcontextprotocol.io) server and its tools become available to all agents
- **Multi-provider LLM** -- Anthropic, OpenAI, and Google supported natively via their official SDKs. No abstraction layer in between
- **Scheduled tasks** -- Cron-based task scheduling with automatic execution and Telegram delivery
- **Web dashboard** -- Real-time view of agents, skills, tasks, and audit logs. Password-protected, accessible remotely via Cloudflare Tunnel
- **Encrypted secrets** -- Bot tokens and API keys encrypted with AES-256-GCM at rest. Never stored in plaintext

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        DeVClaw                           │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │   Main   │  │  Trader  │  │ Research │  ...agents     │
│  │  Agent   │──│  Agent   │  │  Agent   │               │
│  └────┬─────┘  └──────────┘  └──────────┘               │
│       │                                                  │
│  ┌────┴─────────────────────────────────────────┐        │
│  │              Tool Registry                    │        │
│  │  shell | browser | filesystem | scheduler     │        │
│  │  skill-builder | delegate | MCP bridge        │        │
│  └────┬─────────────────────────────────────────┘        │
│       │                                                  │
│  ┌────┴──────┐  ┌───────────┐  ┌──────────────┐         │
│  │  Memory   │  │  SQLite   │  │   Docker     │         │
│  │  System   │  │  + vec    │  │  Containers  │         │
│  │ (local    │  │           │  │  (isolated)  │         │
│  │ embeddings│  │           │  │              │         │
│  └───────────┘  └───────────┘  └──────────────┘         │
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐         │
│  │ Telegram  │  │ Dashboard │  │ MCP Servers  │         │
│  │  (grammY) │  │  (Hono)   │  │  (stdio/HTTP)│         │
│  └───────────┘  └───────────┘  └──────────────┘         │
└──────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Node.js 22+** -- `brew install node@22` (macOS) or [nodejs.org](https://nodejs.org)
- **Docker** -- [Docker Desktop](https://docs.docker.com/desktop/) or `dockerd`
- **A Telegram bot token** -- Create one with [@BotFather](https://t.me/BotFather)
- **An LLM API key** -- Anthropic, OpenAI, or Google (at least one)

### One-command setup

```bash
git clone https://github.com/automated-engineering/devclaw.git
cd devclaw
bash scripts/setup.sh
```

The setup script checks your system, installs dependencies, walks you through configuration, builds the Docker containers, compiles TypeScript, and installs DeVClaw as a background service. When it's done, the agent is already running -- it starts on boot and restarts on crash automatically.

For development and testing, stop the service first and use:

```bash
# Dev mode with hot reload
npm run dev

# Local REPL only (no Telegram)
npm start

# Both Telegram and local REPL
npm start -- --telegram --repl
```

### Manual setup

```bash
git clone https://github.com/automated-engineering/devclaw.git
cd devclaw
npm install
cp .env.example .env
# Edit .env with your keys (see Configuration below)
docker compose build
npm run build
bash scripts/install-service.sh   # installs + starts the background service
```

## Configuration

All configuration lives in a single `.env` file:

| Variable | Required | Description |
|---|---|---|
| `MASTER_KEY` | Yes | 64-char hex key for encrypting secrets. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | One of three | Anthropic API key |
| `OPENAI_API_KEY` | One of three | OpenAI API key |
| `GOOGLE_API_KEY` | One of three | Google AI API key |
| `OWNER_CHAT_ID` | Yes | Your Telegram numeric user ID. Message [@userinfobot](https://t.me/userinfobot) to find it |
| `MAIN_BOT_TOKEN` | Yes | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `DASHBOARD_PASSWORD` | Yes | Password for the web dashboard |
| `DASHBOARD_PORT` | No | Dashboard port (default: 3000) |
| `MCP_SERVERS` | No | JSON array of MCP server configs (see MCP section) |

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

## MCP Servers

DeVClaw natively supports the [Model Context Protocol](https://modelcontextprotocol.io). Any MCP-compatible server can be plugged in, and its tools become available to all agents.

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

Create new agents on the fly, entirely through Telegram conversation:

1. Ask your main agent to create a specialist (or it proposes one itself)
2. The agent stores a proposal in the database
3. You approve with `/approve <name> <bot_token>` (create a bot with @BotFather first)
4. The new agent starts immediately -- no restart needed
5. DM the new bot directly, or let the main agent delegate to it

**Telegram commands** (main bot only):

| Command | Description |
|---|---|
| `/approve <name> <token>` | Approve a pending agent with its Telegram bot token |
| `/reject <name>` | Reject a pending agent proposal |
| `/agents` | List all active and pending agents |
| `/stop <name>` | Stop a sub-agent's Telegram bot |
| `/restart <name>` | Restart a sub-agent's Telegram bot |

Bot tokens are encrypted with AES-256-GCM before storage and the approval message is deleted from Telegram chat history automatically.

## Security

- **Container isolation** -- All tool execution (shell, browser, skills) happens inside Docker containers with limited resources and no host network access
- **Encrypted secrets** -- Bot tokens and sensitive config encrypted at rest with AES-256-GCM using a master key
- **Owner-only access** -- Only messages from your `OWNER_CHAT_ID` are processed by any bot
- **Skill sandboxing** -- Agent-created skills start in a sandbox tier. You can promote them to trusted after review
- **Rate limiting** -- Built-in rate limits on LLM calls to prevent runaway costs
- **Audit logging** -- Every action (LLM calls, tool executions, skill runs, agent proposals) is logged with timestamps
- **Dashboard auth** -- Password-protected with signed session cookies

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
│   │   └── telegram.ts       # grammY multi-bot management
│   ├── web/
│   │   ├── server.ts         # Hono dashboard server + auth
│   │   ├── views/layout.ts   # Dashboard HTML template
│   │   └── routes/           # Dashboard pages
│   ├── db/
│   │   ├── index.ts          # SQLite + sqlite-vec init
│   │   └── schema.ts         # Table migrations
│   ├── security/
│   │   ├── crypto.ts         # AES-256-GCM encryption
│   │   └── rate-limiter.ts   # Request rate limiting
│   ├── skills/
│   │   ├── manager.ts        # Skill CRUD
│   │   ├── loader.ts         # Skills-to-tools converter
│   │   └── types.ts          # Skill metadata schema
│   ├── bus/
│   │   ├── message-bus.ts    # Inter-agent messaging
│   │   └── types.ts          # Bus types
│   ├── container/
│   │   └── docker.ts         # Docker API client
│   └── util/
│       └── zod-to-json.ts    # Zod v4 JSON Schema converter
├── container/
│   ├── Dockerfile            # Sandbox container (Node.js + common tools)
│   ├── Dockerfile.browser    # Browser container (Playwright + Chromium)
│   └── browser-script.js     # Browser automation script
├── scripts/
│   ├── setup.sh              # One-command setup
│   ├── install-service.sh    # Autostart service installer (launchd/systemd)
│   └── setup-tunnel.sh       # Cloudflare Tunnel helper
├── docker-compose.yml        # Container image builder
├── package.json
├── tsconfig.json
└── .env.example
```

## Tech Stack

- **Runtime**: Node.js 22+ / TypeScript
- **LLM**: Anthropic SDK, OpenAI SDK, Google GenAI SDK (direct, no abstraction layer)
- **Telegram**: grammY
- **Database**: better-sqlite3 + sqlite-vec (vector search)
- **Embeddings**: @huggingface/transformers (local ONNX, all-MiniLM-L6-v2)
- **Containers**: dockerode (Docker API client)
- **Dashboard**: Hono + HTMX
- **MCP**: @modelcontextprotocol/sdk
- **Scheduling**: node-cron
- **Validation**: Zod v4

## License

MIT
