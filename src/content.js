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

      case 'mark': {
        // Highlighted text — render as bold (no universal MD highlight syntax)
        const inner = children().trim();
        return inner ? `**${inner}**` : '';
      }

      case 'kbd': {
        // Keyboard key — render as inline code
        const inner = children().trim();
        return inner ? `\`${inner}\`` : '';
      }

      case 'abbr': {
        // Abbreviation — include title in parens if present
        const inner = children().trim();
        const title = node.getAttribute('title');
        return title ? `${inner} (${title})` : inner;
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
        let src   = node.getAttribute('src') || '';
        // Skip embedded data URIs (too large for Markdown) and ephemeral blob URLs
        if (src.startsWith('data:')) src = '[embedded image]';
        else if (src.startsWith('blob:'))  src = '[blob image — not persistent]';
        if (!src && !alt) return '';
        return `![${alt}](${src})`;
      }

      case 'table': return convertTable(node);

      // ── Collapsible sections ─────────────────────────────────────────────
      // <details><summary>Thinking…</summary>…</details>
      // Used by Claude's extended thinking, and some platforms for footnotes/sources.
      // Rendered as a labelled blockquote so content is visible in all MD renderers.
      case 'details': {
        const summaryEl = node.querySelector(':scope > summary');
        const label = summaryEl ? summaryEl.textContent.trim() : 'Details';
        // Process child nodes directly, skipping <summary> — avoids recursive loop
        const body = Array.from(node.childNodes)
          .filter(n => !(n.nodeType === Node.ELEMENT_NODE &&
                         n.tagName.toLowerCase() === 'summary'))
          .map(convertNode)
          .join('')
          .trim();
        if (!body) return '';
        const lines = body.split('\n').map(l => `> ${l}`).join('\n');
        return `\n\n> **${label}**\n>\n${lines}\n\n`;
      }

      case 'summary': return ''; // handled inside <details>

      // ── Math ────────────────────────────────────────────────────────────
      // KaTeX renders <span class="katex">…</span> with an <annotation> holding
      // the LaTeX source. MathJax uses <mjx-container> with a similar pattern.
      case 'span': {
        // KaTeX inline math: extract LaTeX from <annotation encoding="application/x-tex">
        if (node.classList?.contains('katex') || node.classList?.contains('katex-display')) {
          const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
          if (annotation) {
            const tex = annotation.textContent.trim();
            const isDisplay = node.classList.contains('katex-display');
            return isDisplay ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
          }
        }
        return children();
      }

      // MathJax container
      case 'mjx-container': {
        const annotation = node.querySelector('annotation[encoding="application/x-tex"]') ||
                           node.querySelector('annotation');
        if (annotation) {
          const tex = annotation.textContent.trim();
          const isBlock = node.getAttribute('display') === 'true';
          return isBlock ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
        }
        return children();
      }

      // ── Figures ──────────────────────────────────────────────────────────
      case 'figure': {
        const caption = node.querySelector('figcaption');
        const imgEl   = node.querySelector('img');
        const captionText = caption ? caption.textContent.trim() : '';
        if (imgEl) {
          const alt  = imgEl.getAttribute('alt') || captionText;
          const src  = imgEl.getAttribute('src') || '';
          const md   = `![${alt}](${src})`;
          return captionText ? `\n\n${md}\n*${captionText}*\n\n` : `\n\n${md}\n\n`;
        }
        return children();
      }
      case 'figcaption': return ''; // handled inside <figure>

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
    const body   = rows.slice(1).map(toRow);
    // Detect numeric columns: if every non-empty body cell in a column looks like a number → right-align
    const isNumeric = header.map((_, ci) =>
      body.length > 0 &&
      body.every(r => !r[ci] || /^-?[\d,]+(\.\d+)?%?$/.test(r[ci].replace(/,/g, '')))
    );
    const sep = header.map((_, ci) => isNumeric[ci] ? '--:' : '---');
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
    if ((host === 'www.google.com' || host === 'google.com') &&
        location.pathname === '/search')                                     return 'googlesearch';
    if (host.includes('grok.com'))                                          return 'grok';
    if (host.includes('console.groq.com'))                                  return 'groq';
    if (host.includes('chat.z.ai'))                                         return 'zai';
    if (host.includes('perplexity.ai'))                                     return 'perplexity';
    if (host.includes('chat.deepseek.com'))                                 return 'deepseek';
    if (host.includes('meta.ai'))                                           return 'metaai';
    if (host.includes('chat.mistral.ai'))                                   return 'mistral';
    if (host.includes('huggingface.co'))                                    return 'huggingchat';
    if (host.includes('poe.com'))                                           return 'poe';
    if (host.includes('phind.com'))                                          return 'phind';
    if (host.includes('notebooklm.google.com'))                             return 'notebooklm';
    if (host.includes('kagi.com'))                                          return 'kagi';
    if (host.includes('venice.ai'))                                         return 'venice';
    if (host.includes('lmarena.ai') || host.includes('chat.lmsys.org'))     return 'lmarena';
    if (host.includes('character.ai'))                                       return 'characterai';
    if (host.includes('coral.cohere.com'))                                   return 'cohere';
    if (host.includes('pi.ai'))                                              return 'piai';
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
      const contentEl = (turn.querySelector('.markdown, [class*="prose"], .text-message') ?? turn).cloneNode(true);

      // ChatGPT Canvas: canvas documents appear as embedded components.
      // Extract the code/text from them before stripping.
      const canvasSuffix = [];
      contentEl.querySelectorAll('[class*="canvas"], [data-testid*="canvas"]').forEach(cvEl => {
        const codeEl = cvEl.querySelector('code, pre, textarea, [class*="content-editable"]');
        if (codeEl) {
          const code = codeEl.textContent.trim();
          if (code) canvasSuffix.push(`\`\`\`\n${code}\n\`\`\``);
        }
        cvEl.remove();
      });

      let content = htmlToMarkdown(contentEl);
      if (canvasSuffix.length) content = (content ? content + '\n\n' : '') + canvasSuffix.join('\n\n');
      return { role: label, content };
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
      const clone = el.cloneNode(true);

      // Extract artifact code before removing the artifact block.
      // Claude renders artifacts as isolated code editors — the code source is
      // inside a <code> element or a [class*="ace_text"] / .cm-content block.
      // We inject it as a fenced code block so the export is complete.
      const artifactSuffix = [];
      clone.querySelectorAll('.artifact-block-cell, [class*="artifact-block"]').forEach(artEl => {
        // Try to grab the artifact's code content
        const codeEl = artEl.querySelector('code, pre, .cm-content, [class*="ace_text-layer"]');
        if (codeEl) {
          // Detect language from sibling header or code class
          let lang = '';
          const header = artEl.querySelector('[class*="lang"], [data-artifacttype]');
          if (header) {
            const t = (header.textContent || header.getAttribute('data-artifacttype') || '').trim().toLowerCase();
            if (/^[a-z][a-z0-9+#.-]{0,20}$/.test(t)) lang = t;
          }
          if (!lang) {
            const cls = codeEl.className || '';
            const m = cls.match(/language-(\w+)/);
            if (m) lang = m[1];
          }
          const code = codeEl.textContent.trim();
          if (code) artifactSuffix.push(`\`\`\`${lang}\n${code}\n\`\`\``);
        }
        artEl.remove();
      });
      // Also strip remaining artifact-related UI elements (buttons, badges)
      clone.querySelectorAll('[class*="artifact"]').forEach(n => n.remove());

      let content = htmlToMarkdown(clone);
      if (artifactSuffix.length) {
        content = (content ? content + '\n\n' : '') + artifactSuffix.join('\n\n');
      }
      return { role, content };
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

  // Groq Playground (console.groq.com/playground) — experimental
  // GroqCloud's playground is an OpenAI-compatible chat UI built on Next.js/Tailwind.
  // Roles are "user" and "assistant" (displayed with the active model name).
  function extractGroq() {
    // Primary: role data attributes (most stable if present)
    const byRole = document.querySelectorAll('[data-role], [data-message-role]');
    if (byRole.length) {
      return Array.from(byRole).map(el => {
        const raw  = el.getAttribute('data-role') || el.getAttribute('data-message-role') || '';
        const role = raw.toLowerCase() === 'user' ? 'You' : 'Groq';
        return { role, content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Secondary: look for alternating user / assistant containers.
    // Groq's playground renders a label element ("user" / model name) immediately
    // before each message bubble, so we walk sibling pairs.
    const labelEls = document.querySelectorAll(
      '[class*="role-label"], [class*="message-role"], [class*="chat-role"]'
    );
    if (labelEls.length) {
      return Array.from(labelEls).map(label => {
        const raw  = label.textContent.trim().toLowerCase();
        const role = raw === 'user' ? 'You' : 'Groq';
        const contentEl = label.nextElementSibling ?? label.parentElement?.nextElementSibling;
        const content   = contentEl ? htmlToMarkdown(contentEl) : '';
        return { role, content };
      }).filter(m => m.content);
    }

    // Tertiary: generic message containers — Groq's chat bubbles are typically
    // flex rows; user messages are right-aligned, assistant left-aligned.
    const bubbles = document.querySelectorAll(
      '[class*="message-bubble"], [class*="chat-bubble"], [class*="chat-message"]'
    );
    if (bubbles.length) {
      return Array.from(bubbles).map(el => {
        const isUser = el.classList.toString().includes('user') ||
                       window.getComputedStyle(el).justifyContent === 'flex-end';
        return { role: isUser ? 'You' : 'Groq', content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Quaternary: prose blocks — AI responses are wrapped in .prose / .markdown
    // and user messages appear in a plain text container above each one.
    const proseEls = document.querySelectorAll('.prose, .markdown-body, [class*="prose"]');
    if (proseEls.length) {
      // Each .prose is an AI response; look for the user message immediately before it.
      const messages = [];
      proseEls.forEach(prose => {
        const prev = prose.closest('[class*="message"], [class*="turn"]')?.previousElementSibling;
        if (prev) messages.push({ role: 'You',  content: htmlToMarkdown(prev) });
        messages.push({ role: 'Groq', content: htmlToMarkdown(prose) });
      });
      if (messages.length) return messages.filter(m => m.content);
    }

    return null;
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
  // Confirmed against chat-ui source (ChatMessage.svelte, July 2026):
  //   User turn:     [data-message-type="user"]     → text in p.disabled or p.whitespace-break-spaces
  //   Assistant turn:[data-message-role="assistant"] → rendered markdown in .prose child
  function extractHuggingChat() {
    // Primary: verified data attributes from chat-ui open-source Svelte component
    const userEls = Array.from(document.querySelectorAll('[data-message-type="user"]'));
    const aiEls   = Array.from(document.querySelectorAll('[data-message-role="assistant"]'));

    if (userEls.length || aiEls.length) {
      const combined = [
        ...userEls.map(el => ({ el, role: 'You' })),
        ...aiEls.map(el => ({ el, role: 'HuggingChat' })),
      ].sort(sortByDOMOrder);

      return combined.map(({ el, role }) => {
        if (role === 'You') {
          // User text lives in a plain <p> (no markdown rendering)
          const p = el.querySelector('p.disabled, p[class*="whitespace-break-spaces"], p[class*="whitespace-pre"]');
          return { role, content: (p ?? el).textContent.trim() };
        }
        // AI response: grab the .prose child (rendered markdown); fall back to full element
        const prose = el.querySelector('.prose') ?? el;
        return { role, content: htmlToMarkdown(prose) };
      }).filter(m => m.content);
    }

    // Fallback: older chat-ui versions used class patterns
    const fallbackUser = Array.from(document.querySelectorAll(
      '[class*="from-user"], [class*="human-message"], .message-wrapper.user'
    )).map(el => ({ el, role: 'You' }));

    const fallbackAI = Array.from(document.querySelectorAll(
      '[class*="from-assistant"], [class*="from-model"], .message-wrapper.assistant'
    )).map(el => ({ el, role: 'HuggingChat' }));

    if (!fallbackUser.length && !fallbackAI.length) return null;
    return [...fallbackUser, ...fallbackAI]
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
    /**
     * Extract citation superscripts from a NotebookLM AI response element.
     * Looks for <sup data-source-index="N">, <sup><a>, or [class*="citation"] elements.
     * Returns a deduplicated sorted array of source numbers (1-based).
     */
    function extractCitations(el) {
      const sups = el.querySelectorAll('sup[data-source-index], sup > a, [class*="citation"]');
      if (!sups.length) return [];
      const nums = new Set();
      sups.forEach(sup => {
        // data-source-index is 0-based; display as 1-based
        const idx = sup.getAttribute('data-source-index');
        if (idx !== null) {
          nums.add(Number(idx) + 1);
        } else {
          // Try to extract a number from the text content
          const n = parseInt(sup.textContent.trim(), 10);
          if (!isNaN(n) && n > 0) nums.add(n);
        }
      });
      return [...nums].sort((a, b) => a - b);
    }

    function buildContentWithCitations(el, isUser) {
      let content = htmlToMarkdown(el);
      if (!isUser) {
        const citations = extractCitations(el);
        if (citations.length) {
          content += '\n\n**Sources:** ' + citations.map(n => `[${n}]`).join(' ');
        }
      }
      return content;
    }

    // Primary: chat message containers with role data attributes
    const byRole = document.querySelectorAll('[data-message-role], [class*="ChatMessage"]');
    if (byRole.length) {
      return Array.from(byRole).map(el => {
        const role = el.getAttribute('data-message-role') ||
                     (el.className.toLowerCase().includes('user') ? 'user' : 'assistant');
        const isUser = role === 'user' || role === 'human';
        return { role: isUser ? 'You' : 'NotebookLM', content: buildContentWithCitations(el, isUser) };
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
      .map(({ el, role }) => {
        const isUser = role === 'You';
        return { role, content: buildContentWithCitations(el, isUser) };
      })
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

  // Venice.ai (venice.ai) — Chakra UI + react-virtuoso
  // DOM confirmed July 2026:
  //   All turns live inside .chakra-stack (react-virtuoso scroll root)
  //   AI turns:   .assistant > .assistant-content > .prose
  //   User turns: direct children of chakra-stack that are NOT .assistant
  //               (bare div/p with no assistant class)
  function extractVenice() {
    // Prefer explicit AI containers
    const aiEls = Array.from(document.querySelectorAll('.assistant-content .prose, .assistant .prose'))
      .map(el => ({ el, role: 'Venice' }));

    // User messages: elements marked with aria or class patterns
    const userEls = Array.from(document.querySelectorAll(
      '[class*="userMessage"], [class*="user-message"], [class*="UserMessage"], ' +
      '[data-role="user"], [aria-label*="user"], [aria-label*="You"]'
    )).map(el => ({ el, role: 'You' }));

    // Fallback: scan the chakra scroll root for alternating blocks
    if (!aiEls.length && !userEls.length) {
      const root = document.querySelector('.minds-chat-scroll-root, [class*="chakra-stack"]');
      if (!root) return null;
      const children = Array.from(root.children);
      const combined = [];
      for (const child of children) {
        const isAI = child.classList.contains('assistant') ||
                     child.querySelector('.assistant-content, .prose');
        const prose = isAI && (child.querySelector('.prose') ?? child);
        if (isAI && prose) {
          combined.push({ el: prose, role: 'Venice' });
        } else if (!isAI && child.textContent.trim()) {
          combined.push({ el: child, role: 'You' });
        }
      }
      return combined.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
                     .filter(m => m.content);
    }

    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Lmsys Chatbot Arena (lmarena.ai, chat.lmsys.org) — experimental
  // Gradio-based multi-model comparison UI. We extract the first model column only.
  function extractLmarena() {
    // Primary: Gradio data-testid attributes
    const userEls = Array.from(document.querySelectorAll(
      '[data-testid="user-message"] > p, [data-testid="user-message"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      '[data-testid="bot-message"] .prose, [data-testid="bot-message"]'
    )).map(el => ({ el, role: 'Chatbot Arena' }));

    if (userEls.length || aiEls.length) {
      return [...userEls, ...aiEls]
        .sort(sortByDOMOrder)
        .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
        .filter(m => m.content);
    }

    // Secondary: Gradio .user/.bot class pattern; grab first model column
    const userClassEls = Array.from(document.querySelectorAll('.user > p, .user'))
      .map(el => ({ el, role: 'You' }));
    const botClassEls = Array.from(document.querySelectorAll('.bot > p, .bot'))
      .map(el => ({ el, role: 'Chatbot Arena' }));

    // Deduplicate: arena shows two model columns — keep only first occurrence per DOM position
    const seenPositions = new Set();
    const deduped = [...userClassEls, ...botClassEls]
      .sort(sortByDOMOrder)
      .filter(({ el }) => {
        const key = el.getBoundingClientRect().top.toFixed(0);
        if (seenPositions.has(key)) return false;
        seenPositions.add(key);
        return true;
      });

    // Fallback: generic message containers
    if (!deduped.length) {
      const fallbackUser = Array.from(document.querySelectorAll('div.message.user'))
        .map(el => ({ el, role: 'You' }));
      const fallbackBot = Array.from(document.querySelectorAll('div.message.bot'))
        .map(el => ({ el, role: 'Chatbot Arena' }));
      const combined = [...fallbackUser, ...fallbackBot].sort(sortByDOMOrder);
      return combined.length
        ? combined.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) })).filter(m => m.content)
        : null;
    }

    return deduped.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) })).filter(m => m.content);
  }

  // Character.AI (character.ai) — experimental
  // React-based SPA; class names are obfuscated but data-author-name is stable.
  function extractCharacterAI() {
    // Primary: data-author-name attribute (most stable)
    const byAuthor = document.querySelectorAll('[data-author-name]');
    if (byAuthor.length) {
      return Array.from(byAuthor).map(el => {
        const author = el.getAttribute('data-author-name') || '';
        const isUser = author.toLowerCase() === 'user' || author.toLowerCase() === 'you';
        // Try to get the character name from the first AI message
        const role = isUser ? 'You' : (author || 'Character.AI');
        const p = el.querySelector('p') ?? el;
        return { role, content: htmlToMarkdown(p) };
      }).filter(m => m.content);
    }

    // Secondary: obfuscated class-name patterns
    const userEls = Array.from(document.querySelectorAll(
      'div[class*="UserMessage"] p, div[class*="UserMessage"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      'div[class*="CharacterMessage"] p, div[class*="CharacterMessage"], ' +
      '[class*="character-response"]'
    )).map(el => ({ el, role: 'Character.AI' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Cohere Coral / Command R+ chat (coral.cohere.com) — experimental
  function extractCohere() {
    // Primary: data-testid attributes
    const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"]'))
      .map(el => ({ el, role: 'You' }));
    const aiEls = Array.from(document.querySelectorAll('[data-testid="assistant-message"]'))
      .map(el => ({ el, role: 'Cohere' }));

    if (userEls.length || aiEls.length) {
      return [...userEls, ...aiEls]
        .sort(sortByDOMOrder)
        .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
        .filter(m => m.content);
    }

    // Secondary: class-name patterns
    const fallbackUser = Array.from(document.querySelectorAll(
      'div[class*="userMessage"], div[class*="user-message"]'
    )).map(el => ({ el, role: 'You' }));

    const fallbackAI = Array.from(document.querySelectorAll(
      'div[class*="assistantMessage"] .prose, div[class*="assistantMessage"], ' +
      'div[class*="assistant-message"]'
    )).map(el => ({ el, role: 'Cohere' }));

    if (!fallbackUser.length && !fallbackAI.length) return null;
    return [...fallbackUser, ...fallbackAI]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Pi.ai (pi.ai) — experimental
  // SPA with human/pi role indicators; uses data-role or class-name patterns.
  function extractPiAI() {
    // Primary: data-role attributes
    const byRole = document.querySelectorAll('[data-role="human"], [data-role="pi"]');
    if (byRole.length) {
      return Array.from(byRole).map(el => {
        const role = el.getAttribute('data-role') === 'human' ? 'You' : 'Pi';
        return { role, content: htmlToMarkdown(el) };
      }).filter(m => m.content);
    }

    // Secondary: class-name patterns
    const userEls = Array.from(document.querySelectorAll(
      'div[class*="human"] p, div[class*="human"]'
    )).map(el => ({ el, role: 'You' }));

    const aiEls = Array.from(document.querySelectorAll(
      'div[class*="pi"] p, div[class*="pi"]'
    )).map(el => ({ el, role: 'Pi' }));

    if (!userEls.length && !aiEls.length) return null;
    return [...userEls, ...aiEls]
      .sort(sortByDOMOrder)
      .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
      .filter(m => m.content);
  }

  // Z.ai (chat.z.ai) — Zhipu AI / GLM-5, Svelte-based chat UI
  // Selectors confirmed by live DOM inspection:
  //   .chat-user    — user turn wrapper (plain text in whitespace-pre-wrap div)
  //   .chat-assistant — AI turn wrapper (rendered markdown in #response-content-container)
  //   .dot inside .chat-assistant — streaming indicator (pulsing dots)
  function extractZAI() {
    const userEls     = Array.from(document.querySelectorAll('.chat-user'))
      .map(el => ({ el, role: 'You' }));
    const assistantEls = Array.from(document.querySelectorAll('.chat-assistant'))
      .map(el => ({ el, role: 'Z.ai' }));

    const combined = [...userEls, ...assistantEls].sort(sortByDOMOrder);
    if (!combined.length) return null;

    return combined.map(({ el, role }) => {
      if (role === 'You') {
        // User text lives in a whitespace-pre-wrap container — grab plain text
        const textEl = el.querySelector('[class*="whitespace-pre-wrap"], [class*="whitespace"]');
        const content = (textEl ?? el).textContent.trim();
        return { role, content };
      }
      // AI response: prefer #response-content-container, fall back to whole element
      const contentEl = el.querySelector('#response-content-container') ?? el;
      return { role, content: htmlToMarkdown(contentEl) };
    }).filter(m => m.content);
  }

  // Google Search — AI Overviews and AI Mode (google.com/search)
  // Handles two variants:
  //   - Standard search with AI Overview (appears above organic results)
  //   - AI Mode (?udm=50): full conversational interface
  function extractGoogleAISearch() {
    const sp    = new URLSearchParams(location.search);
    const query = sp.get('q') || document.title.replace(/\s*-\s*Google\s+(Search|Search Labs|AI)?$/i, '').trim();
    const isAIMode = sp.get('udm') === '50';

    const messages = [];

    if (isAIMode) {
      // AI Mode: multi-turn conversational interface.
      // Verified against live DOM (Firefox + Chrome, July 2026): each turn
      // (query + answer together) is wrapped in a [jsname="RH7zg"] container.
      // The query is a [role="heading"][jsname="eFVkfb"] element made of a
      // visually-hidden "You said:" label (.iMqumd) + the actual query text.
      // jsname attributes are Google's internal event-binding hooks and are
      // far more stable across deploys than the obfuscated CSS class names.
      const turns = document.querySelectorAll('[jsname="RH7zg"]');
      if (turns.length) {
        turns.forEach(turn => {
          const clone = turn.cloneNode(true);
          // Strip decorative/duplicate a11y-hidden content (e.g. stacked
          // "Copy" / "Copied" / "Edit" button-state labels).
          clone.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());

          const heading = clone.querySelector('[role="heading"][jsname="eFVkfb"]');
          let q = '';
          if (heading) {
            q = heading.textContent.replace(/^You said:\s*/i, '').trim();
            heading.remove();
          }
          if (q) messages.push({ role: 'You', content: q });

          const answer = htmlToMarkdown(clone).trim();
          if (answer) messages.push({ role: 'Gemini', content: answer });
        });
      }

      // Fallback: older/speculative selectors, kept in case Google changes
      // the DOM again and the primary selectors above stop matching.
      if (!messages.length) {
        const userEls = document.querySelectorAll(
          '[data-turn-query], [jsname="IWGqac"], .user-query-text, [aria-label*="Your question"]'
        );
        const aiEls = document.querySelectorAll(
          '[data-turn-response], [jsname="rfDRyf"], .ai-response-container, [aria-label*="AI response"]'
        );
        const maxTurns = Math.max(userEls.length, aiEls.length);
        for (let i = 0; i < maxTurns; i++) {
          if (userEls[i]) {
            const c = htmlToMarkdown(userEls[i]).trim();
            if (c) messages.push({ role: 'You', content: c });
          }
          if (aiEls[i]) {
            const c = htmlToMarkdown(aiEls[i]).trim();
            if (c) messages.push({ role: 'Gemini', content: c });
          }
        }
      }

      // Last-resort fallback: any message-like containers inside the AI Mode UI
      if (!messages.length) {
        const genericTurns = document.querySelectorAll('[data-q], [data-message-role], [class*="conversation-turn"]');
        genericTurns.forEach(el => {
          const role = el.getAttribute('data-message-role') || el.getAttribute('data-q') ? 'You' : 'Gemini';
          const c = htmlToMarkdown(el).trim();
          if (c) messages.push({ role, content: c });
        });
      }

      if (messages.length) return messages;
    }

    // Standard search with AI Overview
    // Insert user query as the first "turn"
    if (query) messages.push({ role: 'You', content: query });

    // Try multiple selectors for the AI Overview block — Google changes these frequently
    const aiEl = (
      // Custom element (most stable if present)
      document.querySelector('ai-overview') ||
      // Aria-labeled region
      document.querySelector('[role="region"][aria-label*="AI Overview"]') ||
      document.querySelector('[role="region"][aria-label*="AI overview"]') ||
      // Data attributes used by Google's component framework
      document.querySelector('[data-attrid*="description"]') ||
      // Class-based (less stable, ordered roughly newest → oldest)
      document.querySelector('.Lfqih') ||
      document.querySelector('.xBhz3e') ||
      document.querySelector('.AX8yFf') ||
      document.querySelector('.LLtSOc') ||
      // Broad fallback: first element with "AI Overview" in its visible text label
      (() => {
        const sections = document.querySelectorAll('[class*="overview"], [class*="Overview"]');
        return sections[0] || null;
      })()
    );

    if (aiEl) {
      const content = htmlToMarkdown(aiEl).trim();
      if (content) messages.push({ role: 'Gemini', content });
    }

    // Only return if we found an AI response (not just the bare query)
    return messages.length >= 2 ? messages : null;
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

      try { await (chrome || browser).storage.session.set({ inkpourScrolling: true, inkpourScrollMsg: 'Loading older messages…' }); } catch (_) {}

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
            try { (chrome || browser).storage.session.set({ inkpourScrolling: true, inkpourScrollMsg: 'Loading older messages…' }); } catch (_) {}
            container.scrollTo({ top: 0, behavior: 'smooth' }); // keep scrolling as content loads
          }
        }, 350);
        setTimeout(() => { clearInterval(check); resolve(); }, 4000);
      });

      try { await (chrome || browser).storage.session.set({ inkpourScrolling: false, inkpourScrollMsg: '' }); } catch (_) {}

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

    // Z.ai: pulsing dot animation inside the assistant container means streaming
    if (site === 'zai') {
      return !!document.querySelector('.chat-assistant .dot');
    }

    // Venice.ai: Chakra spinner or aria-busy on the assistant container
    if (site === 'venice') {
      return !!(
        document.querySelector('.assistant [aria-busy="true"]') ||
        document.querySelector('[class*="chakra-spinner"]') ||
        document.querySelector('.assistant-content [class*="loading"], .assistant-content [class*="thinking"]')
      );
    }

    // Lmsys Chatbot Arena: Gradio shows aria-busy on the bot message or a loading spinner
    if (site === 'lmarena') {
      return !!(
        document.querySelector('[data-testid="bot-message"][aria-busy="true"]') ||
        document.querySelector('.loading, [class*="loading-spinner"]')
      );
    }

    // Character.AI: loading indicator while generating
    if (site === 'characterai') {
      return !!(
        document.querySelector('[class*="CharacterMessage"] [class*="loading"]') ||
        document.querySelector('[aria-busy="true"]')
      );
    }

    // Cohere Coral: aria-busy or loading spinner
    if (site === 'cohere') {
      return !!(
        document.querySelector('[data-testid="assistant-message"][aria-busy="true"]') ||
        document.querySelector('[class*="loading-spinner"], [class*="loadingSpinner"]')
      );
    }

    // Pi.ai: loading indicator while generating
    if (site === 'piai') {
      return !!(
        document.querySelector('[data-role="pi"][aria-busy="true"]') ||
        document.querySelector('[class*="pi"] [class*="loading"], [class*="typing-indicator"]')
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
      case 'groq':        messages = extractGroq();              break;
      case 'zai':         messages = extractZAI();               break;
      case 'perplexity':  messages = extractPerplexity();        break;
      case 'deepseek':    messages = extractDeepSeek();          break;
      case 'metaai':      messages = extractMetaAI();            break;
      case 'mistral':     messages = extractMistral();           break;
      case 'huggingchat': messages = extractHuggingChat();       break;
      case 'poe':         messages = extractPoe();               break;
      case 'phind':       messages = extractPhind();             break;
      case 'notebooklm':  messages = extractNotebookLM();        break;
      case 'kagi':        messages = extractKagi();              break;
      case 'venice':      messages = extractVenice();            break;
      case 'lmarena':     messages = extractLmarena();           break;
      case 'characterai': messages = extractCharacterAI();       break;
      case 'cohere':      messages = extractCohere();            break;
      case 'piai':        messages = extractPiAI();              break;
      case 'googlesearch': messages = extractGoogleAISearch();   break;
      default:            break;
    }

    if (!messages || !messages.length) messages = extractGeneric();
    return messages;
  }

  // ─── Title helpers ────────────────────────────────────────────────────────

  function getCleanTitle() {
    const rawTitle = document.title.replace(/[<>:"/\\|?*\n]/g, ' ').trim() || 'Chat Export';
    return rawTitle
      .replace(/\s[-–]\s*(ChatGPT|Claude|Gemini|Copilot|Grok|Perplexity|DeepSeek|Meta AI|Mistral|HuggingChat|NotebookLM|Kagi|Google Search|Google AI|Google)$/i, '')
      .trim();
  }

  /**
   * If the page title is generic (e.g. "New chat", "Untitled"), derive a
   * better title from the first user message (first 8 significant words).
   * Returns the improved title, or the original if it already looks specific.
   */
  const GENERIC_TITLE_RE = /^(new\s+chat|new\s+conversation|untitled|chat|conversation|claude|gemini|chatgpt|gpt|copilot|grok|perplexity|deepseek|meta\s*ai|mistral|poe|phind|assistant|chat\s+export|start\s+a\s+new\s+chat)$/i;

  function smartenTitle(title, messages) {
    const clean = (title || '').trim();
    // Keep it if it's specific enough
    if (clean.length > 10 && !GENERIC_TITLE_RE.test(clean)) return clean;

    // Find first user/human message
    const firstUser = messages.find(m => {
      const r = (m.role || '').toLowerCase();
      return r === 'you' || r === 'user' || r === 'human';
    });
    if (!firstUser) return clean || 'Chat Export';

    const words = firstUser.content
      .replace(/```[\s\S]*?```/g, '')        // strip code fences
      .replace(/[#*`_~\[\]()>|\\]/g, '')     // strip markdown syntax chars
      .replace(/https?:\/\/\S+/g, '')         // strip bare URLs
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 1)              // skip single-char tokens
      .slice(0, 8)
      .join(' ');

    return words.length > 4 ? words : (clean || 'Chat Export');
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
    <button class="menu-btn" id="inkpour-html">
      <span class="icon">🌐</span> Export HTML
    </button>
    <button class="menu-btn" id="inkpour-docx">
      <span class="icon">📄</span> Export DOCX
    </button>
    <button class="menu-btn" id="inkpour-pdf">
      <span class="icon">🖨</span> Export PDF
    </button>
    <button class="menu-btn" id="inkpour-zip">
      <span class="icon">📦</span> Export ZIP
    </button>
    <div class="status-msg" id="inkpour-status"></div>
  </div>
  <button class="fab" id="inkpour-fab" title="Inkpour — Export this chat">ip</button>
</div>`;

    document.body.appendChild(root);

    const fab     = shadow.getElementById('inkpour-fab');
    const menu    = shadow.getElementById('inkpour-menu');
    const mdBtn   = shadow.getElementById('inkpour-md');
    const cpBtn   = shadow.getElementById('inkpour-copy');
    const htmlBtn = shadow.getElementById('inkpour-html');
    const docxBtn = shadow.getElementById('inkpour-docx');
    const pdfBtn  = shadow.getElementById('inkpour-pdf');
    const zipBtn  = shadow.getElementById('inkpour-zip');
    const status  = shadow.getElementById('inkpour-status');
    const allBtns = [mdBtn, cpBtn, htmlBtn, docxBtn, pdfBtn, zipBtn];

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

    function disableAll() { allBtns.forEach(b => { b.disabled = true; }); }
    function enableAll()  { allBtns.forEach(b => { b.disabled = false; }); }

    async function runExport(action) {
      disableAll();
      setStatus('Extracting…', '');
      try {
        const messages = await extractMessages();
        if (!messages.length) throw new Error('No messages found');
        const title    = smartenTitle(getCleanTitle(), messages);
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
        enableAll();
      }
    }

    // PDF and ZIP require the background service worker (can't open tabs / build ZIP here)
    async function runBgExport(format) {
      disableAll();
      setStatus('Exporting…', '');
      try {
        await api.runtime.sendMessage({ action: 'inPageExport', format });
        setStatus(`✓ ${format.toUpperCase()} export started`, 'ok');
      } catch (err) {
        setStatus('✗ ' + (err.message || 'Export failed').slice(0, 50), 'err');
      } finally {
        enableAll();
      }
    }

    mdBtn.addEventListener('click', () => runExport('md'));
    cpBtn.addEventListener('click', () => runExport('copy'));
    htmlBtn.addEventListener('click', () => runBgExport('html'));
    docxBtn.addEventListener('click', () => runBgExport('docx'));
    pdfBtn.addEventListener('click', () => runBgExport('pdf'));
    zipBtn.addEventListener('click', () => runBgExport('zip'));
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

  // ─── In-page toast notification ───────────────────────────────────────────

  function showToast(text, variant = 'info') {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const colors = {
      success: { bg: '#16a34a', text: '#fff' },
      error:   { bg: '#dc2626', text: '#fff' },
      info:    { bg: '#5b5bd6', text: '#fff' },
    };
    const c = colors[variant] || colors.info;

    shadow.innerHTML = `<style>
      .toast {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 9px 16px;
        border-radius: 10px;
        background: ${c.bg};
        color: ${c.text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0,0,0,0.22);
        opacity: 1;
        transform: translateY(0);
        transition: opacity 0.4s ease, transform 0.4s ease;
        white-space: nowrap;
      }
      .toast.fade { opacity: 0; transform: translateY(8px); }
    </style>
    <div class="toast">${text}</div>`;

    const toastEl = shadow.querySelector('.toast');
    setTimeout(() => {
      toastEl.classList.add('fade');
      setTimeout(() => document.body.removeChild(host), 450);
    }, 2800);
  }

  // ─── Message listener ─────────────────────────────────────────────────────

  // Chrome requires the sendResponse + return true pattern for async handlers.
  // Returning a Promise works in Firefox but is unreliable in Chrome MV3.
  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'showToast') {
      showToast(msg.text, msg.variant);
      sendResponse({ ok: true });
      return;
    }

    if (msg.action === 'copyToClipboard') {
      navigator.clipboard.writeText(msg.text)
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ error: err.message }));
      return true; // async
    }

    // Safari downloads polyfill: background SW sends data URL + filename here
    // when browser.downloads API is unavailable (Safari).
    if (msg.action === 'safariDownload') {
      try {
        const a = Object.assign(document.createElement('a'), {
          href:     msg.url,
          download: msg.filename,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      return;
    }

    if (msg.action !== 'extract') return;

    if (isStreaming()) {
      sendResponse({
        error: 'The AI is still generating. Wait for it to finish, then export.',
        streaming: true,
      });
      return;
    }

    extractMessages().then(messages => {
      if (!messages.length) {
        sendResponse({ error: 'No messages found. Make sure a chat is open and fully loaded.' });
        return;
      }
      const cleanTitle = smartenTitle(getCleanTitle(), messages);
      const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      sendResponse({
        messages,
        title:    cleanTitle,
        site:     location.hostname,
        platform: detectSite(),
        filename: slug,
      });
    }).catch(err => {
      sendResponse({ error: `Extraction failed: ${err.message}` });
    });

    return true; // keep message channel open for async response
  });

})();
