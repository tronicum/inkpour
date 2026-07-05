/**
 * content.js — Chat to Markdown
 * Extracts messages from AI chat pages and converts them to Markdown.
 * Supports: ChatGPT, Claude, Gemini, Google AI Studio, Copilot
 */

(function () {
  'use strict';

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

    // Skip non-content elements entirely
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
        // Inline code — pre > code is handled by the 'pre' case
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
        return `![${alt}](${src})`;
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
        // Separate nested lists from inline content
        const nested = li.querySelector('ul, ol');
        const bullet = ordered ? `${i + 1}.` : '*';

        // Collect direct (non-list) content
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

    const toRow = (tr) =>
      Array.from(tr.querySelectorAll('th, td')).map(c => convertNode(c).replace(/\|/g, '\\|').trim());

    const header = toRow(rows[0]);
    const sep = header.map(() => '---');
    const body = rows.slice(1).map(toRow);

    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...body.map(r => `| ${r.join(' | ')} |`),
    ];
    return `\n\n${lines.join('\n')}\n\n`;
  }

  // ─── Site detection ───────────────────────────────────────────────────────

  function detectSite() {
    const host = location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('copilot.microsoft.com')) return 'copilot';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('aistudio.google.com')) return 'aistudio';
    return 'generic';
  }

  // ─── Per-site extractors ──────────────────────────────────────────────────

  function extractMessages() {
    const site = detectSite();
    let messages = [];

    switch (site) {
      case 'chatgpt':  messages = extractChatGPT(); break;
      case 'claude':   messages = extractClaude();   break;
      case 'copilot':  messages = extractCopilot();  break;
      case 'gemini':   messages = extractGemini();   break;
      case 'aistudio': messages = extractAIStudio(); break;
      default:         messages = extractGeneric();  break;
    }

    // Last-resort fallback
    if (!messages.length) messages = extractGeneric();

    return messages;
  }

  /** Sort two DOM elements by their document order */
  function sortByDOMOrder(a, b) {
    const pos = a.el.compareDocumentPosition(b.el);
    return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  }

  // ChatGPT / OpenAI
  function extractChatGPT() {
    const turns = document.querySelectorAll('[data-message-author-role]');
    return Array.from(turns).map(turn => {
      const role = turn.getAttribute('data-message-author-role');
      const label = role === 'user' ? 'You' : 'ChatGPT';
      // Prefer the rendered markdown container
      const contentEl = turn.querySelector('.markdown, [class*="prose"], .text-message') ?? turn;
      return { role: label, content: htmlToMarkdown(contentEl) };
    }).filter(m => m.content);
  }

  // Claude.ai
  function extractClaude() {
    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
      .map(el => ({ el, role: 'You' }));

    // Claude response containers (multiple class selectors for robustness)
    const assistantEls = Array.from(
      document.querySelectorAll(
        '.font-claude-message, [data-testid="assistant-message"], ' +
        '[class*="AssistantResponse"], .prose'
      )
    ).map(el => ({ el, role: 'Claude' }));

    return [...userEls, ...assistantEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Microsoft Copilot
  function extractCopilot() {
    // Copilot uses cib-chat-turn web components
    const turnEls = document.querySelectorAll('cib-chat-turn');
    if (turnEls.length) {
      return Array.from(turnEls).map(turn => {
        const source = turn.getAttribute('source') ?? '';
        const role = source === 'user' ? 'You' : 'Copilot';
        return { role, content: htmlToMarkdown(turn) };
      }).filter(m => m.content);
    }

    // Fallback selectors
    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"], .user-message'))
      .map(el => ({ el, role: 'You' }));
    const botEls = Array.from(document.querySelectorAll('[data-testid="bot-message"], .bot-message'))
      .map(el => ({ el, role: 'Copilot' }));

    return [...userEls, ...botEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Google Gemini
  function extractGemini() {
    // Gemini uses custom elements: <user-query> and <model-response>
    const userEls = Array.from(document.querySelectorAll('user-query'))
      .map(el => ({ el, role: 'You' }));
    const modelEls = Array.from(document.querySelectorAll('model-response'))
      .map(el => ({ el, role: 'Gemini' }));

    if (userEls.length || modelEls.length) {
      return [...userEls, ...modelEls]
        .sort(sortByDOMOrder)
        .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
        .filter(m => m.content);
    }

    return extractGeneric();
  }

  // Google AI Studio
  function extractAIStudio() {
    // AI Studio uses ms-chat-turn or .turn containers
    const turns = document.querySelectorAll('ms-chat-turn, .turn, [class*="ChatTurn"]');
    if (turns.length) {
      return Array.from(turns).map(turn => {
        const isUser =
          turn.getAttribute('role') === 'user' ||
          turn.classList.contains('user') ||
          !!turn.querySelector('[class*="user"], .query');
        const role = isUser ? 'You' : 'Gemini';
        return { role, content: htmlToMarkdown(turn) };
      }).filter(m => m.content);
    }
    return extractGeneric();
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

  // ─── Build Markdown document ──────────────────────────────────────────────

  function buildMarkdown(messages) {
    const title = document.title.replace(/[<>:"/\\|?*\n]/g, ' ').trim() || 'Chat Export';
    const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const site = location.hostname;

    let md = `# ${title}\n\n`;
    md += `> Exported from **${site}** on ${date}\n\n`;
    md += `---\n\n`;

    for (const { role, content } of messages) {
      md += `## ${role}\n\n${content}\n\n---\n\n`;
    }

    return md;
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action !== 'exportMarkdown') return;

    try {
      const messages = extractMessages();

      if (!messages.length) {
        sendResponse({
          error: 'No messages found. Make sure a chat is open and fully loaded.',
        });
        return;
      }

      const markdown = buildMarkdown(messages);
      const slug = (document.title || 'chat')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 60);

      sendResponse({ markdown, filename: `${slug}.md` });
    } catch (err) {
      sendResponse({ error: `Extraction failed: ${err.message}` });
    }
  });

})();
