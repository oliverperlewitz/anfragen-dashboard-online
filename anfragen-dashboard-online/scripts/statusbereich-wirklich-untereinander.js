const fs = require('fs');
const path = require('path');

const adminPath = path.join(process.cwd(), 'views', 'admin.ejs');
if (!fs.existsSync(adminPath)) {
  console.error('❌ views/admin.ejs wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

const backupPath = path.join(process.cwd(), 'views', `admin.ejs.backup-before-statusbereich-wirklich-${Date.now()}`);
fs.copyFileSync(adminPath, backupPath);
let html = fs.readFileSync(adminPath, 'utf8');

// Alte force-Einbindungen entfernen, damit sie nicht dagegen arbeiten.
html = html
  .replace(/\s*<link rel="stylesheet" href="\/status-stack-force\.css">/g, '')
  .replace(/\s*<script src="\/status-stack-force\.js" defer><\/script>/g, '');

const markerStart = '<!-- GW_STATUS_STACK_REAL_START -->';
const markerEnd = '<!-- GW_STATUS_STACK_REAL_END -->';
const block = `${markerStart}
<style>
  .gw-actions-stack-real {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 14px !important;
    margin: 18px 0 0 !important;
    padding-top: 16px !important;
    border-top: 1px solid rgba(23,65,41,.14) !important;
    clear: both !important;
  }
  .gw-actions-stack-real > * {
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    display: block !important;
    margin: 0 !important;
    grid-column: 1 / -1 !important;
    flex: none !important;
  }
  .gw-actions-stack-real details,
  .gw-actions-stack-real form,
  .gw-actions-stack-real section,
  .gw-actions-stack-real div {
    max-width: none !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }
  .gw-actions-stack-real summary {
    white-space: normal !important;
    line-height: 1.25 !important;
  }
  .gw-actions-stack-real input,
  .gw-actions-stack-real select,
  .gw-actions-stack-real textarea,
  .gw-actions-stack-real button {
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .gw-actions-stack-real textarea {
    width: 100% !important;
    min-height: 120px !important;
  }
  .gw-delete-block-real {
    width: 100% !important;
    padding: 16px !important;
    border: 1px solid rgba(220,38,38,.25) !important;
    border-radius: 18px !important;
    background: #fff1f1 !important;
  }
  .gw-delete-block-real button,
  .gw-delete-block-real input[type="submit"],
  .gw-delete-block-real .danger,
  .gw-delete-block-real a,
  .gw-actions-stack-real button.danger {
    background: #dc2626 !important;
    color: #fff !important;
    border: 0 !important;
    border-radius: 999px !important;
    padding: 12px 18px !important;
    font-weight: 900 !important;
    box-shadow: 0 12px 22px rgba(220,38,38,.22) !important;
  }
</style>
<script>
(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  function scoreBlock(el) {
    return text(el).length;
  }
  function cardList() {
    return Array.from(document.querySelectorAll('.admin-request-card, article[id^="request-"], [id^="request-"]'));
  }
  function nearestBlock(el, card, type) {
    if (!el || !card || !card.contains(el)) return null;
    if (type === 'delete') {
      const form = el.closest('form');
      if (form && card.contains(form)) return form;
      const danger = el.closest('.danger-zone, .delete-zone, .request-action-card, .admin-action-card, .action-card, details, section, div');
      if (danger && card.contains(danger) && danger !== card) return danger;
      return el;
    }
    const details = el.closest('details');
    if (details && card.contains(details) && details !== card) return details;
    const block = el.closest('.request-action-card, .admin-action-card, .action-card, .collapsible-admin-block, .archive-panel, .status-history-panel, .status-action-box, section, form, div');
    if (block && card.contains(block) && block !== card) return block;
    return el;
  }
  function smallestMatch(card, checker, type) {
    const candidates = Array.from(card.querySelectorAll('details, summary, form, button, input[type="submit"], a, h3, h4, section, .request-action-card, .admin-action-card, .action-card, .collapsible-admin-block, .archive-panel, .status-history-panel, .status-action-box, .danger-zone, .delete-zone, div'));
    const matches = candidates.filter(function (el) {
      if (el.closest('.gw-actions-stack-real')) return false;
      return checker(text(el), el);
    }).sort(function (a, b) { return scoreBlock(a) - scoreBlock(b); });
    for (const m of matches) {
      const b = nearestBlock(m, card, type);
      if (b && b !== card && !b.closest('.gw-actions-stack-real')) return b;
    }
    return null;
  }
  function afterBlock(card) {
    const candidates = Array.from(card.querySelectorAll('details, section, .collapsible-admin-block, .request-details-clean, div'));
    const matches = candidates.filter(function (el) {
      const t = text(el);
      return t.includes('interne notizen') || t.includes('fotos') || t.includes('kundenantworten') || t.includes('details zum auftrag');
    }).sort(function (a,b) { return scoreBlock(b) - scoreBlock(a); });
    return matches[0] || null;
  }
  function appendBlock(stack, block, cls) {
    if (!block) return;
    if (stack.contains(block)) return;
    block.classList.add(cls);
    block.style.width = '100%';
    block.style.maxWidth = 'none';
    block.style.minWidth = '0';
    block.style.display = 'block';
    block.style.boxSizing = 'border-box';
    block.style.margin = '0';
    block.style.gridColumn = '1 / -1';
    stack.appendChild(block);
  }
  function fixCard(card) {
    if (!card) return;
    let stack = card.querySelector(':scope > .gw-actions-stack-real');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'gw-actions-stack-real';
      const anchor = afterBlock(card);
      if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', stack);
      else card.appendChild(stack);
    }
    const statusBlock = smallestMatch(card, function (t) { return t.includes('status') && (t.includes('kundeninfo') || t.includes('kunde') || t.includes('nachricht an kunden')); }, 'status');
    const sentBlock = smallestMatch(card, function (t) { return t.includes('gesendete') && t.includes('status'); }, 'sent');
    const archiveBlock = smallestMatch(card, function (t) { return t.includes('nachweis') && t.includes('archiv'); }, 'archive');
    const deleteBlock = smallestMatch(card, function (t, el) {
      const value = (el.value || '').toLowerCase();
      const action = (el.getAttribute && (el.getAttribute('action') || '') || '').toLowerCase();
      return t === 'löschen' || t.includes('löschen') || value.includes('löschen') || action.includes('delete') || action.includes('loeschen');
    }, 'delete');
    appendBlock(stack, statusBlock, 'gw-status-block-real');
    appendBlock(stack, sentBlock, 'gw-sent-block-real');
    appendBlock(stack, archiveBlock, 'gw-archive-block-real');
    appendBlock(stack, deleteBlock, 'gw-delete-block-real');
    // Reihenfolge hart setzen, falls etwas schon in falscher Reihenfolge im Stack lag.
    ['.gw-status-block-real', '.gw-sent-block-real', '.gw-archive-block-real', '.gw-delete-block-real'].forEach(function (sel) {
      const el = stack.querySelector(sel);
      if (el) stack.appendChild(el);
    });
  }
  function run() { cardList().forEach(fixCard); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  window.addEventListener('load', function () { run(); setTimeout(run, 300); setTimeout(run, 1000); });
  document.addEventListener('click', function () { setTimeout(run, 100); setTimeout(run, 500); });
  window.addEventListener('hashchange', function () { setTimeout(run, 150); });
})();
</script>
${markerEnd}`;

// Alten Block entfernen, neuen direkt vor </body> einsetzen.
const re = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'g');
html = html.replace(re, '');
if (html.includes('</body>')) {
  html = html.replace('</body>', `${block}\n</body>`);
} else {
  html += `\n${block}\n`;
}

fs.writeFileSync(adminPath, html);
console.log('✅ Statusbereich wurde direkt in views/admin.ejs repariert.');
console.log('✅ Reihenfolge: Status ändern → Gesendete Infos → Nachweis & Archiv → Löschen');
console.log('✅ Backup erstellt:', backupPath);
