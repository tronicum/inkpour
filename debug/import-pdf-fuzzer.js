// Inkpour — PDF import fuzzer logic (external file, not inline).
//
// This used to be an inline <script> block in import-pdf-fuzzer.html. Manifest
// V3 extension pages enforce a fixed `script-src 'self'` CSP that (a) blocks
// any remote script — the old cdnjs pdf.js <script src> included, with no way
// to opt back in via the manifest — and (b) blocks inline <script> blocks
// entirely, always, on every extension page. Opening this tool directly via
// file:// never hit either restriction, which is why it worked in some
// contexts and did *nothing at all* — no status text, no error, nothing —
// when opened through the extension's own Settings ▸ Advanced dev-tools link
// (chrome-extension://…). Moving the logic here (same-origin, external) and
// vendoring pdf.js locally (see vendor/) fixes both failure modes at once.

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}

const pdfInput   = document.getElementById('pdfInput');
const rerunBtn    = document.getElementById('rerunBtn');
const pdfStatus   = document.getElementById('pdfStatus');
const rawText     = document.getElementById('rawText');
const output      = document.getElementById('output');
const stats       = document.getElementById('stats');
const fuzzReport  = document.getElementById('fuzzReport');
const fuzzRows    = document.getElementById('fuzzRows');
const copyRawTextBtn = document.getElementById('copyRawTextBtn');
const copyStatus     = document.getElementById('copyStatus');

// Gap thresholds to try, expressed as a multiple of the line's own text
// height. Small factor = more paragraph breaks (sensitive), large factor
// = fewer (only very obvious gaps count). Deliberately overkill for what
// is, per the PDF we tested against, "pretty clean raw stuff" — but a
// real mobile-browser PDF export might have inconsistent spacing, so
// trying a spread and scoring the result beats hand-picking one value.
const FUZZ_FACTORS = [1.15, 1.4, 1.7, 2.2, 3];

let lastLines = null; // cached line data so "Re-fuzz" doesn't need to re-parse the PDF

/** Pull every text run out of every page, grouped into visual lines. */
async function extractLinesFromPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = []; // { text, gap, height, page, fontKey }

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({
        str:      it.str,
        x:        it.transform[4],
        y:        it.transform[5],
        height:   it.height || Math.abs(it.transform[3]) || 10,
        fontName: it.fontName || '',
      }));

    // PDF coordinates grow upward, so "top of page first" is descending y.
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    const pageLines = [];
    let current = null;
    for (const it of items) {
      if (!current || Math.abs(it.y - current.y) > current.height * 0.4) {
        current = { y: it.y, height: it.height, parts: [], fontVotes: new Map() };
        pageLines.push(current);
      }
      current.parts.push(it.str);
      // A line can mix fonts (e.g. bold word inline) — track the most
      // common one so mixed lines still get one representative fontKey.
      const key = it.fontName + '@' + it.height.toFixed(1);
      current.fontVotes.set(key, (current.fontVotes.get(key) || 0) + it.str.length);
    }

    pageLines.forEach((line, i) => {
      const text = line.parts.join(' ').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const prev = pageLines[i - 1];
      let fontKey = '', bestVotes = -1;
      line.fontVotes.forEach((votes, key) => { if (votes > bestVotes) { bestVotes = votes; fontKey = key; } });
      lines.push({
        text,
        gap:    prev ? (prev.y - line.y) : 0,
        height: line.height,
        page:   p,
        fontKey,
      });
    });
  }
  return lines;
}

// ─── Font-aware candidate ───────────────────────────────────────────────
// Google's AI Search/Mode PDF export renders your own typed query in a
// distinct embedded font from the answer body text (confirmed against the
// sample this tool was built against — a real font ID stayed consistent
// for every query across all 3 pages). Font IDs are assigned per-PDF
// though, so nothing here is hardcoded: we fingerprint which font ID
// shows up immediately after each "AI responses may contain mistakes"
// disclaimer (using the exact same regex the real import feature uses to
// recognize that boilerplate), and treat whichever font wins that vote as
// "this is your query font" for this specific document.

// Google AI Mode/Search-specific UI chrome the shared Gemini-paste cleaner
// in src/utils.js doesn't know about (it was tuned for the gemini.google.com
// app, not Search) — kept local to this joke tool rather than the shared
// production parser. Best-effort / sample-specific; extend as needed.
// The shared GEMINI_DISCLAIMER_RE expects "AI responses may contain
// mistakes" and its "Weitere Informationen"/"For more information" tail
// as ONE line — but PDF text wrapping often lands them on two separate
// physical lines, so the tail alone needs its own noise pattern too, both
// to strip it from the output and to anchor the font-vote detection
// below (in the sample this was built against, the tail-only line is
// consistently what immediately precedes each next query).
const WEITERE_INFO_TAIL_RE = /^(weitere informationen|for more information)\.?$/i;

const SEARCH_CHROME_NOISE_RE = [
  /^(ki-modus|ai mode)\b.*\b(bilder|images|videos)\b/i, // top tab bar
  /^war dieser (technische )?rat hilfreich\?$/i,        // "was this helpful?" prompt
  /^(sehr hilfreich|zu technisch|zu oberflächlich|too technical|too superficial|very helpful)$/i,
  /^frage stellen$/i,                                    // "ask a question" CTA
  /^\d+\s+(websites|quellen|sources)\s*$/i,               // also matches mid-line, redundant with GEMINI_SOURCES_HEADER_RE but line may not be trimmed the same way
  WEITERE_INFO_TAIL_RE,
];

function isDisclaimerAnchor(text) {
  const t = text.trim();
  return GEMINI_DISCLAIMER_RE.test(t) || WEITERE_INFO_TAIL_RE.test(t);
}

function isNoiseLine(text) {
  const t = text.trim();
  if (GEMINI_DISCLAIMER_RE.test(t) || GEMINI_CODE_CAUTION_RE.test(t) ||
      GEMINI_SOURCES_HEADER_RE.test(t) || GEMINI_TIMESTAMP_RE.test(t)) return true;
  return SEARCH_CHROME_NOISE_RE.some(re => re.test(t));
}

/** Returns a font-aware candidate, or null if no disclaimer marker was found to fingerprint against. */
function buildFontAwareCandidate(lines) {
  const postDisclaimerFontVotes = new Map();
  lines.forEach((line, i) => {
    if (!isDisclaimerAnchor(line.text)) return;
    const next = lines.slice(i + 1).find(l => !isNoiseLine(l.text));
    if (next) postDisclaimerFontVotes.set(next.fontKey, (postDisclaimerFontVotes.get(next.fontKey) || 0) + 1);
  });
  if (!postDisclaimerFontVotes.size) return null; // no disclaimer found — nothing to fingerprint

  let queryFont = '', bestVotes = -1;
  postDisclaimerFontVotes.forEach((votes, key) => { if (votes > bestVotes) { bestVotes = votes; queryFont = key; } });

  const messages = [];
  let current = null;
  lines.forEach((line) => {
    if (isNoiseLine(line.text)) return;
    const role = line.fontKey === queryFont ? 'You' : 'Gemini';
    if (current && current.role === role) {
      current.content += '\n' + line.text;
    } else {
      if (current) messages.push(current);
      current = { role, content: line.text };
    }
  });
  if (current) messages.push(current);

  const text = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
  return { label: 'font-aware', text, messages, queryFont };
}

/** Rebuild plain text, inserting a blank line wherever the gap looks like a paragraph break. */
function reconstructText(lines, factor) {
  let out = '';
  lines.forEach((l, i) => {
    if (i === 0) { out += l.text; return; }
    const isParagraphBreak = l.gap > l.height * factor;
    out += (isParagraphBreak ? '\n\n' : '\n') + l.text;
  });
  return out;
}

/**
 * Higher = looks more like an actual back-and-forth conversation.
 * Rewards message count and role alternation, but penalizes turns whose
 * entire content is a recognized noise phrase — a generic reconstruction
 * can produce a perfectly alternating You/Gemini sequence that LOOKS
 * great by count+alternation alone while every "You" turn is actually
 * just a stray leftover disclaimer fragment ("Weitere Informationen")
 * that leaked through as a fake turn instead of being recognized and
 * dropped. Checking against the same isNoiseLine() used to clean the
 * font-aware candidate is far more precise than a raw length cutoff —
 * length alone can't tell a genuine short query ("vpns regeln", 11
 * characters, a real turn in the sample this was tested against) apart
 * from junk ("Weitere Informationen", 21 characters, not a real turn).
 */
function scoreMessages(messages, rawLength) {
  if (!messages.length) return -1;
  if (messages.length === 1) {
    // One giant blob is only mildly better than nothing.
    return messages[0].content.length >= rawLength * 0.9 ? 0 : 1;
  }
  let alternationBonus = 0;
  let junkPenalty = 0;
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content.trim();
    if (isNoiseLine(content)) junkPenalty += 5;
    else if (content.length < 10) junkPenalty += 1; // weak fallback signal for unrecognized short fragments
    if (i === 0) continue;
    const prevUser = /^(you|user)$/i.test(messages[i - 1].role);
    const curUser  = /^(you|user)$/i.test(messages[i].role);
    if (prevUser !== curUser) alternationBonus++;
  }
  return messages.length + alternationBonus * 2 - junkPenalty;
}

function runFuzzer(lines) {
  const rawLength = lines.map(l => l.text).join('\n').length;
  const results = FUZZ_FACTORS.map((factor) => {
    const text     = reconstructText(lines, factor);
    const messages = parseImportedText(text);
    return { name: `${factor}×`, text, messages, score: scoreMessages(messages, rawLength) };
  });

  const fontAware = buildFontAwareCandidate(lines);
  if (fontAware) {
    results.push({
      name:    `font-aware (${fontAware.queryFont})`,
      text:    fontAware.text,
      messages: fontAware.messages,
      score:   scoreMessages(fontAware.messages, rawLength),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

function renderMessages(messages) {
  output.textContent = '';
  if (!messages.length) {
    output.innerHTML = '<div class="empty">No messages parsed from this candidate.</div>';
    stats.textContent = '';
    return;
  }
  messages.forEach((m) => {
    const isUser = m.role.toLowerCase() === 'you' || m.role.toLowerCase() === 'user';
    const div = document.createElement('div');
    div.className = 'msg ' + (isUser ? 'user' : 'ai');
    const roleEl = document.createElement('div');
    roleEl.className = 'role';
    roleEl.textContent = m.role;
    const contentEl = document.createElement('pre');
    contentEl.textContent = m.content;
    div.appendChild(roleEl);
    div.appendChild(contentEl);
    output.appendChild(div);
  });
  const words = messages.reduce((sum, m) => sum + m.content.trim().split(/\s+/).filter(Boolean).length, 0);
  stats.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'} · ~${words.toLocaleString()} words`;
}

function renderFuzzReport(results) {
  fuzzRows.textContent = '';
  results.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'winner';
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.messages.length}</td>
      <td>${r.score}</td>
      <td>${i === 0 ? '<span class="trophy">🏆 best guess</span>' : ''}</td>
    `;
    tr.addEventListener('click', () => {
      rawText.value = r.text;
      renderMessages(r.messages);
      copyRawTextBtn.disabled = !r.text;
    });
    fuzzRows.appendChild(tr);
  });
  fuzzReport.hidden = false;
}

function runAndRender(lines) {
  const results = runFuzzer(lines);
  renderFuzzReport(results);
  rawText.value = results[0].text;
  renderMessages(results[0].messages);
  copyRawTextBtn.disabled = !results[0].text;
}

pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;
  if (typeof pdfjsLib === 'undefined') {
    pdfStatus.textContent = 'pdf.js failed to load (vendor/pdf.min.js missing?) — check the console.';
    return;
  }
  pdfStatus.textContent = `Reading ${file.name}…`;
  rerunBtn.disabled = true;
  try {
    const buffer = await file.arrayBuffer();
    lastLines = await extractLinesFromPdf(buffer);
    pdfStatus.textContent = `${file.name} — ${lastLines.length} text lines extracted`;
    rerunBtn.disabled = false;
    runAndRender(lastLines);
  } catch (err) {
    pdfStatus.textContent = 'Error: ' + err.message;
  }
});

rerunBtn.addEventListener('click', () => {
  if (lastLines) runAndRender(lastLines);
});

copyRawTextBtn.addEventListener('click', async () => {
  if (!rawText.value) return;
  try {
    await navigator.clipboard.writeText(rawText.value);
    copyStatus.textContent = 'Copied — paste into the extension\'s Import from clipboard box.';
  } catch (err) {
    // navigator.clipboard can be denied/unavailable in some contexts (e.g. an
    // insecure file:// origin in some browsers) — fall back to the classic
    // select+execCommand trick so the button still works either way.
    rawText.removeAttribute('readonly');
    rawText.select();
    try {
      document.execCommand('copy');
      copyStatus.textContent = 'Copied — paste into the extension\'s Import from clipboard box.';
    } catch {
      copyStatus.textContent = 'Copy failed — select the text above and copy manually.';
    } finally {
      rawText.setAttribute('readonly', '');
    }
  }
  setTimeout(() => { copyStatus.textContent = ''; }, 4000);
});
