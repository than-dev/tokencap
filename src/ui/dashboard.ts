export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TokenCap — Command Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --abyss: #070B13;
      --obsidian: #0B0F17;
      --card-bg: #0D131F;
      --card-hover: #111929;
      --silver: #8C929D;
      --iron: #1E2533;
      --bone: #E5E7EB;
      --ember: #B8864B;
      --rust: #A4472F;
      --green: #34D399;
      --border: rgba(90, 94, 101, 0.22);
      --border-focus: rgba(184, 134, 75, 0.5);
      --title: "Cinzel", serif;
      --mono: "Geist Mono", monospace;
      --sans: "Geist", system-ui, sans-serif;
      --display: "Space Grotesk", sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--abyss);
      color: var(--bone);
      font: 300 0.95rem/1.6 var(--sans);
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Film grain texture */
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99;
      opacity: 0.04;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    }

    header.topbar {
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(7, 11, 19, 0.85);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .brand {
      display: flex;
      align-items: baseline;
      gap: 0.9rem;
    }

    .brand h1 {
      margin: 0;
      font: 500 1.25rem/1 var(--title);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--bone);
    }

    .brand span.tag {
      font: 500 0.68rem/1 var(--mono);
      letter-spacing: 0.18em;
      color: var(--ember);
      border: 1px solid rgba(184, 134, 75, 0.35);
      padding: 0.2rem 0.5rem;
      border-radius: 2px;
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 1.2rem;
    }

    .pulse-indicator {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font: 400 0.72rem/1 var(--mono);
      color: var(--silver);
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .btn {
      font: 500 0.78rem/1 var(--mono);
      color: var(--bone);
      background: rgba(18, 24, 38, 0.75);
      border: 1px solid var(--border);
      padding: 0.6rem 1.1rem;
      border-radius: 2px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn:hover {
      border-color: var(--ember);
      color: var(--ember);
      background: rgba(184, 134, 75, 0.08);
    }
    .btn-primary {
      background: rgba(184, 134, 75, 0.16);
      border-color: rgba(184, 134, 75, 0.45);
      color: var(--bone);
    }
    .btn-primary:hover {
      background: rgba(184, 134, 75, 0.3);
      border-color: var(--ember);
    }

    main.container {
      max-width: 1240px;
      margin: 0 auto;
      padding: 2.5rem 2rem 4rem;
      width: 100%;
      flex: 1;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 1.4rem 1.5rem;
      border-radius: 3px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
    }
    .kpi-label {
      font: 500 0.68rem/1 var(--mono);
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--silver);
      margin-bottom: 0.6rem;
    }
    .kpi-value {
      font: 700 1.85rem/1.1 var(--display);
      color: var(--bone);
      letter-spacing: -0.02em;
    }
    .kpi-value.ember { color: var(--ember); }
    .kpi-sub {
      margin-top: 0.5rem;
      font: 400 0.72rem/1 var(--mono);
      color: var(--silver);
    }

    /* Section Headers */
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin: 2.5rem 0 1.2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
    }
    .section-title {
      font: 600 0.95rem/1 var(--mono);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--bone);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .section-title span.slash { color: var(--ember); }

    /* Keys Table / Cards */
    .keys-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .key-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 1.5rem 1.75rem;
      display: grid;
      grid-template-columns: 1.4fr 1.3fr 1.3fr auto;
      gap: 1.5rem;
      align-items: center;
      transition: border-color 0.2s, background 0.2s;
    }
    .key-card:hover {
      border-color: rgba(90, 94, 101, 0.45);
      background: var(--card-hover);
    }

    .key-meta h3 {
      margin: 0 0 0.35rem;
      font: 600 1.05rem/1.2 var(--mono);
      color: var(--bone);
      word-break: break-all;
    }
    .provider-pill {
      display: inline-block;
      font: 500 0.65rem/1 var(--mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0.25rem 0.55rem;
      border-radius: 2px;
      background: rgba(30, 37, 51, 0.8);
      color: var(--silver);
      border: 1px solid var(--border);
    }
    .provider-openai { border-color: rgba(52, 211, 153, 0.3); color: #6ee7b7; }
    .provider-anthropic { border-color: rgba(212, 163, 115, 0.35); color: #e9c49a; }
    .provider-google { border-color: rgba(96, 165, 250, 0.3); color: #93c5fd; }

    /* Progress bars */
    .metric-col {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .metric-header {
      display: flex;
      justify-content: space-between;
      font: 400 0.72rem/1 var(--mono);
      color: var(--silver);
    }
    .progress-track {
      height: 5px;
      background: var(--iron);
      border-radius: 1px;
      overflow: hidden;
      position: relative;
    }
    .progress-fill {
      height: 100%;
      background: var(--ember);
      transition: width 0.4s ease;
    }
    .progress-fill.danger { background: var(--rust); }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font: 500 0.72rem/1 var(--mono);
      padding: 0.35rem 0.75rem;
      border-radius: 2px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .status-active {
      background: rgba(52, 211, 153, 0.12);
      color: var(--green);
      border: 1px solid rgba(52, 211, 153, 0.3);
    }
    .status-capped {
      background: rgba(164, 71, 47, 0.15);
      color: #f87171;
      border: 1px solid rgba(164, 71, 47, 0.4);
    }

    /* Live Activity Table */
    .table-wrapper {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow-x: auto;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font: 400 0.8rem/1.5 var(--mono);
      text-align: left;
    }
    table.data-table th {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--border);
      font-weight: 500;
      color: var(--silver);
      letter-spacing: 0.1em;
      font-size: 0.7rem;
      text-transform: uppercase;
      background: rgba(11, 15, 23, 0.5);
    }
    table.data-table td {
      padding: 0.8rem 1.25rem;
      border-bottom: 1px solid rgba(90, 94, 101, 0.12);
      color: rgba(229, 231, 235, 0.85);
    }
    table.data-table tr:last-child td { border-bottom: none; }
    table.data-table tr:hover td { background: rgba(255, 255, 255, 0.02); }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(4, 7, 12, 0.85);
      backdrop-filter: blur(8px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .modal-overlay.open { display: flex; }
    .modal-card {
      background: var(--obsidian);
      border: 1px solid rgba(184, 134, 75, 0.35);
      box-shadow: 0 25px 70px -15px rgba(0, 0, 0, 0.9);
      width: 100%;
      max-width: 540px;
      border-radius: 3px;
      padding: 2rem;
    }
    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
    }
    .modal-head h2 {
      margin: 0;
      font: 600 1.1rem/1 var(--title);
      letter-spacing: 0.12em;
      color: var(--bone);
    }
    .form-group {
      margin-bottom: 1.25rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.4rem;
      font: 500 0.72rem/1 var(--mono);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--silver);
    }
    .form-control {
      width: 100%;
      background: #060910;
      border: 1px solid var(--border);
      color: var(--bone);
      font: 400 0.85rem/1.4 var(--mono);
      padding: 0.65rem 0.85rem;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.2s;
    }
    .form-control:focus {
      border-color: var(--ember);
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .modal-foot {
      display: flex;
      justify-content: flex-end;
      gap: 0.8rem;
      margin-top: 1.75rem;
    }

    footer.bottom-info {
      border-top: 1px solid var(--border);
      padding: 1.5rem 2rem;
      font: 400 0.72rem/1.5 var(--mono);
      color: var(--silver);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--obsidian);
    }

    @media (max-width: 860px) {
      .key-card { grid-template-columns: 1fr; gap: 1rem; }
      header.topbar { flex-direction: column; align-items: flex-start; gap: 1rem; }
      .form-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <h1>TokenCap</h1>
      <span class="tag">CONSOLE</span>
    </div>
    <div class="top-actions">
      <div class="pulse-indicator">
        <span class="pulse-dot"></span>
        <span id="sync-status">SYNCED</span>
      </div>
      <button class="btn btn-primary" onclick="openKeyModal()">+ Add Virtual Key</button>
      <a class="btn" href="/llms.txt" target="_blank">llms.txt</a>
      <button class="btn" onclick="handleLogout()" style="border-color: rgba(164, 71, 47, 0.4); color: #f87171;">Logout</button>
    </div>
  </header>

  <main class="container">
    <!-- KPI Overview -->
    <div class="stats-bar" style="display: flex; gap: 3rem; margin-bottom: 3rem; padding: 1.5rem; background: var(--card-bg); border: 1px solid var(--border); border-radius: 3px;">
      <div>
        <div style="font: 500 0.68rem/1 var(--mono); color: var(--silver); text-transform: uppercase; letter-spacing: 0.16em;">Today Spend</div>
        <div class="ember" id="kpi-today" style="font: 700 1.5rem/1.2 var(--display); margin-top: 0.5rem;">$0.0000</div>
      </div>
      <div>
        <div style="font: 500 0.68rem/1 var(--mono); color: var(--silver); text-transform: uppercase; letter-spacing: 0.16em;">Month Spend</div>
        <div id="kpi-month" style="font: 700 1.5rem/1.2 var(--display); color: var(--bone); margin-top: 0.5rem;">$0.0000</div>
      </div>
      <div>
        <div style="font: 500 0.68rem/1 var(--mono); color: var(--silver); text-transform: uppercase; letter-spacing: 0.16em;">Virtual Keys</div>
        <div id="kpi-keys-count" style="font: 700 1.5rem/1.2 var(--display); color: var(--bone); margin-top: 0.5rem;">0</div>
      </div>
      <div>
        <div style="font: 500 0.68rem/1 var(--mono); color: var(--silver); text-transform: uppercase; letter-spacing: 0.16em;">Uptime</div>
        <div id="kpi-uptime" style="font: 700 1.5rem/1.2 var(--display); color: var(--bone); margin-top: 0.5rem;">0s</div>
      </div>
    </div>

    <!-- Virtual Keys Roster -->
    <div class="section-head">
      <div class="section-title">
        Virtual Keys &amp; Budget Limits
      </div>
      <span style="font: 400 0.72rem var(--mono); color: var(--silver);">Real keys shielded upstream</span>
    </div>

    <div class="keys-grid" id="keys-list">
      <!-- Injected dynamically via JS -->
      <div style="padding: 2rem; text-align: center; color: var(--silver); font-family: var(--mono);">Loading active keys...</div>
    </div>

    <!-- Live Transaction Ledger -->
    <div class="section-head" style="margin-top: 3.5rem;">
      <div class="section-title">
        Recent Interceptions Ledger
      </div>
      <span style="font: 400 0.72rem var(--mono); color: var(--silver);">Last 20 transactions</span>
    </div>

    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Virtual Key</th>
            <th>Cost (USD)</th>
            <th>Action / Status</th>
          </tr>
        </thead>
        <tbody id="recent-table-body">
          <tr>
            <td colspan="4" style="text-align: center; color: var(--silver); padding: 2rem;">No usage transactions recorded yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>

  <!-- Add Key Modal -->
  <div class="modal-overlay" id="key-modal" onclick="if(event.target===this) closeKeyModal()">
    <div class="modal-card">
      <div class="modal-head">
        <h2>Configure Virtual Key</h2>
        <button class="btn" style="padding: 0.2rem 0.5rem;" onclick="closeKeyModal()">✕</button>
      </div>
      <form id="key-form" onsubmit="handleSaveKey(event)">
        <div class="form-group">
          <label>Virtual Key Name (Identifier for Agent)</label>
          <input type="text" id="input-key" class="form-control" placeholder="e.g. tokencap_sk_coder_agent" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Provider</label>
            <select id="input-provider" class="form-control" required>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google Gemini</option>
            </select>
          </div>
          <div class="form-group">
            <label>Real API Key</label>
            <input type="password" id="input-realKey" class="form-control" placeholder="sk-proj-... or \${ENV_VAR}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Rolling Window Cap ($)</label>
            <input type="number" step="0.01" id="input-rollingCap" class="form-control" placeholder="0.50" required />
          </div>
          <div class="form-group">
            <label>Rolling Window (Seconds)</label>
            <input type="number" id="input-rollingSeconds" class="form-control" value="3600" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Daily Hard Cap ($)</label>
            <input type="number" step="0.01" id="input-dailyCap" class="form-control" placeholder="5.00" required />
          </div>
          <div class="form-group">
            <label>Monthly Hard Cap ($)</label>
            <input type="number" step="0.01" id="input-monthlyCap" class="form-control" placeholder="50.00" required />
          </div>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem;">
          <input type="checkbox" id="input-pacing" checked style="accent-color: var(--ember); width: 16px; height: 16px;" />
          <label for="input-pacing" style="margin: 0; cursor: pointer;">Enable Cruise Control / Auto-Pacing (holds short bursts up to 30s)</label>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" onclick="closeKeyModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Key to tokencap.json</button>
        </div>
      </form>
    </div>
  </div>

  <footer class="bottom-info">
    <div>TokenCap Engine · Zero External Telemetry · Local Ledger</div>
    <div>Config file: <code>./tokencap.json</code></div>
  </footer>

  <script>
    function formatMoney(num) {
      return '$' + Number(num || 0).toFixed(4);
    }

    function formatTime(secs) {
      if (secs < 60) return secs + 's';
      if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return h + 'h ' + m + 'm';
    }

    function timeAgo(ts) {
      const diff = Math.floor((Date.now() - ts) / 1000);
      if (diff < 5) return 'just now';
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      return new Date(ts).toLocaleTimeString();
    }

    async function fetchStats() {
      try {
        const res = await fetch('/api/dashboard/stats');
        if (!res.ok) return;
        const data = await res.json();
        renderStats(data);
      } catch (err) {
        document.getElementById('sync-status').textContent = 'RECONNECTING...';
      }
    }

    function renderStats(data) {
      document.getElementById('sync-status').textContent = 'SYNCED';
      document.getElementById('kpi-today').textContent = formatMoney(data.totalToday);
      document.getElementById('kpi-month').textContent = formatMoney(data.totalMonth);
      document.getElementById('kpi-uptime').textContent = formatTime(data.uptimeSeconds);
      document.getElementById('kpi-keys-count').textContent = data.keys.length;
      document.getElementById('kpi-today-count').textContent = data.recentUsage.length + ' calls tracked';

      // Render keys
      const keysContainer = document.getElementById('keys-list');
      if (data.keys.length === 0) {
        keysContainer.innerHTML = '<div style="padding: 2.5rem; text-align: center; color: var(--silver); font-family: var(--mono); background: var(--card-bg); border: 1px solid var(--border);">No virtual keys configured. Click "+ Add Virtual Key" to start.</div>';
      } else {
        keysContainer.innerHTML = data.keys.map(k => {
          const dailyPct = k.hardCapDaily > 0 ? Math.min(100, Math.round((k.spentToday / k.hardCapDaily) * 100)) : 0;
          const rollingPct = k.rollingWindowCap > 0 ? Math.min(100, Math.round((k.spentRolling / k.rollingWindowCap) * 100)) : 0;
          const isCapped = k.status === 'capped';

          return \`
            <div class="key-card">
              <div class="key-meta">
                <h3>\${k.key}</h3>
                <span class="provider-pill provider-\${k.provider}">\${k.provider}</span>
                \${k.autoPacing?.enabled ? '<span style="font: 400 0.65rem var(--mono); color: var(--ember); margin-left: 0.5rem;">CRUISE CONTROL ON</span>' : ''}
              </div>

              <div class="metric-col">
                <div class="metric-header">
                  <span>Rolling Window (\${k.rollingWindowSeconds}s)</span>
                  <span>\${formatMoney(k.spentRolling)} / \${formatMoney(k.rollingWindowCap)} (\${rollingPct}%)</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill \${rollingPct >= 90 ? 'danger' : ''}" style="width: \${rollingPct}%;"></div>
                </div>
              </div>

              <div class="metric-col">
                <div class="metric-header">
                  <span>Daily Cap</span>
                  <span>\${formatMoney(k.spentToday)} / \${formatMoney(k.hardCapDaily)} (\${dailyPct}%)</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill \${dailyPct >= 90 ? 'danger' : ''}" style="width: \${dailyPct}%;"></div>
                </div>
              </div>

              <div style="display: flex; align-items: center; gap: 0.8rem; justify-content: flex-end;">
                <span class="status-badge \${isCapped ? 'status-capped' : 'status-active'}">
                  \${isCapped ? '● BLOCKED (429)' : '● NOMINAL'}
                </span>
                <button class="btn" style="padding: 0.4rem 0.7rem; font-size: 0.7rem;" onclick="resetKey('\${k.key}')" title="Reset usage ledger for testing">Reset</button>
              </div>
            </div>
          \`;
        }).join('');
      }

      // Render recent usage table
      const tbody = document.getElementById('recent-table-body');
      if (data.recentUsage.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--silver); padding: 2rem;">No usage transactions recorded yet.</td></tr>';
      } else {
        tbody.innerHTML = data.recentUsage.map(r => \`
          <tr>
            <td style="color: var(--silver);">\${timeAgo(r.timestamp)}</td>
            <td style="font-weight: 500; color: var(--bone);">\${r.virtualKey}</td>
            <td style="color: var(--ember); font-weight: 500;">\${formatMoney(r.cost)}</td>
            <td><span style="color: var(--green); font-size: 0.72rem;">✓ RECORDED &amp; CHARGED</span></td>
          </tr>
        \`).join('');
      }
    }

    async function resetKey(virtualKey) {
      if (!confirm('Reset spending history for key "' + virtualKey + '"?')) return;
      try {
        await fetch('/api/dashboard/reset/' + encodeURIComponent(virtualKey), { method: 'POST' });
        fetchStats();
      } catch (err) {
        alert('Failed to reset key');
      }
    }

    function openKeyModal() {
      document.getElementById('key-modal').classList.add('open');
    }

    function closeKeyModal() {
      document.getElementById('key-modal').classList.remove('open');
      document.getElementById('key-form').reset();
    }

    async function handleSaveKey(e) {
      e.preventDefault();
      const payload = {
        virtualKey: document.getElementById('input-key').value.trim(),
        provider: document.getElementById('input-provider').value,
        realKey: document.getElementById('input-realKey').value.trim(),
        rollingWindowCap: parseFloat(document.getElementById('input-rollingCap').value),
        rollingWindowSeconds: parseInt(document.getElementById('input-rollingSeconds').value, 10),
        hardCapDaily: parseFloat(document.getElementById('input-dailyCap').value),
        hardCapMonthly: parseFloat(document.getElementById('input-monthlyCap').value),
        autoPacing: {
          enabled: document.getElementById('input-pacing').checked,
          maxHoldSeconds: 30
        }
      };

      try {
        const res = await fetch('/api/dashboard/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          closeKeyModal();
          fetchStats();
        } else {
          alert('Failed to save key');
        }
      } catch (err) {
        alert('Error saving key');
      }
    }

    async function handleLogout() {
      try {
        await fetch('/api/dashboard/logout', { method: 'POST' });
        window.location.href = '/login';
      } catch {
        window.location.href = '/login';
      }
    }

    // Auto-refresh stats every 2.5 seconds
    fetchStats();
    setInterval(fetchStats, 2500);
  </script>
</body>
</html>`;
}
