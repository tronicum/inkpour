/**
 * content.js — Inkpour
 * Extracts messages from AI chat pages as structured data.
 * Responds to { action: 'extract' } with { messages, title, site, filename }.
 * Supports: ChatGPT, Claude, Gemini, Google AI Studio, Copilot
 */

(function () {
  'use strict';

  // Normalise browser API: Firefox uses `browser`, Chrome/Edge/Brave use `chrome`.
  // Chrome 120+ added `browser` natively; this covers older versions too.
  const api = (typeof browser !== 'undefined') ? browser : chrome;

  // ─── HTML → Markdown ──────────────────────────────────────────────────────

  function htmlToMarkdown(element) {
    if (!element) return '';
    return convertNode(element).replace(/\n{3,}/g, '\n\n').trim();
  }

  function convertNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();

    if (['script', 'style', 'svg', 'button', 'nav', 'header', 'footer'].includes(tag)) {
      return '';
    }

    const children = () => Array.from(node.childNodes).map(convertNode).join('');

    switch (tag) {
      case 'h1': return `\n\n# ${children().trim()}\n\n`;
      case 'h2': return `\n\n## ${children().trim()}\n\n`;
      case 'h3': return `\n\n### ${children().trim()}\n\n`;
      case 'h4': return `\n\n#### ${children().trim()}\n\n`;
      case 'h5': return `\n\n##### ${children().trim()}\n\n`;
      case 'h6': return `\n\n###### ${children().trim()}\n\n`;

      case 'p': return `\n\n${children()}\n\n`;
      case 'br': return '\n';
      case 'hr': return '\n\n---\n\n';

      case 'strong':
      case 'b': {
        const inner = children().trim();
        return inner ? `**${inner}**` : '';
      }

      case 'em':
      case 'i': {
        const inner = children().trim();
        return inner ? `*${inner}*` : '';
      }

      case 'del':
      case 's': {
        const inner = children().trim();
        return inner ? `~~${inner}~~` : '';
      }

      case 'code': {
        if (node.closest('pre')) return node.textContent;
        return `\`${node.textContent}\``;
      }

      case 'pre': {
        const codeEl = node.querySelector('code');
        const lang = (codeEl?.className || '').match(/language-(\w+)/)?.[1] ?? '';
        const code = (codeEl ?? node).textContent;
        return `\n\n\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`;
      }

      case 'blockquote': {
        const inner = children().trim().split('\n').map(l => `> ${l}`).join('\n');
        return `\n\n${inner}\n\n`;
      }

      case 'ul': return `\n\n${convertList(node, false)}\n\n`;
      case 'ol': return `\n\n${convertList(node, true)}\n\n`;
      case 'li': return children();

      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = children();
        if (!href || href.startsWith('#')) return text;
        return `[${text}](${href})`;
      }

      case 'img': {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        return alt ? `![${alt}](${src})` : '';
      }

      case 'table': return convertTable(node);

      default: return children();
    }
  }

  function convertList(listEl, ordered, depth = 0) {
    const indent = '  '.repeat(depth);
    return Array.from(listEl.children)
      .filter(el => el.tagName.toLowerCase() === 'li')
      .map((li, i) => {
        const nested = li.querySelector('ul, ol');
        const bullet  = ordered ? `${i + 1}.` : '*';
        const inlineNodes = Array.from(li.childNodes).filter(
          n => !(n.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes(n.tagName.toLowerCase()))
        );
        const inlineText = inlineNodes.map(convertNode).join('').trim();
        let result = `${indent}${bullet} ${inlineText}`;
        if (nested) {
          result += '\n' + convertList(nested, nested.tagName.toLowerCase() === 'ol', depth + 1);
        }
        return result;
      })
      .join('\n');
  }

  function convertTable(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';
    const toRow = tr =>
      Array.from(tr.querySelectorAll('th, td')).map(c => convertNode(c).replace(/\|/g, '\\|').trim());
    const header = toRow(rows[0]);
    const sep    = header.map(() => '---');
    const body   = rows.slice(1).map(toRow);
    return `\n\n${[
      `| ${header.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...body.map(r => `| ${r.join(' | ')} |`),
    ].join('\n')}\n\n`;
  }

  // ─── Site detection ───────────────────────────────────────────────────────

  function detectSite() {
    const host = location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai'))                                         return 'claude';
    if (host.includes('copilot.microsoft.com'))                             return 'copilot';
    if (host.includes('gemini.google.com'))                                 return 'gemini';
    if (host.includes('aistudio.google.com'))                               return 'aistudio';
    return 'generic';
  }

  // ─── Per-site extractors ──────────────────────────────────────────────────

  /** Sort two { el } objects by DOM order */
  function sortByDOMOrder(a, b) {
    const pos = a.el.compareDocumentPosition(b.el);
    return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  }

  // ChatGPT / OpenAI
  function extractChatGPT() {
    const turns = document.querySelectorAll('[data-message-author-role]');
    if (!turns.length) return null;
    return Array.from(turns).map(turn => {
      const role     = turn.getAttribute('data-message-author-role');
      const label    = role === 'user' ? 'You' : 'ChatGPT';
      const contentEl = turn.querySelector('.markdown, [class*="prose"], .text-message') ?? turn;
      return { role: label, content: htmlToMarkdown(contentEl) };
    }).filter(m => m.content);
  }

  // Claude.ai
  function extractClaude() {
    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
      .map(el => ({ el, role: 'You' }));
    const assistantEls = Array.from(document.querySelectorAll(
      '.font-claude-message, [data-testid="assistant-message"], [class*="AssistantResponse"], .prose'
    )).map(el => ({ el, role: 'Claude' }));

    const combined = [...userEls, ...assistantEls].sort(sortByDOMOrder);
    if (!combined.length) return null;
    return combined.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
                   .filter(m => m.content);
  }

  // Microsoft Copilot
  function extractCopilot() {
    const turnEls = document.querySelectorAll('cib-chat-turn');
    if (turnEls.length) {
      return Array.from(turnEls).map(turn => {
        const source = turn.getAttribute('source') ?? '';
        const role   = source === 'user' ? 'You' : 'Copilot';
        return { role, content: htmlToMarkdown(turn) };
      }).filter(m => m.content);
    }

    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"], .user-message'))
      .map(el => ({ el, role: 'You' }));
    const botEls  = Array.from(document.querySelectorAll('[data-testid="bot-message"], .bot-message'))
      .map(el => ({ el, role: 'Copilot' }));
    const combined = [...userEls, ...botEls].sort(sortByDOMOrder);
    return combined.length
      ? combined.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) })).filter(m => m.content)
      : null;
  }

  // Google Gemini (gemini.google.com)
  function extractGemini() {
    const userEls  = Array.from(document.querySelectorAll('user-query')).map(el => ({ el, role: 'You' }));
    const modelEls = Array.from(document.querySelectorAll('model-response')).map(el => ({ el, role: 'Gemini' }));
    if (!userEls.length && !modelEls.length) return null;
    return [...userEls, ...modelEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Google AI Studio — async (uses edit-mode to get raw prompt text)
  async function extractAIStudio() {
    const turns = document.querySelectorAll('ms-chat-turn');
    if (!turns.length) return null;

    const messages = [];

    for (const turn of turns) {
      // Role detection: container class or presence of edit button
      const container = turn.querySelector('.chat-turn-container, .turn-container, [class*="chat-turn"]');
      const hasEditBtn = !!turn.querySelector('.toggle-edit-button, [aria-label*="Edit message" i]');
      const isUser = hasEditBtn ||
                     container?.classList.contains('user-turn') ||
                     container?.classList.contains('user');

      if (isUser) {
        // Attempt edit-mode extraction for raw text
        const editBtn = turn.querySelector('.toggle-edit-button, [aria-label*="Edit message" i]');
        if (editBtn) {
          editBtn.click();

          const rawText = await new Promise(resolve => {
            const deadline = Date.now() + 2500;
            const poll = () => {
              // The textarea appears somewhere in the document (not necessarily inside turn)
              const ta = document.querySelector('ms-autosize-textarea[data-value]') ||
                         turn.querySelector('ms-autosize-textarea[data-value]');
              if (ta) {
                resolve(ta.getAttribute('data-value') || ta.value || '');
              } else if (Date.now() > deadline) {
                resolve('');
              } else {
                requestAnimationFrame(poll);
              }
            };
            poll();
          });

          // Exit edit mode — try the "Stop editing" button first, then Escape
          const stopBtn = document.querySelector('[aria-label*="stop editing" i], .stop-editing-button');
          if (stopBtn) {
            stopBtn.click();
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape', bubbles: true, cancelable: true,
            }));
          }

          // Brief pause so the DOM can settle before processing the next turn
          await new Promise(r => setTimeout(r, 120));

          if (rawText.trim()) {
            messages.push({ role: 'You', content: rawText.trim() });
            continue;
          }
        }
      }

      // AI response turn (or user fallback if edit-mode failed)
      const role    = isUser ? 'You' : 'Gemini';
      const content = htmlToMarkdown(turn);
      if (content) messages.push({ role, content });
    }

    return messages.length ? messages : null;
  }

  // Generic best-effort fallback
  function extractGeneric() {
    const candidates = [
      '[data-message-author-role]',
      '[class*="message-bubble"]',
      '[class*="chat-bubble"]',
      '[class*="ChatMessage"]',
      '[class*="message-content"]',
    ];
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      if (els.length) {
        return Array.from(els)
          .map(el => ({ role: 'Message', content: htmlToMarkdown(el) }))
          .filter(m => m.content);
      }
    }
    return [];
  }

  // ─── Main extraction dispatcher ───────────────────────────────────────────

  async function extractMessages() {
    const site = detectSite();
    let messages = null;

    switch (site) {
      case 'chatgpt':  messages = extractChatGPT();          break;
      case 'claude':   messages = extractClaude();            break;
      case 'copilot':  messages = extractCopilot();           break;
      case 'gemini':   messages = extractGemini();            break;
      case 'aistudio': messages = await extractAIStudio();    break;
      default:         break;
    }

    // Last-resort fallback
    if (!messages || !messages.length) messages = extractGeneric();
    return messages;
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  api.runtime.onMessage.addListener((msg) => {
    if (msg.action !== 'extract') return;

    // Return a Promise — Firefox waits for it and sends the resolved value back
    return extractMessages().then(messages => {
      if (!messages.length) {
        return { error: 'No messages found. Make sure a chat is open and fully loaded.' };
      }

      const rawTitle = document.title.replace(/[<>:"/\\|?*\n]/g, ' ').trim() || 'Chat Export';
      const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const site = location.hostname;

      return { messages, title: rawTitle, site, filename: slug };
    }).catch(err => {
      return { error: `Extraction failed: ${err.message}` };
    });
  });

})();
