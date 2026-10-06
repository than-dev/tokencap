# Security Policy

## Reporting Security Issues

We take the security of TokenCap seriously. Because TokenCap acts as a reverse proxy managing upstream API credentials (OpenAI, Anthropic, Google), maintaining a minimal attack surface and zero leaks is paramount.

If you believe you have found a security vulnerability, please **do not** open a public issue.

Instead, please report it privately:
* **Email:** `security@tokencap.dev` (or open a private security advisory on GitHub).
* Include a description of the issue, reproduction steps, and potential impact.

You will receive an acknowledgment within 48 hours.

---

## Security Guarantees of TokenCap

1. **Local-Only Credential Isolation:**
   * Your real API keys (`sk-...`) remain exclusively on your local host / container filesystem in `tokencap.json`.
   * They are never logged, never exposed to agent runtimes, and never sent to third-party finops or analytics servers.
2. **Virtual Keys Swap In-Flight:**
   * Agents execute with a dummy virtual key (e.g. `tokencap_sk_agent`).
   * If an agent process is compromised or dumps its environment variables, your real provider credentials are safe.
3. **SSRF Protection:**
   * Webhook notifications require HTTPS or loopback addresses. Private cloud metadata addresses (`169.254.169.254`) and internal subnets are blocked.
4. **Local SQLite Ledger:**
   * Accounting and rate limits are evaluated synchronously in local SQLite with parameterized queries, immune to SQL injection.
