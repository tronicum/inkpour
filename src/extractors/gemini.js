/** extractors/gemini.js — gemini.google.com */
import { htmlToMarkdown } from '../exporters/markdown.js';

function sortByDOMOrder(a, b) {
  const pos = a.el.compareDocumentPosition(b.el);
  return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
}

export function extractGemini() {
  // Gemini uses custom elements <user-query> and <model-response>
  const userEls  = Array.from(document.querySelectorAll('user-query')).map(el => ({ el, role: 'You' }));
  const modelEls = Array.from(document.querySelectorAll('model-response')).map(el => ({ el, role: 'Gemini' }));
  if (!userEls.length && !modelEls.length) return null;
  return [...userEls, ...modelEls]
    .sort(sortByDOMOrder)
    .map(({ el, role }) => ({ role, content: htmlToMarkdown(el) }))
    .filter(m => m.content);
}
