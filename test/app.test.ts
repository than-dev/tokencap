import assert from 'node:assert';
import { describe, test } from 'node:test';
import { createApp } from '../src/app';

describe('HTTP Routes & Auth Guard', () => {
  const app = createApp();

  test('GET /health returns 200 without authentication', async () => {
    const res = await app.request('/health');
    assert.strictEqual(res.status, 200);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const body = (await res.json()) as any;
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'tokencap');
  });

  test('GET / returns 200 status message without authentication', async () => {
    const res = await app.request('/');
    assert.strictEqual(res.status, 200);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const body = (await res.json()) as any;
    assert.strictEqual(body.status, 'ok');
  });

  test('GET /llms.txt returns 200 text without authentication', async () => {
    const res = await app.request('/llms.txt');
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.match(text, /TokenCap/);
  });

  test('POST /v1/chat/completions without auth returns 401', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });
    assert.strictEqual(res.status, 401);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const body = (await res.json()) as any;
    assert.strictEqual(body.error, 'Missing Authentication');
  });

  test('POST /v1/chat/completions with invalid virtual key returns 401', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer non_existent_key_999',
      },
      body: JSON.stringify({ messages: [] }),
    });
    assert.strictEqual(res.status, 401);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const body = (await res.json()) as any;
    assert.strictEqual(body.error, 'Invalid Virtual Key');
  });

  test('GET / redirects to /dashboard when Accept: text/html', async () => {
    const res = await app.request('/', {
      headers: { Accept: 'text/html' },
    });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('Location'), '/dashboard');
  });

  test('GET /dashboard redirects to /login when unauthenticated', async () => {
    const res = await app.request('/dashboard');
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('Location'), '/login');
  });

  test('GET /login returns 200 HTML with authentication form', async () => {
    const res = await app.request('/login');
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.match(html, /Console Authentication/i);
    assert.match(html, /id="login-form"/);
  });

  test('POST /api/dashboard/login with invalid credentials returns 401', async () => {
    const res = await app.request('/api/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
    });
    assert.strictEqual(res.status, 401);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const body = (await res.json()) as any;
    assert.strictEqual(body.error, 'Invalid username or password');
  });

  test('POST /api/dashboard/login with valid credentials sets cookie and allows access', async () => {
    const loginRes = await app.request('/api/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.strictEqual(loginRes.status, 200);
    const setCookieHeader = loginRes.headers.get('Set-Cookie');
    assert.ok(setCookieHeader, 'Set-Cookie header must be present');
    assert.match(setCookieHeader, /tokencap_session=/);

    // Extract session cookie value
    const match = setCookieHeader.match(/tokencap_session=([^;]+)/);
    assert.ok(match, 'tokencap_session cookie must be extractable');
    const cookieHeader = `tokencap_session=${match[1]}`;

    // Access protected /dashboard with session cookie
    const dashRes = await app.request('/dashboard', {
      headers: { Cookie: cookieHeader },
    });
    assert.strictEqual(dashRes.status, 200);
    const html = await dashRes.text();
    assert.match(html, /Command Console/);

    // Access protected /api/dashboard/stats with session cookie
    const statsRes = await app.request('/api/dashboard/stats', {
      headers: { Cookie: cookieHeader },
    });
    assert.strictEqual(statsRes.status, 200);
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const statsBody = (await statsRes.json()) as any;
    assert.ok(typeof statsBody.uptimeSeconds === 'number');
    assert.ok(typeof statsBody.totalToday === 'number');
    assert.ok(Array.isArray(statsBody.keys));

    // Register a new key via authenticated dashboard API
    const newKey = `test_dashboard_key_${Date.now()}`;
    const saveRes = await app.request('/api/dashboard/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        virtualKey: newKey,
        provider: 'openai',
        realKey: 'sk-test-real',
        hardCapDaily: 5.0,
        rollingWindowCap: 1.0,
        rollingWindowSeconds: 3600,
      }),
    });
    assert.strictEqual(saveRes.status, 200);

    // Unauthenticated request to /api/dashboard/stats returns 401
    const unauthStats = await app.request('/api/dashboard/stats');
    assert.strictEqual(unauthStats.status, 401);

    // Logout endpoint clears cookie
    const logoutRes = await app.request('/api/dashboard/logout', { method: 'POST' });
    assert.strictEqual(logoutRes.status, 200);
    const logoutCookie = logoutRes.headers.get('Set-Cookie');
    assert.ok(logoutCookie, 'Logout should set cookie deletion');
  });
});
