export function renderLoginHtml(_errorMessage?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TokenCap — Authentication</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --abyss: #070B13;
      --obsidian: #0B0F17;
      --card-bg: #0D131F;
      --silver: #8C929D;
      --iron: #1E2533;
      --bone: #E5E7EB;
      --ember: #B8864B;
      --rust: #A4472F;
      --border: rgba(90, 94, 101, 0.25);
      --title: "Cinzel", serif;
      --mono: "Geist Mono", monospace;
      --sans: "Geist", system-ui, sans-serif;
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
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
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

    .auth-card {
      width: 100%;
      max-width: 420px;
      background: var(--obsidian);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 2.5rem 2.25rem;
      box-shadow: 0 30px 90px -20px rgba(0, 0, 0, 0.9);
      position: relative;
    }
    .auth-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--ember), transparent);
    }

    .auth-head {
      text-align: center;
      margin-bottom: 2rem;
    }
    .auth-head p.eyebrow {
      margin: 0 0 0.6rem;
      font: 500 0.7rem/1 var(--mono);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ember);
    }
    .auth-head h1 {
      margin: 0;
      font: 500 1.65rem/1.1 var(--title);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--bone);
    }

    .form-group {
      margin-bottom: 1.35rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.45rem;
      font: 500 0.72rem/1 var(--mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--silver);
    }
    .form-control {
      width: 100%;
      background: #060910;
      border: 1px solid var(--border);
      color: var(--bone);
      font: 400 0.9rem/1.4 var(--mono);
      padding: 0.75rem 0.95rem;
      border-radius: 2px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-control:focus {
      border-color: var(--ember);
      box-shadow: 0 0 0 1px rgba(184, 134, 75, 0.3);
    }

    .error-banner {
      background: rgba(164, 71, 47, 0.15);
      border: 1px solid rgba(164, 71, 47, 0.4);
      color: #F87171;
      font: 400 0.75rem/1.4 var(--mono);
      padding: 0.75rem 0.9rem;
      border-radius: 2px;
      margin-bottom: 1.5rem;
      display: none;
    }
    .error-banner.show { display: block; }

    .btn-submit {
      width: 100%;
      background: rgba(184, 134, 75, 0.18);
      border: 1px solid rgba(184, 134, 75, 0.5);
      color: var(--bone);
      font: 500 0.82rem/1 var(--mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0.85rem;
      border-radius: 2px;
      cursor: pointer;
      margin-top: 0.5rem;
      transition: all 0.2s;
    }
    .btn-submit:hover {
      background: rgba(184, 134, 75, 0.35);
      border-color: var(--ember);
      color: #fff;
    }

    .auth-foot {
      margin-top: 2rem;
      text-align: center;
      font: 400 0.68rem/1.5 var(--mono);
      color: var(--silver);
      border-top: 1px solid rgba(90, 94, 101, 0.15);
      padding-top: 1.25rem;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="auth-head">
      <p class="eyebrow">// CONSOLE AUTHENTICATION</p>
      <h1>TokenCap</h1>
    </div>

    <div class="error-banner" id="error-banner"></div>

    <form id="login-form" onsubmit="handleLogin(event)">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" class="form-control" autocomplete="username" required autofocus />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" class="form-control" autocomplete="current-password" required />
      </div>

      <button type="submit" class="btn-submit" id="btn-submit">> Authenticate Console</button>
    </form>
  </div>

  <script>
    async function handleLogin(e) {
      e.preventDefault();
      const errBanner = document.getElementById('error-banner');
      const submitBtn = document.getElementById('btn-submit');
      errBanner.classList.remove('show');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/api/dashboard/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          window.location.href = data.redirect || '/dashboard';
        } else {
          errBanner.textContent = data.error || 'Invalid credentials.';
          errBanner.classList.add('show');
          submitBtn.disabled = false;
          submitBtn.textContent = '> Authenticate Console';
        }
      } catch (err) {
        errBanner.textContent = 'Server connection error. Please try again.';
        errBanner.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = '> Authenticate Console';
      }
    }
  </script>
</body>
</html>`;
}
