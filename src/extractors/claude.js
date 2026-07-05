/** extractors/claude.js — claude.ai */
import { htmlToMarkdown } from '../exporters/markdown.js';

function sortByDOMOrder(a, b) {
  const pos = a.el.compareDocumentPosition(b.el);
  return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
}

export function extractClaude() {
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
