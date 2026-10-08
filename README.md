# 🛡️ TokenCap

> **The open-source safety seatbelt for autonomous AI agents.**  
> Enforce hard caps, rolling-window limits, and multi-provider protection against infinite loops and runaway credit card bills.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/tokencap/tokencap/actions/workflows/ci.yml/badge.svg)](.github/workflows/ci.yml)
[![Node: >=20](https://img.shields.io/badge/Node->=20-brightgreen.svg)](package.json)
[![Docker: Ready](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](Dockerfile)
[![Self-Hosted](https://img.shields.io/badge/Self--Hosted-SQLite-blueviolet.svg)](src/db/store.ts)
[![Tests: 31 Passing](https://img.shields.io/badge/Tests-31%20Passing-success.svg)](test/)
[![Console: Ready](https://img.shields.io/badge/Console-localhost:8787-ember.svg)](http://localhost:8787/dashboard)
[![llms.txt](https://img.shields.io/badge/llms.txt-Standard-blue)](llms.txt)

---

## 💥 The Problem

Autonomous agents (like Google Antigravity, AutoGPT, Claude Code, CrewAI, Cline, and custom scripts) can fail silently:
* They enter **recursive reasoning loops** attempting to fix the same error repeatedly.
* A broken tool or regex causes **hundreds of consecutive API calls in minutes**.
* You leave an agent running overnight, and wake up to **$500–$2,000+ charged to your credit card**.

Traditional FinOps tools (Portkey, LiteLLM, Helicone) are often hosted cloud platforms, expensive, or complex to configure.

## 🛡️ The Solution: TokenCap

TokenCap is a **lightweight, self-hosted reverse proxy** that sits between your agents and your AI providers on `localhost:8787` (or inside your private network/Docker stack):

```
┌─────────────────┐       Virtual Key       ┌──────────────────────┐       Real API Key       ┌─────────────────┐
│                 │  http://localhost:8787  │      TokenCap        │  https://api.openai.com  │                 │
│  AI Agent / CLI ├────────────────────────►│  (Checks SQLite Cap) ├─────────────────────────►│  Model Provider │
│  (Antigravity,  │◄────────────────────────┤                      │◄─────────────────────────┤ (OpenAI, Claude,│
│   Claude, etc.) │   429 Too Many Requests │  • Rolling: $0.50/h  │     SSE Token Stream     │     Gemini)     │
└─────────────────┘   (If budget exceeded)  │  • Daily:   $5.00/d  │                          └─────────────────┘
                                            │  • Monthly: $50.00/m │
                                            └──────────┬───────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │ tokencap.sqlite  │
                                              │  (Local Ledger)  │
                                              └──────────────────┘
```

1. **Zero External Latency:** Evaluates budget in microseconds using local SQLite (`better-sqlite3`).
2. **Transparent Proxy:** Works out of the box with standard SDKs by simply changing `BASE_URL`.
3. **Hard Stop via HTTP 429:** When a budget cap is reached, TokenCap returns a standard `429 Too Many Requests`. SDKs and agents recognize this and halt gracefully without throwing fatal errors.
4. **Streaming Accounting:** Parses Server-Sent Events (SSE) in real time, calculating input and output costs on the fly without breaking streaming UI responsiveness.
5. **No Cloud Dependencies:** No vendor lock-in, no telemetry, no Cloudflare accounts needed.

---

## ⚡ Quick Start

### Option 1: NPX / Global CLI (Fastest — Zero Setup)

Run immediately with zero setup:
```bash
npx tokencap --open
```

Or install globally to use anywhere as a system command:
```bash
npm install -g tokencap

# 1. Initialize starter configuration and environment:
tokencap init

# 2. Start proxy and open command console in browser:
tokencap --open

# 3. Custom parameters:
tokencap --port 9000 --config ./my-budget.json --db ./vault.sqlite
```

**CLI Options & Parameters:**
| Flag / Option | Description | Default |
| :--- | :--- | :--- |
| `-p, --port <number>` | Port to listen on | `8787` (or `$PORT`) |
| `-H, --host <string>` | Host interface to bind to | `0.0.0.0` |
| `-c, --config <path>` | Path to `tokencap.json` / YAML | `./tokencap.json` |
| `-d, --db <path>` | Path to SQLite database file | `./tokencap.sqlite` |
| `-o, --open` | Automatically open browser console | `false` |
| `--user <string>` | Dashboard username | `admin` (or `$TOKENCAP_DASHBOARD_USER`) |
| `--pass <string>` | Dashboard password | `admin` (or `$TOKENCAP_DASHBOARD_PASSWORD`) |
| `tokencap init` | Create starter config & `.env` | Current directory |
| `tokencap status` | Check running instance health | `http://localhost:8787/health` |
| `tokencap reset <key>` | Reset spent balance for virtual key | Purges SQLite usage records |

---

### Option 2: Docker Compose (Production & Containers)

1. Clone this repository:
   ```bash
   git clone https://github.com/tokencap/tokencap.git
   cd tokencap
   ```

2. Create your configuration from the template:
   ```bash
   cp tokencap.example.json tokencap.json
   ```

3. Edit `tokencap.json` with your real provider keys and budget limits.

4. Start TokenCap:
   ```bash
   docker compose up -d
   ```

5. Verify health:
   ```bash
   curl http://localhost:8787/health
   # Response: {"status":"ok","service":"tokencap","timestamp":1728140000000}
   ```

---

### Option 2: Docker CLI

```bash
docker build -t tokencap .

docker run -d \
  --name tokencap \
  -p 8787:8787 \
  -v $(pwd)/tokencap.json:/app/tokencap.json \
  -v $(pwd)/tokencap.sqlite:/app/tokencap.sqlite \
  --restart unless-stopped \
  tokencap
```

---

### Option 3: Local Node.js / Bun

```bash
npm install
cp tokencap.example.json tokencap.json
# Edit tokencap.json

npm run build
npm start
# Or for development with live reload:
npm run dev
```

---

### Option 4: "Plug & Play" Embedded Decorator (For Node.js Backends)

Se você precisa limitar as requisições de IA diretamente na sua aplicação sem rodar um proxy separado, você pode usar os interceptors nativos do TokenCap. O motor de validação roda localmente de forma invisível.

#### 1. Envelopando SDKs Oficiais (OpenAI / Anthropic)
O `withTokenCap` pega a instância original do SDK e intercepta a requisição interna, resolvendo todo o fluxo financeiro silenciosamente.

```typescript
import { withTokenCap } from 'tokencap';
import OpenAI from 'openai';

// O Decorator intercepta a requisição e gerencia os limites de forma local
const openai = withTokenCap(new OpenAI(), { 
  user: 'usr_123', 
  budgetMode: 'tokens', 
  dailyCap: 100000 
});

// A chamada segue idêntica à oficial. Se o limite estourar, 
// o wrapper bloqueia antes de bater na rede e lança um 429 nativo do SDK.
const response = await openai.chat.completions.create({ model: 'gpt-4o', ... });
```

#### 2. Interceptor Nativo para Axios (Dynamic Context)
Para quem usa o Axios globalmente, exportamos interceptadores limpos. O client global é instanciado uma única vez, e o contexto flui a cada requisição:

```typescript
import axios from 'axios';
import { applyTokenCapInterceptor } from 'tokencap';

const api = axios.create();
applyTokenCapInterceptor(api);

// Na controller da aplicação:
await api.post('https://api.openai.com/v1/chat/completions', data, {
  // Passa o contexto na hora da chamada, sem recriar o client!
  tokencap: { user: req.user.id, dailyCap: 10000 } 
});
```

#### 3. Motor Raw Fetch (Dynamic Context)
Caso você construa suas chamadas manualmente, exportamos a factory `createTokenCapFetch`. Igual ao Axios, você pode instanciar um `fetch` global e passar a identidade apenas no momento da requisição usando a propriedade estendida `tokencap`:

```typescript
import { createTokenCapFetch } from 'tokencap';

// Instanciado uma única vez na sua base de código
const myFetch = createTokenCapFetch();

// Na controller da aplicação:
const res = await myFetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ ... }),
  tokencap: { user: req.user.id, dailyCap: 50000 } // O contexto flui aqui!
});
```

---

## ⚙️ Configuration Reference (`tokencap.json`)

TokenCap configuration lives in `tokencap.json` (or `tokencap.yaml`):

```json
{
  "port": 8787,
  "keys": {
    "my_virtual_key_dev": {
      "provider": "openai",
      "realKey": "sk-proj-YOUR_REAL_OPENAI_API_KEY",
      "hardCapDaily": 5.0,
      "hardCapMonthly": 50.0,
      "rollingWindowCap": 0.5,
      "rollingWindowSeconds": 3600,
      "autoPacing": {
        "enabled": true,
        "maxHoldSeconds": 30
      },
      "alertsEnabled": true,
      "webhookUrl": "https://discord.com/api/webhooks/YOUR/WEBHOOK",
      "alertThresholdPercent": 0.8
    },
    "my_virtual_claude_key": {
      "provider": "anthropic",
      "realKey": "sk-ant-api03-YOUR_REAL_CLAUDE_KEY",
      "hardCapDaily": 10.0,
      "hardCapMonthly": 100.0,
      "rollingWindowCap": 1.5,
      "rollingWindowSeconds": 3600,
      "autoPacing": {
        "enabled": true,
        "maxHoldSeconds": 45
      }
    },
    "my_virtual_gemini_key": {
      "provider": "google",
      "realKey": "AIzaSyYOUR_REAL_GEMINI_KEY",
      "hardCapDaily": 3.0,
      "hardCapMonthly": 30.0,
      "rollingWindowCap": 0.5,
      "rollingWindowSeconds": 1800
    }
  }
}
```

### Configuration Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `port` | `number` | Server port (default `8787`, can be overridden by `PORT` env var). |
| `keys` | `object` | Map of Virtual Keys to provider configuration. |
| `provider` | `string` | One of `"openai"`, `"anthropic"`, or `"google"`. |
| `realKey` | `string` | Your real upstream provider API key. Kept secure on your host. |
| `budgetMode` | `string` | *(Optional)* `'usd'` (default) or `'tokens'`. If `'tokens'`, caps apply to raw token counts. |
| `hardCapDaily` | `number` | Maximum allowed spend (or tokens) from 00:00 UTC to 23:59 UTC. |
| `hardCapMonthly` | `number` | Maximum allowed spend (or tokens) within the current calendar month. |
| `rollingWindowCap` | `number` | Maximum spend (or tokens) allowed within the sliding window. |
| `rollingWindowSeconds` | `number` | Duration of the sliding window in seconds (e.g. `3600` for 1 hour). |
| `autoPacing` | `object` | *(Optional)* Cruise Control configuration (see below). |
| `autoPacing.enabled` | `boolean` | *(Optional)* If `true`, pauses short bursts transparently without failing with 429. |
| `autoPacing.maxHoldSeconds` | `number` | *(Optional)* Max delay in seconds to hold request (default `30`s). |
| `loopBuster` | `object` | *(Optional)* Circuit breaker against infinite repetition loops (see below). |
| `loopBuster.enabled` | `boolean` | *(Optional)* Set to `true` to detect agent flapping loops. |
| `loopBuster.maxRepeats` | `number` | *(Optional)* Number of identical turns triggering breaker (default `3`). |
| `loopBuster.windowSeconds` | `number` | *(Optional)* Sliding detection window in seconds (default `120`s). |
| `alertsEnabled` | `boolean` | *(Optional)* Set to `true` to dispatch webhook alerts. |
| `webhookUrl` | `string` | *(Optional)* Discord, Slack or custom webhook URL. |
| `alertThresholdPercent`| `number` | *(Optional)* Fraction of cap triggering alert (default `0.8` = 80%). |

---

## 🚦 Cruise Control & Auto-Pacing (Self-Regulating Agents)

When running agents unattended overnight, traditional gateways fail hard with an error, killing the agent process after 15 minutes. 

TokenCap solves this with **Cruise Control**:
1. **Intelligent HTTP `Retry-After`:** When a cap is hit, TokenCap scans past token usage and computes the exact millisecond when the oldest records slide out of the rolling window, returning `Retry-After: <seconds>` and a timestamp `resetsAt`.
2. **Transparent Micro-Pacing (`autoPacing`):** If an agent experiences a temporary burst and the cooldown is under `maxHoldSeconds` (e.g. 10–30s), TokenCap **holds the connection** and forwards the request as soon as balance frees up. Your agent never crashes and never gets an error.
3. **Budget Refill Webhooks:** If configured with `webhookUrl`, TokenCap schedules an automatic wake-up callback the moment your budget window reopens so your orchestrators can resume tasks.

---

## 🔁 Loop Buster (Agent Flapping Circuit Breaker)

One of the most insidious ways agents burn money is **repetitive flapping**: an agent runs a tool (e.g. `bash: npm test`), receives an error, and without changing its logic, retries the exact same command 10 or 20 times in a row.

TokenCap's **Loop Buster** stops this in its tracks:
1. **Cryptographic Turn Signature:** Computes a SHA-256 fingerprint of the latest conversation turn (last 2 messages, including tool calls and error outputs).
2. **Instant Circuit Breaker:** If the identical action signature repeats `maxRepeats` times (default: 3) within `windowSeconds` (default: 120s), TokenCap **immediately cuts the connection with an OpenAI-compatible 429**:
   ```json
   {
     "error": {
       "message": "TokenCap Loop Buster: Infinite agent loop detected. The last action signature was repeated 3 times within 120s without progress.",
       "type": "loop_detected",
       "code": "circuit_breaker_tripped",
       "param": null,
       "repeats": 3
     },
     "repeats": 3
   }
   ```
3. **Saves Budget Before Caps Are Hit:** Unlike spending limits that wait until your money is gone, Loop Buster trips **the moment zero progress is detected**, preserving your budget for real work.

---

## 🔌 Integration Guides

TokenCap acts as a drop-in transparent proxy. You **never** need to modify library source code—only set the base URL and pass your virtual key.

### 1. Google Antigravity (AGY)

When running agents with Google Antigravity, override the base URL and API key in your terminal session or `.env`:

```bash
# Point OpenAI calls from AGY through TokenCap
export OPENAI_API_KEY="my_virtual_key_dev"
export OPENAI_BASE_URL="http://localhost:8787/v1"

# Run your AGY agent with total budget safety
agy run my_complex_task
```

If using Gemini models with Antigravity:
```bash
export GEMINI_API_KEY="my_virtual_gemini_key"
export GEMINI_BASE_URL="http://localhost:8787"
```

---

### 2. OpenAI Official SDKs

#### Python
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key="my_virtual_key_dev" # Virtual key defined in tokencap.json
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

#### TypeScript / Node.js
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:8787/v1',
  apiKey: 'my_virtual_key_dev',
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Explain quantum computing in one sentence.' }],
});

console.log(response.choices[0].message.content);
```

---

### 3. Anthropic Claude & Claude Code

#### Claude Code CLI

**Option A: Global Terminal**
```bash
export ANTHROPIC_BASE_URL="http://localhost:8787"
export ANTHROPIC_API_KEY="my_virtual_claude_key"

claude "Refactor the payment authentication module"
```

**Option B: Project Config (`.claude/settings.json`)**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8787",
    "ANTHROPIC_API_KEY": "my_virtual_claude_key"
  }
}
```

#### Python (`anthropic-sdk`)
```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:8787",
    api_key="my_virtual_claude_key"
)

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello Claude"}]
)
print(message.content[0].text)
```

---

### 4. Google Gemini (REST & SDK)

TokenCap intercepts `/v1beta/*` endpoints and injects your real Gemini API key securely.

#### Python (`google-generativeai`)
```python
import google.generativeai as genai

# Pass your virtual key
genai.configure(
    api_key="my_virtual_gemini_key",
    client_options={"api_endpoint": "http://localhost:8787"}
)

model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content("Analyze this budget dataset.")
print(response.text)
```

#### cURL
```bash
curl "http://localhost:8787/v1beta/models/gemini-1.5-flash:generateContent" \
  -H "x-goog-api-key: my_virtual_gemini_key" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello!"}]}]}'
```

---

### 5. Autonomous Frameworks & IDEs

| Client / Tool | How to Configure |
| :--- | :--- |
| **Cursor / Windsurf** | Settings → Models → OpenAI API Base: `http://localhost:8787/v1` |
| **Cline / Roo Code** | Provider: `OpenAI Compatible` → Base URL: `http://localhost:8787/v1` |
| **AutoGPT / CrewAI** | `export OPENAI_BASE_URL="http://localhost:8787/v1"` |
| **LangChain (Python)** | `ChatOpenAI(base_url="http://localhost:8787/v1", api_key="...")` |
| **LlamaIndex** | `OpenAI(api_base="http://localhost:8787/v1", api_key="...")` |
| **Google Antigravity (AGY)** | `export GEMINI_BASE_URL="http://localhost:8787"` |
| **Ollama / Local Inference** | Point client API Base to `http://localhost:8787/v1` as OpenAI Compatible |
| **Codex / Copilot Plugins** | Override API Endpoint URL with `http://localhost:8787/v1` |

---

## 💰 Supported Models & Pricing Matrix

TokenCap continuously tracks token usage and converts it to USD according to official provider rate sheets:

| Provider | Models Included | Fallback Tier |
| :--- | :--- | :--- |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`, `o1`, `o1-mini`, `o3-mini` | Automatic `gpt-4o` rate |
| **Anthropic** | `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus`, `claude-3-haiku` | Automatic `claude-3-5-sonnet` rate |
| **Google** | `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro` | Automatic `gemini-1.5-pro` rate |

*Unlisted or custom model names automatically map to the provider's fallback tier, guaranteeing that unknown models are never treated as free ($0.00) and will always count toward your budget safety limit.*

---

## 🚨 What Happens When a Budget is Exceeded?

When your agent hits 100% of its rolling window or hard cap:

1. TokenCap **blocks** the request before it reaches OpenAI/Anthropic/Google.
2. It responds with **`HTTP 429 Too Many Requests`** following the standard OpenAI error envelope:
   ```json
   {
     "error": {
       "message": "TokenCap Budget Exceeded: Rolling Window",
       "type": "insufficient_quota",
       "code": "rate_limit_exceeded",
       "param": null,
       "retryAfterSeconds": 45,
       "resetsAt": "2026-10-05T21:00:00.000Z"
     },
     "retryAfterSeconds": 45,
     "resetsAt": "2026-10-05T21:00:00.000Z"
   }
   ```
   Headers returned include:
   * `Retry-After: 45`
   * `x-ratelimit-reset-requests: 45`
   * `x-request-id: tokencap_uuid`
3. If webhooks are configured, a notification is dispatched to Slack/Discord:
   > 🚨 **TokenCap Alert**: Rolling window usage reached $0.5023 (Cap: 0.50) for key `my_virtual_key_dev`.
4. The agent halts gracefully. Your real API key is never billed again until the window resets or the daily limit rolls over.

---

## 🌐 Production & Cloud Deployment

TokenCap can run on any Docker host or cloud VPS (Hetzner, DigitalOcean, Railway, Fly.io, Render, Coolify).

### Critical: Persistent Storage
TokenCap stores usage records in SQLite (`tokencap.sqlite`). When deploying in containers:
* **Always mount a persistent volume** to `/app/tokencap.sqlite` and `/app/tokencap.json`.
* Without persistent storage, container restarts will reset accumulated usage counters.

### System & Discovery Endpoints
* `GET /health` → Returns `HTTP 200` (`{"status":"ok","service":"tokencap","timestamp":...}`) for orchestrator liveness probes.
* `GET /v1/models` (or `/models`) → Returns standard OpenAI model catalog for IDE autodiscovery (Cursor, Cline, Roo Code, LibreChat).
* `GET /` → Returns `HTTP 200` status (or redirects to `/dashboard` in browser).

---

## 📊 Local Command Console (Dashboard)

TokenCap includes a built-in, lightweight web console served directly with the application on:
👉 **`http://localhost:8787/dashboard`** (or open `http://localhost:8787` in any browser)

* **Protected Console Access:** Authenticate via credentials defined in your `.env` file (`TOKENCAP_DASHBOARD_USER` and `TOKENCAP_DASHBOARD_PASSWORD`, defaulting to `admin`/`admin` if unset). Stateless HMAC-signed session cookies keep the console secure.
* **Live Spend Tracking:** Real-time metrics for today's spend, month-to-date totals, and active in-flight calls.
* **Key Control Center:** Visual indicators of daily & sliding-window budget consumption per agent with auto-pacing status.
* **Live Interceptions Ledger:** Chronological feed of the last 20 intercepted transactions recorded in SQLite WAL.
* **Instant Key Configuration:** Add, edit, or reset virtual keys directly from the UI without manual file editing.
* **Zero Overhead:** Pure HTML/CSS/JS served directly with zero external dependencies and zero telemetry.

---

## 🔒 Security Best Practices

1. **Keep `tokencap.json` Secret:** `tokencap.json` contains your real API keys. It is already added to [`.gitignore`](.gitignore) and [`.dockerignore`](.dockerignore). Never commit it to version control.
2. **Use Virtual Keys in Code:** Only distribute virtual keys (e.g. `dev_agent_01`) to agent environments and development machines.
3. **Run on Internal Networks:** Bind TokenCap to `localhost:8787` or keep it inside a private Docker bridge network (`127.0.0.1:8787`). If exposing to the public internet, place it behind an HTTPS reverse proxy (Caddy/Nginx) with additional IP whitelisting or basic auth.

---

## 🧪 Development & Testing

TokenCap uses Node's native test runner with zero mock dependencies for maximum speed and deterministic verification:

```bash
# Typecheck
npm run typecheck

# Code formatting and linting (Biome)
npm run lint

# Auto-format
npm run format

# Run the complete test suite (routes, budgets, pacing, loop buster)
npm test

# Build TypeScript to dist/
npm run build
```

---

## 🤝 Contributing & Security

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Security Policy](SECURITY.md) before opening a pull request or submitting an issue.

---

## 📄 License

TokenCap is open-source software licensed under the [MIT License](LICENSE).

