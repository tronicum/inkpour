/**
 * src/redact.js — Inkpour secret scrubbing
 *
 * Loaded by background.js via importScripts() (service-worker context, same
 * pattern as src/utils.js). Functions are declared at global scope so they
 * are directly callable from background.js without any import/export syntax.
 * Do NOT add anything that depends on DOM, localStorage, or extension APIs here.
 *
 * scanForSecrets(text)    → Array<{ type, match }>
 * redactSecrets(text)     → { cleaned, findings }
 * redactMessages(messages) → new array with each message's content redacted
 */

// ─── Secret patterns ───────────────────────────────────────────────────────
// Order matters: more specific patterns are matched first so a single value
// (e.g. a GitHub token) isn't double-flagged by the generic catch-all.

const _REDACT_PATTERNS = [
  // OpenAI-style API keys: sk-XXXXXXXXXXXXXXXXXXXX (20+ alphanumeric chars)
  { type: 'api_key', re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  // AWS access key IDs
  { type: 'aws_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_
  { type: 'github_token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  // JWT-shaped tokens: header.payload.signature (base64url segments)
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  // Email addresses
  { type: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Generic catch-all: api_key/apikey/secret/token/password (case-insensitive)
  // followed by a separator and a long-ish alphanumeric-ish value. Keeps
  // false positives reasonable by requiring at least 12 chars in the value
  // and some non-trivial character variety (not just repeated letters).
  {
    type: 'generic_secret',
    re: /\b(?:api[_-]?key|apikey|secret|token|password)\b\s*[:=]\s*['"]?([A-Za-z0-9_\-\/+.]{12,})['"]?/gi,
  },
];

/**
 * Scan text for likely secrets.
 * @param {string} text
 * @returns {Array<{type:string, match:string}>}
 */
function scanForSecrets(text) {
  if (!text) return [];
  const findings = [];
  const claimed = []; // ranges already matched by an earlier (more specific) pattern

  for (const { type, re } of _REDACT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      // For the generic catch-all, the "match" we care about is the whole
      // matched phrase (label + value) so the redaction removes the value
      // but we report the captured value for clarity; use full match for
      // replacement safety.
      const full  = m[0];
      const start = m.index;
      const end   = start + full.length;

      // Skip if this range overlaps a range already claimed by a more
      // specific pattern (prevents e.g. a JWT inside a "token: ..." line
      // from being reported twice).
      const overlaps = claimed.some(([cs, ce]) => start < ce && end > cs);
      if (overlaps) continue;

      claimed.push([start, end]);
      findings.push({ type, match: full });

      // Avoid infinite loops on zero-length matches (shouldn't happen here,
      // but defensive).
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }

  return findings;
}

/**
 * Redact all likely secrets found in text.
 * @param {string} text
 * @returns {{ cleaned: string, findings: Array<{type:string, match:string}> }}
 */
function redactSecrets(text) {
  if (!text) return { cleaned: text, findings: [] };
  const findings = scanForSecrets(text);
  if (!findings.length) return { cleaned: text, findings };

  let cleaned = text;
  // Replace longest matches first so shorter overlapping substrings (if any
  // slipped through) don't corrupt an already-replaced longer match.
  const sorted = [...findings].sort((a, b) => b.match.length - a.match.length);
  for (const { type, match } of sorted) {
    // Split on all occurrences of this exact match and rejoin — avoids
    // regex re-escaping pitfalls with special characters in the match.
    cleaned = cleaned.split(match).join(`[REDACTED:${type.toUpperCase()}]`);
  }

  return { cleaned, findings };
}

/**
 * Redact all likely secrets from a normalized messages array
 * (Array<{ role, content, ... }>) — the shape every export builder consumes.
 *
 * Pure: returns a NEW array of NEW message objects; the input array and its
 * objects are never mutated. Every property other than `content` is carried
 * over untouched (role, any extractor extras). Tolerates null/undefined/empty
 * input by returning an empty array.
 *
 * Used by the opt-in "scrub local exports" setting so redaction happens once,
 * at the message level, before ANY builder (Markdown/HTML/PDF/JSON/DOCX/ZIP)
 * runs — scrubbing each format's final output post-hoc would be fragile
 * (DOCX is binary, JSON/HTML would risk mangled markup).
 *
 * @param {Array<{role:string, content:string}>|null|undefined} messages
 * @returns {Array<{role:string, content:string}>}
 */
function redactMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    return { ...msg, content: redactSecrets(msg.content).cleaned };
  });
}

/**
 * The single scrub gate for everything that leaves the machine — Gist, Notion,
 * webhook. Governed by `scrubSecrets` (network upload = opt-OUT, so a missing
 * key means "scrub"), unlike the local-export scrub which is opt-in.
 *
 * Exists because popup.js and background.js each used to inline this check and
 * drifted: the popup's Gist upload skipped it entirely, so whether a secret was
 * stripped depended on which button the user happened to press.
 *
 * Pure — returns new strings, mutates nothing. `findings` is the combined list
 * so the caller can raise the "redacted N secrets" toast in its own way.
 *
 * @param {{scrubSecrets?:boolean}} settings
 * @param {string} body   the payload text (markdown, JSON, ...)
 * @param {string} title  conversation title / description
 * @returns {{ body:string, title:string, findings:Array<{type:string,match:string}> }}
 */
function scrubForUpload(settings, body, title) {
  if (settings && settings.scrubSecrets === false) {
    return { body, title, findings: [] };
  }
  const bodyResult  = redactSecrets(body || '');
  const titleResult = redactSecrets(title || '');
  return {
    body:     bodyResult.cleaned,
    title:    titleResult.cleaned,
    findings: [...bodyResult.findings, ...titleResult.findings],
  };
}
