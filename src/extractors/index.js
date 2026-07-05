/**
 * extractors/index.js
 * Site detection and extractor dispatcher.
 * No browser.* API calls — pure DOM access only.
 */

import { extractChatGPT } from './chatgpt.js';
import { extractClaude }  from './claude.js';
import { extractGemini }  from './gemini.js';
import { extractAIStudio } from './aistudio.js';
import { extractCopilot } from './copilot.js';

export function detectSite() {
  const host = location.hostname;
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
  if (host.includes('claude.ai'))                return 'claude';
  if (host.includes('gemini.google.com'))        return 'gemini';
  if (host.includes('aistudio.google.com'))      return 'aistudio';
  if (host.includes('copilot.microsoft.com'))    return 'copilot';
  return 'unknown';
}

export async function extractMessages() {
  const site = detectSite();
  switch (site) {
    case 'chatgpt':  return extractChatGPT();
    case 'claude':   return extractClaude();
    case 'gemini':   return extractGemini();
    case 'aistudio': return extractAIStudio();
    case 'copilot':  return extractCopilot();
    default: throw new Error(`Unsupported site: ${location.hostname}`);
  }
}
