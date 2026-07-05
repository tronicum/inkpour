/** extractors/copilot.js — copilot.microsoft.com */
import { htmlToMarkdown } from '../exporters/markdown.js';

function sortByDOMOrder(a, b) {
  const pos = a.el.compareDocumentPosition(b.el);
  return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
}

export function extractCopilot() {
  // Copilot uses <cib-chat-turn source="user|bot"> web components
  const turnEls = document.querySelectorAll('cib-chat-turn');
  if (turnEls.length) {
    return Array.from(turnEls).map(turn => {
      const source = turn.getAttribute('source') ?? '';
      const role   = source === 'user' ? 'You' : 'Copilot';
      return { role, content: htmlToMarkdown(turn) };
    }).filter(m => m.content);
  }

  // Fallback
  const userEls = Array.from(document.querySelectorAll('[data-testid="user-message"], .user-message'))
    .map(el => ({ el, role: 'You' }));
  const botEls  = Array.from(document.querySelectorAll('[data-testid="bot-message"], .bot-message'))
    .map(el => ({ el, role: 'Copilot' }));
  const combined = [...userEls, ...botEls].sort(sortByDOMOrder);
  return combined.length
    ? combined.map(({ el, role }) => ({ role, content: htmlToMarkdown(el) })).filter(m => m.content)
    : null;
}
