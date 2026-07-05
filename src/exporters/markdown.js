/**
 * exporters/markdown.js
 * HTML → Markdown conversion + Markdown document builder.
 * No browser.* API calls.
 *
 * NOTE: The runtime version of htmlToMarkdown lives in src/content.js
 * (self-contained IIFE, no bundler). This module mirrors that logic for
 * use by any future build step or test harness.
 */

export function htmlToMarkdown(element) {
  if (!element) return '';
  return convertNode(element).replace(/\n{3,}/g, '\n\n').trim();
}

function convertNode(node) {
  if (node.nodeType === Node.TEXT_NODE)    return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  if (['script', 'style', 'svg', 'button', 'nav', 'header', 'footer'].includes(tag)) return '';

  const children = () => Array.from(node.childNodes).map(convertNode).join('');

  switch (tag) {
    case 'h1': return `\n\n# ${children().trim()}\n\n`;
    case 'h2': return `\n\n## ${children().trim()}\n\n`;
    case 'h3': return `\n\n### ${children().trim()}\n\n`;
    case 'h4': return `\n\n#### ${children().trim()}\n\n`;
    case 'h5': return `\n\n##### ${children().trim()}\n\n`;
    case 'h6': return `\n\n###### ${children().trim()}\n\n`;
    case 'p':  return `\n\n${children()}\n\n`;
    case 'br': return '\n';
    case 'hr': return '\n\n---\n\n';
    case 'strong': case 'b': { const i = children().trim(); return i ? `**${i}**` : ''; }
    case 'em':     case 'i': { const i = children().trim(); return i ? `*${i}*`   : ''; }
    case 'del':    case 's': { const i = children().trim(); return i ? `~~${i}~~` : ''; }
    case 'code':
      if (node.closest('pre')) return node.textContent;
      return `\`${node.textContent}\``;
    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang   = (codeEl?.className || '').match(/language-(\w+)/)?.[1] ?? '';
      const code   = (codeEl ?? node).textContent;
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
      const text = children();
      if (!href || href.startsWith('#')) return text;
      return `[${text}](${href})`;
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
      const nested     = li.querySelector('ul, ol');
      const bullet     = ordered ? `${i + 1}.` : '*';
      const inlineNodes = Array.from(li.childNodes).filter(
        n => !(n.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes(n.tagName.toLowerCase()))
      );
      const inlineText = inlineNodes.map(convertNode).join('').trim();
      let result = `${indent}${bullet} ${inlineText}`;
      if (nested) result += '\n' + convertList(nested, nested.tagName.toLowerCase() === 'ol', depth + 1);
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

export function buildMarkdown(messages, title, site) {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let md = `# ${title}\n\n`;
  md += `> Exported from **${site}** on ${date}\n\n---\n\n`;
  for (const { role, content } of messages) {
    md += `## ${role}\n\n${content.trim()}\n\n---\n\n`;
  }
  return md;
}
