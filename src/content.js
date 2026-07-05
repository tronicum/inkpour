/**
 * content.js — Inkpour
 * Extracts messages from AI chat pages as structured data.
 * Responds to { action: 'extract' } with { messages, title, site, platform, filename }.
 *
 * Supported: ChatGPT, Claude, Gemini, Google AI Studio, Copilot (microsoft + copilot.com),
 *            Grok, Perplexity (experimental), DeepSeek (experimental),
 *            Meta AI (experimental), Mistral Le Chat (experimental),
 *            HuggingChat (experimental), Poe (experimental), Phind (experimental)
 *
 * Features:
 *   - Citation footnote extraction: <a href="..."><sup>N</sup></a> → [^N] + Sources section
 *   - In-page floating export button (Shadow DOM, dark-mode aware)
 *   - SPA navigation detection (MutationObserver)
 *   - Streaming guard, lazy-load scroll, filename template
 */

(function () {
  'use strict';

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  // ─── HTML → Markdown ──────────────────────────────────────────────────────

  /**
   * Footnote accumulator — reset per htmlToMarkdown() call.
   * Populated by the <a> branch of convertNode when a citation link is detected.
   * Each entry is a URL string; index+1 is the footnote number.
   */
  let _footnotes = [];

  function htmlToMarkdown(element) {
    if (!element) return '';
    _footnotes = [];
    let md = convertNode(element).replace(/\n{3,}/g, '\n\n').trim();
    if (_footnotes.length) {
      md += '\n\n**Sources:**\n\n' +
        _footnotes.map((url, i) => `[^${i + 1}]: ${url}`).join('\n');
    }
    return md;
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

      case 'sup': {
        const inner = children().trim();
        return inner ? `^${inner}^` : '';
      }

      case 'sub': {
        const inner = children().trim();
        return inner ? `~${inner}~` : '';
      }

      case 'code': {
        if (node.closest('pre')) return node.textContent;
        return `\`${node.textContent}\``;
      }

      case 'pre': {
        const codeEl = node.querySelector('code');
        // Language from class like "language-typescript" or from a sibling/parent span
        let lang = (codeEl?.className || '').match(/language-(\w+)/)?.[1] ?? '';
        // Some platforms (Grok, Gemini) put the language in a sibling span
        if (!lang) {
          const langSpan = node.querySelector('[class*="lang"], [class*="language"], .hljs-keyword') ??
                           node.previousElementSibling?.querySelector('span');
          if (langSpan) {
            const t = langSpan.textContent.trim().toLowerCase();
            if (/^[a-z][a-z0-9+#.-]{0,20}$/.test(t)) lang = t;
          }
        }
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
        const innerText = children();
        if (!href || href.startsWith('#')) return innerText;

        // ── Citation detection ────────────────────────────────────────────
        // Pattern 1: <a href="..."><sup>N</sup></a>   (Perplexity, academic)
        const onlyChild = node.children.length === 1 ? node.children[0] : null;
        if (onlyChild?.tagName.toLowerCase() === 'sup') {
          const numText = onlyChild.textContent.trim();
          if (/^\d+$/.test(numText)) {
            let idx = _footnotes.indexOf(href);
            if (idx < 0) { _footnotes.push(href); idx = _footnotes.length - 1; }
            return `[^${idx + 1}]`;
          }
        }
        // Pattern 2: <a href="...">[1]</a>  (bracket-style inline citation)
        const trimmed = innerText.trim();
        if (/^\[\d+\]$/.test(trimmed)) {
          let idx = _footnotes.indexOf(href);
          if (idx < 0) { _footnotes.push(href); idx = _footnotes.length - 1; }
          return `[^${idx + 1}]`;
        }

        return `[${innerText}](${href})`;
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
    // Allow test harness to inject a fake hostname without touching window.location
    const host = window.__inkpourTestHostname ?? location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai'))                                         return 'claude';
    if (host.includes('copilot.microsoft.com') ||
        host.includes('www.copilot.com') ||
        host.includes('copilot.com'))                                       return 'copilot';
    if (host.includes('gemini.google.com'))                                 return 'gemini';
    if (host.includes('aistudio.google.com'))                               return 'aistudio';
    if (host.includes('grok.com'))                                          return 'grok';
    if (host.includes('perplexity.ai'))                                     return 'perplexity';
    if (host.includes('chat.deepseek.com'))                                 return 'deepseek';
    if (host.includes('meta.ai'))                                           return 'metaai';
    if (host.includes('chat.mistral.ai'))                                   return 'mistral';
    if (host.includes('huggingface.co'))                                    return 'huggingchat';
    if (host.includes('poe.com'))                                           return 'poe';
    if (host.includes('phind.com'))                                          return 'phind';
    if (host.includes('notebooklm.google.com'))                             return 'notebooklm';
    if (host.includes('kagi.com'))                                          return 'kagi';
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
    // Use updated selector that covers both old and new Claude DOM
    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
      .map(el => ({ el, role: 'You' }));

    const assistantEls = Array.from(document.querySelectorAll(
      '.font-claude-message:not(#markdown-artifact), ' +
      '.font-claude-response:not(#markdown-artifact), ' +
      '[data-testid="assistant-message"]'
    )).map(el => ({ el, role: 'Claude' }));

    const combined = [...userEls, ...assistantEls].sort(sortByDOMOrder);
    if (!combined.length) return null;
    return combined.map(({ el, role }) => {
      // Skip artifact blocks (code editors embedded in Claude's UI)
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.artifact-block-cell, [class*="artifact"]').forEach(n => n.remove());
      return { role, content: htmlToMarkdown(clone) };
    }).filter(m => m.content);
  }

  // Microsoft Copilot (copilot.microsoft.com + www.copilot.com)
  function extractCopilot() {
    // New copilot.com uses Tailwind group classes
    const newUserEls = Array.from(document.querySelectorAll('.group\\/user-message'))
      .map(el => ({ el, role: 'You' }));
    const newBotEls  = Array.from(document.querySelectorAll('.group\\/ai-message'))
      .map(el => ({ el, role: 'Copilot' }));

    if (newUserEls.length || newBotEls.length) {
      return [...newUserEls, ...newBotEls]
        .sort(sortByDOMOrder)
        .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
        .filter(m => m.content);
    }

    // Legacy copilot.microsoft.com (cib-chat-turn custom elements)
    const turnEls = document.querySelectorAll('cib-chat-turn');
    if (turnEls.length) {
      return Array.from(turnEls).map(turn => {
        const source = turn.getAttribute('source') ?? '';
        const role   = source === 'user' ? 'You' : 'Copilot';
        return { role, content: htmlToMarkdown(turn) };
      }).filter(m => m.content);
    }

    // Generic fallback
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
      .map(({ el, role }) => {
        const tag = el.tagName.toLowerCase();
        let contentEl;

        if (tag === 'user-query') {
          // Use the inner query-content div — this skips "You said" UI label
          contentEl = el.querySelector('div.query-content') ?? el;
        } else {
          // Use the inner message-content element — skips "Gemini said" UI label
          contentEl = el.querySelector('message-content') ?? el;
        }

        return { role, content: htmlToMarkdown(contentEl) };
      })
      .filter(m => m.content);
  }

  // Google AI Studio — async (uses edit-mode to get raw prompt text)
  async function extractAIStudio() {
    const turns = document.querySelectorAll('ms-chat-turn');
    if (!turns.length) return null;

    const messages = [];

    for (const turn of turns) {
      const container = turn.querySelector('.chat-turn-container, .turn-container, [class*="chat-turn"]');
      const hasEditBtn = !!turn.querySelector('.toggle-edit-button, [aria-label*="Edit message" i]');
      const isUser = hasEditBtn ||
                     container?.classList.contains('user-turn') ||
                     container?.classList.contains('user');

      if (isUser) {
        const editBtn = turn.querySelector('.toggle-edit-button, [aria-label*="Edit message" i]');
        if (editBtn) {
          editBtn.click();

          const rawText = await new Promise(resolve => {
            const deadline = Date.now() + 2500;
            const poll = () => {
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

          const stopBtn = document.querySelector('[aria-label*="stop editing" i], .stop-editing-button');
          if (stopBtn) {
            stopBtn.click();
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Escape', bubbles: true, cancelable: true,
            }));
          }

          await new Promise(r => setTimeout(r, 120));

          if (rawText.trim()) {
            messages.push({ role: 'You', content: rawText.trim() });
            continue;
          }
        }
      }

      const role    = isUser ? 'You' : 'Gemini';
      const content = htmlToMarkdown(turn);
      if (content) messages.push({ role, content });
    }

    return messages.length ? messages : null;
  }

  // Grok (grok.com)
  // Selectors sourced from revivalstack/ai-chat-exporter (MIT)
  function extractGrok() {
    const items = document.querySelectorAll('div[id^="response-"]');
    if (!items.length) return null;

    return Array.from(items).map(item => {
      // User messages have items-end alignment class
      const isUser = item.classList.contains('items-end') ||
                     item.querySelector('.items-end') !== null;
      const role   = isUser ? 'You' : 'Grok';

      // Target the markdown content wrapper; fall back to the whole item
      const contentEl = item.querySelector('.response-content-markdown') ?? item;
      return { role, content: htmlToMarkdown(contentEl) };
    }).filter(m => m.content);
  }

  // Perplexity (perplexity.ai) — experimental
  function extractPerplexity() {
    // User queries: [data-testid="query-text"] or .break-words.whitespace-pre-line
    // querySelectorAll de-dupes, so matching both classes+attribute on the same element is fine
    const userEls = Array.from(document.querySelectorAll(
      '[data-testid="query-text"], .break-words.whitespace-pre-line, ' +
      'div[class*="UserQuery"] p, div[class*="userQuery"] p'
    )).map(el => ({ el, role: 'You' }));

    // AI answers: select the answer CONTAINER and extract from its .prose child if present.
    // Avoids double-counting (outer container + inner .prose are different DOM nodes).
    const answerContainers = Array.from(document.querySelectorAll(
      '[data-testid="answer"], div[class*="AnswerBody"], div[class*="answerContent"]'
    ));
    let answerEls;
    if (answerContainers.length) {
      answerEls = answerContainers.map(el => ({
        el: el.querySelector('.prose') ?? el,
        role: 'Perplexity',
      }));
    } else {
      // Fallback: bare .prose elements (when there's no answer wrapper)
      answerEls = Array.from(document.querySelectorAll('.prose'))
        .map(el => ({ el, role: 'Perplexity' }));
    }

    if (!userEls.length && !answerEls.length) return null;
    return [...userEls, ...answerEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // DeepSeek (chat.deepseek.com) — experimental
  function extractDeepSeek() {
    // DeepSeek uses data-role attributes or message class patterns
    const turns = document.querySelectorAll(
      '[class*="user_message"], [class*="assistant_message"], ' +
      '[data-role="user"], [data-role="assistant"], ' +
      'div[class*="r-message-bubble"]'
    );
    if (!turns.length) return null;

    return Array.from(turns).map(el => {
      const cls = el.className || '';
      const dataRole = el.getAttribute('data-role') || '';
      const isUser = dataRole === 'user' ||
                     cls.includes('user_message') ||
                     cls.includes('user-message');
      return { role: isUser ? 'You' : 'DeepSeek', content: htmlToMarkdown(el) };
    }).filter(m => m.content);
  }

  // Meta AI (meta.ai) — experimental
  // Meta's DOM uses React with obfuscated classes; these selectors target stable attributes.
  function extractMetaAI() {
    // Try data-role / data-message-author first (most stable)
    const byRole = document.querySelectorAll('[data-message-author], [data-author]');
    if (byRole.length) {
      return Array.from(byRole).map(el => {
        const author = el.getAttribute('data-message-author') || el.getAttribute('data-author') || '';
        const isUser = author === 'human' || author === 'user' || author === 'you';
        return { role: isUser ? 'You' : 'Meta AI', content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Fallback: class-name patterns seen in Meta AI's React output
    const userEls = Array.from(document.querySelectorAll(
      '[class*="UserMessage"], [class*="user-message"], [aria-label*="You said"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[class*="AssistantMessage"], [class*="BotMessage"], ' +
      '[class*="assistant-message"], [aria-label*="Meta AI"]'
    )).map(el => ({ el, role: 'Meta AI' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Mistral Le Chat (chat.mistral.ai) — experimental
  function extractMistral() {
    // Mistral's Next.js UI uses role-labelled containers
    const userEls = Array.from(document.querySelectorAll(
      '[data-role="user"], [class*="human"], [class*="Human"], ' +
      'div[class*="UserTurn"], div[class*="user-turn"], ' +
      'div[class*="HumanMessage"], div[class*="UserMessage"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[data-role="assistant"], [class*="assistant"], [class*="Assistant"], ' +
      'div[class*="AssistantTurn"], div[class*="assistant-turn"], ' +
      'div[class*="BotMessage"], div[class*="AssistantMessage"]'
    )).map(el => ({ el, role: 'Mistral' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // HuggingChat (huggingface.co/chat) — experimental
  // Selectors based on chat-ui open-source repo (github.com/huggingface/chat-ui)
  function extractHuggingChat() {
    // chat-ui renders messages with data attributes in newer versions
    const byDataRole = document.querySelectorAll('[data-message-role]');
    if (byDataRole.length) {
      return Array.from(byDataRole).map(el => {
        const role = el.getAttribute('data-message-role');
        const isUser = role === 'user';
        return { role: isUser ? 'You' : 'HuggingChat', content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Fallback: class-name patterns from chat-ui Svelte components
    const userEls = Array.from(document.querySelectorAll(
      '[class*="from-user"], [class*="human-message"], ' +
      'div[class*="UserMessage"], .message-wrapper.user'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[class*="from-assistant"], [class*="from-model"], ' +
      'div[class*="AssistantMessage"], .message-wrapper.assistant'
    )).map(el => ({ el, role: 'HuggingChat' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Poe (poe.com) — experimental
  // Poe is a multi-model platform (Claude, GPT-4, Gemini, etc.)
  // Its Next.js UI renders messages with role-based attributes
  function extractPoe() {
    // Primary: data-testid attributes (most stable across Poe UI versions)
    const byTestId = document.querySelectorAll(
      '[class*="Message_humanMessageBubble"], [class*="Message_botMessageBubble"], ' +
      '[class*="humanMessage"], [class*="botMessage"]'
    );
    if (byTestId.length) {
      return Array.from(byTestId).map(el => {
        const cls = el.className || '';
        const isUser = cls.includes('human') || cls.includes('Human');
        return { role: isUser ? 'You' : 'Bot', content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Fallback: alternating message containers with role indicators
    const userEls = Array.from(document.querySelectorAll(
      '[data-author-type="human"], [class*="UserMessage"], ' +
      'section[class*="human"]'
    )).map(el => ({ el, role: 'You' }));

    const botEls = Array.from(document.querySelectorAll(
      '[data-author-type="bot"], [class*="BotMessage"], ' +
      'section[class*="bot"]'
    )).map(el => {
      // Try to get the bot name from a label element near the message
      const nameEl = el.closest('[class*="ChatMessage"]')
        ?.querySelector('[class*="botName"], [class*="displayName"], h2');
      const role = nameEl?.textContent?.trim() || 'Bot';
      return { el, role };
    });

    if (!userEls.length && !botEls.length) return null;
    return [...userEls, ...botEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Phind (www.phind.com) — experimental
  // Phind mixes web search results with AI answers; we target the chat turns.
  function extractPhind() {
    // Phind's Next.js UI renders user queries and AI answers in alternating sections
    const userEls = Array.from(document.querySelectorAll(
      '[class*="userMessage"], [class*="UserMessage"], ' +
      '[class*="user-message"], div[data-role="user"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[class*="phindAnswer"], [class*="PhindAnswer"], ' +
      '[class*="ai-message"], [class*="aiMessage"], ' +
      'div[data-role="assistant"]'
    )).map(el => ({ el, role: 'Phind' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // NotebookLM (notebooklm.google.com) — experimental
  // NotebookLM renders a "chat" panel where you ask questions and get responses
  // grounded in your uploaded sources. The panel is a sidebar, not a full-page chat.
  function extractNotebookLM() {
    // Primary: chat message containers with role data attributes
    const byRole = document.querySelectorAll('[data-message-role], [class*="ChatMessage"]');
    if (byRole.length) {
      return Array.from(byRole).map(el => {
        const role = el.getAttribute('data-message-role') ||
                     (el.className.toLowerCase().includes('user') ? 'user' : 'assistant');
        const isUser = role === 'user' || role === 'human';
        return { role: isUser ? 'You' : 'NotebookLM', content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Fallback: Angular Material or Lit-based components Google tends to use
    const userEls = Array.from(document.querySelectorAll(
      '[class*="user-query"], [class*="userQuery"], ' +
      '[class*="human-message"], [aria-label*="Your question"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[class*="model-response"], [class*="modelResponse"], ' +
      '[class*="assistant-message"], [class*="ai-response"], ' +
      'notebook-lm-response, [class*="notebooklm"]'
    )).map(el => ({ el, role: 'NotebookLM' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Kagi Assistant (kagi.com/assistant) — experimental
  // Kagi is a privacy-first search engine with an AI assistant feature.
  function extractKagi() {
    // Kagi's assistant uses a clean chat UI similar to Claude
    const byRole = document.querySelectorAll('[data-role], [data-message-type]');
    if (byRole.length) {
      return Array.from(byRole).map(el => {
        const role = el.getAttribute('data-role') || el.getAttribute('data-message-type') || '';
        const isUser = role === 'user' || role === 'human';
        return { role: isUser ? 'You' : 'Kagi', content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Kagi assistant chat message selectors (inferred from Kagi's typical DOM)
    const userEls = Array.from(document.querySelectorAll(
      '[class*="user-message"], [class*="userMessage"], ' +
      '[class*="human-turn"], .prompt-text, [class*="query-bubble"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[class*="assistant-message"], [class*="assistantMessage"], ' +
      '[class*="kagi-response"], [class*="ai-message"], ' +
      '[class*="response-bubble"]'
    )).map(el => ({ el, role: 'Kagi' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
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

  // ─── Auto-scroll to load lazy messages ───────────────────────────────────

  /**
   * Scrolls the chat container to the top to trigger lazy-loading of older
   * messages (ChatGPT, Gemini). Waits until the DOM stabilises, then scrolls
   * back to the bottom so the user sees the latest message again.
   *
   * Only runs on platforms known to lazy-load (chatgpt, gemini, aistudio).
   */
  async function scrollToLoadAll() {
    const site = detectSite();
    if (!['chatgpt', 'gemini', 'aistudio'].includes(site)) return;

    try {
      // Prefer a specific scroll container; fall back to document.documentElement
      const container = (
        document.querySelector('main [class*="overflow-y-auto"]') ??   // ChatGPT
        document.querySelector('[class*="conversation-container"]') ??
        document.querySelector('main') ??
        document.documentElement
      );

      // Bail if the container doesn't support scrolling (e.g. test environment)
      if (typeof container.scrollTo !== 'function') return;

      container.scrollTo({ top: 0, behavior: 'smooth' });

      // Wait until scrollHeight is stable (no new nodes loaded) or 4 s max
      let prevHeight = container.scrollHeight;
      await new Promise(resolve => {
        let stableCount = 0;
        const STABLE_NEEDED = 3;   // three consecutive 350 ms checks with same height
        const check = setInterval(() => {
          const h = container.scrollHeight;
          if (h === prevHeight) {
            if (++stableCount >= STABLE_NEEDED) { clearInterval(check); resolve(); }
          } else {
            stableCount = 0;
            prevHeight  = h;
            container.scrollTo({ top: 0, behavior: 'smooth' }); // keep scrolling as content loads
          }
        }, 350);
        setTimeout(() => { clearInterval(check); resolve(); }, 4000);
      });

      // Restore scroll position so the user still sees the bottom of the chat
      container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
    } catch {
      // Scroll not supported in this environment — proceed without it
    }
  }

  // ─── Streaming / generation detection ────────────────────────────────────

  /**
   * Returns true if the AI appears to be mid-generation right now.
   * Checks platform-specific streaming indicators so we can warn before export.
   */
  function isStreaming() {
    const site = detectSite();

    // ChatGPT: a "stop" button is visible while generating
    if (site === 'chatgpt') {
      return !!(
        document.querySelector('[data-testid="stop-button"]') ||
        document.querySelector('button[aria-label*="Stop"]')
      );
    }

    // Claude: streaming indicator / "stop generating" button
    if (site === 'claude') {
      return !!(
        document.querySelector('[aria-label*="Stop"]') ||
        document.querySelector('[data-testid="stop-response-button"]') ||
        // Claude also shows a pulsing dot while streaming
        document.querySelector('.streaming-indicator, [class*="streaming"]')
      );
    }

    // Gemini: a stop/pause button appears during generation
    if (site === 'gemini') {
      return !!(
        document.querySelector('button[aria-label*="Stop"]') ||
        document.querySelector('[class*="stop-button"]') ||
        document.querySelector('mat-icon[fonticon="stop_circle"]')
      );
    }

    // Generic fallback: look for any visible "Stop generating" button
    const stopBtns = document.querySelectorAll(
      'button[aria-label*="stop" i], button[title*="stop" i], ' +
      '[class*="stop-button"], [class*="stopButton"]'
    );
    return Array.from(stopBtns).some(btn => {
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  }

  // ─── Main extraction dispatcher ───────────────────────────────────────────

  async function extractMessages() {
    // Scroll to top to trigger lazy-loading of older messages before we read the DOM
    await scrollToLoadAll();

    const site = detectSite();
    let messages = null;

    switch (site) {
      case 'chatgpt':     messages = extractChatGPT();          break;
      case 'claude':      messages = extractClaude();            break;
      case 'copilot':     messages = extractCopilot();           break;
      case 'gemini':      messages = extractGemini();            break;
      case 'aistudio':    messages = await extractAIStudio();    break;
      case 'grok':        messages = extractGrok();              break;
      case 'perplexity':  messages = extractPerplexity();        break;
      case 'deepseek':    messages = extractDeepSeek();          break;
      case 'metaai':      messages = extractMetaAI();            break;
      case 'mistral':     messages = extractMistral();           break;
      case 'huggingchat': messages = extractHuggingChat();       break;
      case 'poe':         messages = extractPoe();               break;
      case 'phind':       messages = extractPhind();             break;
      case 'notebooklm':  messages = extractNotebookLM();        break;
      case 'kagi':        messages = extractKagi();              break;
      default:            break;
    }

    if (!messages || !messages.length) messages = extractGeneric();
    return messages;
  }

  // ─── Title helper ─────────────────────────────────────────────────────────

  function getCleanTitle() {
    const rawTitle = document.title.replace(/[<>:"/\\|?*\n]/g, ' ').trim() || 'Chat Export';
    return rawTitle
      .replace(/\s[-–]\s*(ChatGPT|Claude|Gemini|Copilot|Grok|Perplexity|DeepSeek|Meta AI|Mistral|HuggingChat|NotebookLM|Kagi)$/i, '')
      .trim();
  }

  // ─── In-page Markdown builder ─────────────────────────────────────────────

  function buildMarkdownInPage(messages, title, hostname) {
    const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let md = `# ${title}\n\n> Exported from **${hostname}** on ${date}\n\n---\n\n`;
    for (const { role, content } of messages) {
      md += `## ${role}\n\n${content.trim()}\n\n---\n\n`;
    }
    return md;
  }

  // ─── In-page download helper ──────────────────────────────────────────────

  function downloadInPage(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─── In-page floating button ──────────────────────────────────────────────

  function injectInPageButton() {
    const site = detectSite();
    if (site === 'generic') return;                  // unsupported page
    if (document.getElementById('inkpour-root')) return; // already injected

    const root = document.createElement('div');
    root.id = 'inkpour-root';
    root.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:2147483647',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
    ].join(';');

    const shadow = root.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
<style>
  :host { all: initial; }

  .widget { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }

  .fab {
    width: 38px; height: 38px;
    background: #5b5bd6;
    color: #fff;
    border: none; border-radius: 50%;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; letter-spacing: -0.5px;
    box-shadow: 0 2px 12px rgba(91,91,214,0.45);
    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
    opacity: 0.82;
    flex-shrink: 0;
    font-family: inherit;
  }
  .fab:hover { transform: scale(1.08); box-shadow: 0 4px 18px rgba(91,91,214,0.55); opacity: 1; }
  .fab.active { opacity: 1; transform: scale(1.04); }

  .menu {
    display: flex; flex-direction: column; gap: 4px;
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 10px;
    padding: 5px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    min-width: 130px;
  }
  .menu[hidden] { display: none; }

  .menu-btn {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 10px;
    border: none; border-radius: 7px;
    background: transparent;
    color: #18181b;
    font-size: 12.5px; font-weight: 500;
    cursor: pointer;
    text-align: left;
    width: 100%;
    font-family: inherit;
    transition: background 0.12s;
    white-space: nowrap;
  }
  .menu-btn:hover { background: #f4f4f5; }
  .menu-btn:disabled { opacity: 0.45; cursor: default; }
  .menu-btn .icon { font-size: 14px; line-height: 1; flex-shrink: 0; }

  .status-msg {
    font-size: 11px; color: #71717a;
    padding: 3px 10px 4px;
    border-radius: 6px;
    text-align: center;
  }
  .status-msg.ok  { color: #16a34a; }
  .status-msg.err { color: #dc2626; }

  @media (prefers-color-scheme: dark) {
    .menu { background: #27272a; border-color: #3f3f46; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    .menu-btn { color: #fafafa; }
    .menu-btn:hover { background: #3f3f46; }
    .fab { background: #818cf8; box-shadow: 0 2px 12px rgba(129,140,248,0.45); }
  }
</style>

<div class="widget">
  <div class="menu" hidden id="inkpour-menu">
    <button class="menu-btn" id="inkpour-md">
      <span class="icon">⤓</span> Export MD
    </button>
    <button class="menu-btn" id="inkpour-copy">
      <span class="icon">⎘</span> Copy MD
    </button>
    <div class="status-msg" id="inkpour-status"></div>
  </div>
  <button class="fab" id="inkpour-fab" title="Inkpour — Export this chat">ip</button>
</div>`;

    document.body.appendChild(root);

    const fab    = shadow.getElementById('inkpour-fab');
    const menu   = shadow.getElementById('inkpour-menu');
    const mdBtn  = shadow.getElementById('inkpour-md');
    const cpBtn  = shadow.getElementById('inkpour-copy');
    const status = shadow.getElementById('inkpour-status');

    // Toggle menu
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.hidden;
      menu.hidden = open;
      fab.classList.toggle('active', !open);
      setStatus('', '');
    });

    // Close on outside click
    document.addEventListener('click', () => {
      if (!menu.hidden) {
        menu.hidden = true;
        fab.classList.remove('active');
      }
    });

    menu.addEventListener('click', e => e.stopPropagation());

    function setStatus(msg, type) {
      status.textContent = msg;
      status.className   = 'status-msg' + (type ? ` ${type}` : '');
    }

    async function runExport(action) {
      mdBtn.disabled = true;
      cpBtn.disabled = true;
      setStatus('Extracting…', '');
      try {
        const messages = await extractMessages();
        if (!messages.length) throw new Error('No messages found');
        const title    = getCleanTitle();
        const platform = detectSite();
        const slug     = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
        const filename = `${platform}-${slug}`;
        const md       = buildMarkdownInPage(messages, title, location.hostname);

        if (action === 'md') {
          downloadInPage(md, `${filename}.md`, 'text/markdown;charset=utf-8');
          setStatus('✓ Saved!', 'ok');
        } else {
          await navigator.clipboard.writeText(md);
          setStatus('✓ Copied!', 'ok');
        }
      } catch (err) {
        setStatus('✗ ' + err.message.slice(0, 50), 'err');
      } finally {
        mdBtn.disabled = false;
        cpBtn.disabled = false;
      }
    }

    mdBtn.addEventListener('click', () => runExport('md'));
    cpBtn.addEventListener('click', () => runExport('copy'));
  }

  // ─── SPA navigation: reinject button on URL change ────────────────────────

  (function watchNavigation() {
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        document.getElementById('inkpour-root')?.remove();
        setTimeout(injectInPageButton, 900);
      }
    });
    // Watching document.body for child changes catches most SPA routers
    observer.observe(document.body, { subtree: false, childList: true });
  })();

  // Inject on load
  injectInPageButton();

  // ─── Test hook — expose internals for JSDOM unit tests ───────────────────
  // Only active in test environments (window.__inkpourTestHostname is set).
  // Never used by real extension code.
  if (typeof window !== 'undefined' && window.__inkpourTestHostname !== undefined) {
    window.__inkpourHtmlToMarkdown = htmlToMarkdown;
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  api.runtime.onMessage.addListener((msg) => {
    // Clipboard write — delegated here from background.js (service workers
    // don't have clipboard access; content scripts in active tabs do)
    if (msg.action === 'copyToClipboard') {
      return navigator.clipboard.writeText(msg.text)
        .then(() => ({ ok: true }))
        .catch(err => ({ error: err.message }));
    }

    if (msg.action !== 'extract') return;

    // Warn if the AI is still generating — export now would be incomplete
    if (isStreaming()) {
      return Promise.resolve({
        error: 'The AI is still generating. Wait for it to finish, then export.',
        streaming: true,
      });
    }

    return extractMessages().then(messages => {
      if (!messages.length) {
        return { error: 'No messages found. Make sure a chat is open and fully loaded.' };
      }

      const cleanTitle = getCleanTitle();
      const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

      return {
        messages,
        title:    cleanTitle,
        site:     location.hostname,
        platform: detectSite(),   // clean slug: 'chatgpt', 'claude', etc.
        filename: slug,           // title-based slug for use in filename templates
      };
    }).catch(err => {
      return { error: `Extraction failed: ${err.message}` };
    });
  });

})();
