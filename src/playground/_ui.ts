/**
 * Returns the single-file HTML for the playground UI.
 *
 * Security notes:
 *  - Agent names are injected as JSON (not raw HTML interpolation), so they
 *    cannot break out of the script context via XSS.
 *  - User messages and agent responses are inserted into the DOM via
 *    document.createElement + textContent (never innerHTML) to prevent XSS.
 *  - The title is inserted as a JSON string literal, also safe.
 */
export function getPlaygroundHtml(title: string, agentNames: string[]): string {
    // Both values are serialised as JSON so special characters cannot escape HTML context.
    const safeTitle      = JSON.stringify(title);
    const safeAgentNames = JSON.stringify(agentNames);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #0f1117;
      --surface:   #1a1d27;
      --border:    #2d3048;
      --accent:    #6366f1;
      --accent-h:  #818cf8;
      --text:      #e2e8f0;
      --muted:     #94a3b8;
      --user-bg:   #1e2235;
      --bot-bg:    #161923;
      --danger:    #f87171;
      --radius:    8px;
      --font:      'Inter', system-ui, -apple-system, sans-serif;
    }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      height: 100dvh;
      display: flex;
      flex-direction: column;
    }

    header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface);
    }

    header h1 {
      font-size: 1rem;
      font-weight: 600;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #agent-select {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 6px 10px;
      font-size: 0.875rem;
      cursor: pointer;
    }

    #clear-btn {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 6px 12px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    #clear-btn:hover { color: var(--text); border-color: var(--text); }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }

    .msg {
      max-width: 72%;
      padding: 10px 14px;
      border-radius: var(--radius);
      font-size: 0.9rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .msg.user {
      align-self: flex-end;
      background: var(--user-bg);
      border: 1px solid var(--border);
    }

    .msg.agent {
      align-self: flex-start;
      background: var(--bot-bg);
      border: 1px solid var(--border);
    }

    .msg.error {
      align-self: flex-start;
      background: #2d1515;
      border: 1px solid #7f1d1d;
      color: var(--danger);
    }

    .msg .label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .msg.user .label { color: var(--accent-h); }

    .thinking {
      align-self: flex-start;
      color: var(--muted);
      font-size: 0.85rem;
      font-style: italic;
      padding: 6px 14px;
    }

    form {
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: var(--surface);
    }

    #prompt {
      flex: 1;
      resize: none;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
      color: var(--text);
      padding: 10px 14px;
      font-family: var(--font);
      font-size: 0.9rem;
      line-height: 1.5;
      max-height: 160px;
    }

    #prompt:focus { outline: 2px solid var(--accent); border-color: transparent; }

    #send-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      padding: 0 20px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    #send-btn:hover { background: var(--accent-h); }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <header>
    <h1 id="page-title"></h1>
    <select id="agent-select"></select>
    <button id="clear-btn" type="button">Clear</button>
  </header>

  <div id="messages" role="log" aria-live="polite" aria-label="Conversation"></div>

  <form id="chat-form">
    <textarea
      id="prompt"
      rows="2"
      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
      aria-label="Message input"
      autocomplete="off"
    ></textarea>
    <button id="send-btn" type="submit">Send</button>
  </form>

  <script>
    'use strict';
    const TITLE       = ${safeTitle};
    const AGENT_NAMES = ${safeAgentNames};

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    document.getElementById('page-title').textContent = TITLE;

    const selectEl = document.getElementById('agent-select');
    AGENT_NAMES.forEach(function(name) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });

    const messagesEl = document.getElementById('messages');
    const formEl     = document.getElementById('chat-form');
    const promptEl   = document.getElementById('prompt');
    const sendBtn    = document.getElementById('send-btn');

    document.getElementById('clear-btn').addEventListener('click', function() {
      messagesEl.innerHTML = '';
    });

    // ── Message rendering ─────────────────────────────────────────────────────
    function appendMessage(role, text) {
      const wrapper = document.createElement('div');
      wrapper.className = 'msg ' + role;

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = role === 'user' ? 'You' : (role === 'error' ? 'Error' : selectEl.value);
      wrapper.appendChild(label);

      const body = document.createElement('div');
      body.textContent = text;   // safe: textContent, never innerHTML
      wrapper.appendChild(body);

      messagesEl.appendChild(wrapper);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return wrapper;
    }

    function showThinking() {
      const el = document.createElement('div');
      el.className = 'thinking';
      el.textContent = 'Thinking…';
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    // ── Form submit ───────────────────────────────────────────────────────────
    formEl.addEventListener('submit', async function(e) {
      e.preventDefault();
      const message = promptEl.value.trim();
      if (!message) return;

      appendMessage('user', message);
      promptEl.value = '';
      promptEl.style.height = '';
      sendBtn.disabled = true;

      const thinking = showThinking();

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Body is JSON-serialised (not string-interpolated) — no injection risk
          body: JSON.stringify({ agent: selectEl.value, message: message }),
        });

        const data = await res.json();
        messagesEl.removeChild(thinking);

        if (!res.ok) {
          appendMessage('error', data.error || ('HTTP ' + res.status));
        } else {
          appendMessage('agent', data.text || '(empty response)');
        }
      } catch (err) {
        messagesEl.removeChild(thinking);
        appendMessage('error', err instanceof Error ? err.message : 'Network error');
      } finally {
        sendBtn.disabled = false;
        promptEl.focus();
      }
    });

    // ── Enter-to-send (Shift+Enter = newline) ─────────────────────────────────
    promptEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    // ── Auto-resize textarea ──────────────────────────────────────────────────
    promptEl.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 160) + 'px';
    });
  </script>
</body>
</html>`;
}

/** Escape HTML special characters — used only for the <title> tag fallback. */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
