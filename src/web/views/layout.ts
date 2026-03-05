import { escapeHtml } from "../../util/html.js";

export function layout(
  title: string,
  content: string,
  csrfToken?: string,
  cspNonce?: string
): string {
  const logoutControl = csrfToken
    ? `<form method="POST" action="/logout" class="inline-form ml-auto">
         <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
         <button type="submit" class="btn btn-outline">Logout</button>
       </form>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — DeVClaw</title>
  <style${cspNonce ? ` nonce="${escapeHtml(cspNonce)}"` : ""}>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0a0f;
      --surface: #12121a;
      --surface2: #1a1a26;
      --border: #2a2a3a;
      --text: #e0e0e8;
      --text-dim: #8888a0;
      --accent: #6c5ce7;
      --accent-dim: #4a3fb0;
      --green: #00d68f;
      --red: #ff6b6b;
      --yellow: #ffd93d;
      --radius: 8px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    nav {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 0;
      position: sticky; top: 0; z-index: 10;
    }
    nav .container { display: flex; align-items: center; gap: 32px; }
    nav .logo { font-weight: 700; font-size: 18px; color: var(--accent); text-decoration: none; }
    nav a { color: var(--text-dim); text-decoration: none; font-size: 14px; transition: color 0.2s; }
    nav a:hover, nav a.active { color: var(--text); }

    main { padding: 32px 0; }

    h1 { font-size: 28px; font-weight: 700; margin-bottom: 24px; }
    h2 { font-size: 20px; font-weight: 600; margin-bottom: 16px; }
    h3 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 16px;
    }

    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
    .grid-3 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }

    .badge {
      display: inline-block; padding: 2px 10px; border-radius: 100px;
      font-size: 12px; font-weight: 600; text-transform: uppercase;
    }
    .badge-green { background: rgba(0, 214, 143, 0.15); color: var(--green); }
    .badge-yellow { background: rgba(255, 217, 61, 0.15); color: var(--yellow); }
    .badge-red { background: rgba(255, 107, 107, 0.15); color: var(--red); }
    .badge-purple { background: rgba(108, 92, 231, 0.15); color: var(--accent); }

    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase;
         color: var(--text-dim); border-bottom: 1px solid var(--border); }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
    tr:last-child td { border-bottom: none; }

    .btn {
      display: inline-block; padding: 6px 16px; border-radius: var(--radius);
      font-size: 13px; font-weight: 600; cursor: pointer; border: none;
      transition: all 0.2s; text-decoration: none;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: var(--accent-dim); }
    .btn-danger { background: var(--red); color: white; }
    .btn-danger:hover { opacity: 0.8; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-dim); }
    .btn-outline:hover { border-color: var(--text); color: var(--text); }

    .stat { text-align: center; }
    .stat-value { font-size: 32px; font-weight: 700; color: var(--accent); }
    .stat-label { font-size: 13px; color: var(--text-dim); margin-top: 4px; }

    .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; }
    .dim { color: var(--text-dim); }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px; }

    .empty { text-align: center; padding: 48px; color: var(--text-dim); }
    .inline-form { display: inline; }
    .ml-auto { margin-left: auto; }
    .ml-8 { margin-left: 8px; }
    .mb-8 { margin-bottom: 8px; }
    .mb-12 { margin-bottom: 12px; }
    .mb-16 { margin-bottom: 16px; }
    .mb-32 { margin-bottom: 32px; }
    .text-center { text-align: center; }
    .small-12 { font-size: 12px; }
    .small-13 { font-size: 13px; }
    .error-text { color: var(--red); margin-bottom: 16px; font-size: 14px; }
    .card-login-wrap { max-width: 360px; margin: 80px auto; }
    .row-between { display: flex; justify-content: space-between; align-items: center; }
    .row-gap-16 { display: flex; gap: 16px; }
    .row-gap-12 { display: flex; gap: 12px; align-items: center; }
    .row-gap-8 { display: flex; gap: 8px; }
    .select-input {
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 6px 12px;
    }
    .text-input {
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 6px 12px;
    }
    .text-input-flex { flex: 1; }
    .login-input {
      width: 100%;
      padding: 10px 14px;
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 12px;
      font-size: 15px;
    }
    .btn-full { width: 100%; padding: 10px; }
    .log-time-cell { white-space: nowrap; }
    .log-detail-cell { max-width: 500px; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <nav>
    <div class="container">
      <a href="/" class="logo">DeVClaw</a>
      <a href="/">Dashboard</a>
      <a href="/skills">Skills</a>
      <a href="/tasks">Tasks</a>
      <a href="/logs">Logs</a>
      ${logoutControl}
    </div>
  </nav>
  <main>
    <div class="container">
      ${content}
    </div>
  </main>
</body>
</html>`;
}
