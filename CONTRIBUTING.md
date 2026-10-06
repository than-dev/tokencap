# Contributing to TokenCap

First off, thank you for considering contributing to TokenCap! TokenCap is built to protect the AI developer community from runaway billing and infinite agent loops.

---

## 🛠️ Development Setup

### Prerequisites
* **Node.js:** `>= 20.0.0`
* **npm:** `>= 10.0.0`

### Setup Steps
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/tokencap/tokencap.git
   cd tokencap
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Prepare your local configuration:
   ```bash
   cp tokencap.example.json tokencap.json
   ```

4. Run the development server with live reload:
   ```bash
   npm run dev
   ```

---

## 🧪 Testing & Code Quality

Before opening a pull request, ensure all checks pass:

```bash
# 1. Typecheck
npm run typecheck

# 2. Lint & format checks (Biome)
npm run lint

# 3. Auto-format code
npm run format

# 4. Run automated test suite
npm test
```

### Writing Tests
* Tests live under `test/` using the native Node.js test runner (`node:test` and `node:assert`).
* Keep tests high-signal, deterministic, and fast (the entire suite executes in < 500ms).
* Avoid redundant tests: test discrete business invariants (budget calculations, retry headers, circuit breakers, security guards).

---

## 📋 Git Commit Guidelines

We follow Conventional Commits format in English:
* `feat: ...` for new features (e.g. `feat: add provider fallback`)
* `fix: ...` for bug fixes (e.g. `fix: prevent race condition in rolling window`)
* `test: ...` for tests
* `docs: ...` for documentation
* `chore: ...` for maintenance and dependency updates

---

## 📜 License

By contributing to TokenCap, you agree that your contributions will be licensed under its [MIT License](LICENSE).
