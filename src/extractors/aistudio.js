/**
 * extractors/aistudio.js — Google AI Studio
 *
 * Uses Trifall's edit-mode technique:
 *   1. Find each ms-chat-turn
 *   2. For user turns: click .toggle-edit-button → wait for ms-autosize-textarea[data-value]
 *      → read data-value (the raw prompt text) → exit edit mode
 *   3. For model turns: use HTML→Markdown on the rendered DOM
 *
 * This file is the canonical reference for the technique.
 * The actual runtime implementation lives in src/content.js (self-contained IIFE).
 *
 * Credit: Trifall/chat-export (MIT) — edit-mode extraction idea
 */

import { htmlToMarkdown } from '../exporters/markdown.js';

export async function extractAIStudio() {
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
