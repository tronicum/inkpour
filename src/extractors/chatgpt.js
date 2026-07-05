/** extractors/chatgpt.js — chat.openai.com / chatgpt.com */
import { htmlToMarkdown } from '../exporters/markdown.js';

export function extractChatGPT() {
  const turns = document.querySelectorAll('[data-message-author-role]');
  if (!turns.length) return null;
  return Array.from(turns).map(turn => {
    const role      = turn.getAttribute('data-message-author-role');
    const label     = role === 'user' ? 'You' : 'ChatGPT';
    const contentEl = turn.querySelector('.markdown, [class*="prose"], .text-message') ?? turn;
    return { role: label, content: htmlToMarkdown(contentEl) };
  }).filter(m => m.content);
}
