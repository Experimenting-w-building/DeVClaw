import { escapeHtml } from "../../util/html.js";

export function setupLayout(
  title: string,
  step: number,
  totalSteps: number,
  content: string,
  cspNonce?: string
): string {
  const progress = Math.round((step / totalSteps) * 100);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — DeVClaw Setup</title>
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
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .setup-header {
      text-align: center;
      padding: 48px 24px 24px;
    }
    .setup-header .logo {
      font-weight: 700;
      font-size: 24px;
      color: var(--accent);
    }
    .setup-header .subtitle {
      color: var(--text-dim);
      font-size: 14px;
      margin-top: 4px;
    }

    .progress-bar {
      width: 100%;
      max-width: 560px;
      height: 4px;
      background: var(--surface2);
      border-radius: 2px;
      margin: 0 auto 32px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.3s ease;
      width: ${progress}%;
    }

    .step-indicator {
      text-align: center;
      font-size: 13px;
      color: var(--text-dim);
      margin-bottom: 8px;
    }

    .setup-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      width: 100%;
      max-width: 560px;
      margin: 0 24px;
    }

    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
    p { margin-bottom: 16px; }
    .dim { color: var(--text-dim); font-size: 14px; }

    .form-group { margin-bottom: 20px; }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .form-hint {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 4px;
    }

    .form-input {
      width: 100%;
      padding: 10px 14px;
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 15px;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--accent);
    }
    .form-input::placeholder { color: var(--text-dim); opacity: 0.6; }

    .form-select {
      width: 100%;
      padding: 10px 14px;
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 15px;
      font-family: inherit;
      cursor: pointer;
    }

    .btn-row {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .btn {
      display: inline-block;
      padding: 10px 24px;
      border-radius: var(--radius);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      text-decoration: none;
      text-align: center;
    }
    .btn-primary { background: var(--accent); color: white; flex: 1; }
    .btn-primary:hover { background: var(--accent-dim); }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-dim); }
    .btn-outline:hover { border-color: var(--text); color: var(--text); }
    .btn-success { background: var(--green); color: #0a0a0f; flex: 1; }
    .btn-success:hover { opacity: 0.9; }

    .error-text { color: var(--red); font-size: 14px; margin-bottom: 12px; }
    .success-text { color: var(--green); font-size: 14px; margin-bottom: 12px; }

    .info-box {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .info-box ol { padding-left: 20px; }
    .info-box li { margin-bottom: 6px; }
    .info-box code {
      background: var(--bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 13px;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }

    .review-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .review-row:last-child { border-bottom: none; }
    .review-label { color: var(--text-dim); }
    .review-value { font-weight: 600; }
    .review-value .mono {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
    }

    .provider-cards { display: flex; gap: 12px; margin-bottom: 20px; }
    .provider-card {
      flex: 1;
      padding: 14px;
      background: var(--surface2);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 14px;
      font-weight: 600;
    }
    .provider-card:hover { border-color: var(--text-dim); }
    .provider-card.selected { border-color: var(--accent); background: rgba(108, 92, 231, 0.1); }
    .provider-card input { display: none; }
  </style>
</head>
<body>
  <div class="setup-header">
    <div class="logo">DeVClaw</div>
    <div class="subtitle">Setup Wizard</div>
  </div>
  <div class="step-indicator">Step ${step} of ${totalSteps}</div>
  <div class="progress-bar"><div class="progress-fill"></div></div>
  <div class="setup-card">
    ${content}
  </div>
</body>
</html>`;
}
