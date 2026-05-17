(function () {
  function textOf(el) {
    return (el && el.textContent ? el.textContent : '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function closestUsefulBlock(el, card) {
    if (!el) return null;
    const selectors = [
      'details',
      'section',
      'form',
      '.collapsible-admin-block',
      '.admin-panel',
      '.archive-panel',
      '.status-history-panel',
      '.status-action-box',
      '.request-action-card',
      '.admin-action-card',
      '.danger-zone',
      '.delete-zone'
    ];
    for (const selector of selectors) {
      const match = el.closest(selector);
      if (match && card.contains(match) && match !== card) return match;
    }
    return el;
  }

  function findBlock(card, matchers) {
    const candidates = Array.from(card.querySelectorAll('details, section, form, .collapsible-admin-block, .admin-panel, .archive-panel, .status-history-panel, .status-action-box, .request-action-card, .admin-action-card, .danger-zone, .delete-zone, button, a'));
    for (const candidate of candidates) {
      const t = textOf(candidate);
      if (matchers.every((m) => t.includes(m))) {
        return closestUsefulBlock(candidate, card);
      }
    }
    return null;
  }

  function findDeleteBlock(card) {
    const deleteCandidates = Array.from(card.querySelectorAll('form, button, input[type="submit"], a, .danger-zone, .delete-zone'));
    for (const candidate of deleteCandidates) {
      const t = textOf(candidate);
      const val = (candidate.value || '').toLowerCase();
      const href = (candidate.getAttribute && candidate.getAttribute('href') || '').toLowerCase();
      const action = (candidate.getAttribute && candidate.getAttribute('action') || '').toLowerCase();
      if (t === 'löschen' || t.includes('löschen') || val.includes('löschen') || href.includes('delete') || action.includes('delete') || action.includes('loeschen')) {
        return closestUsefulBlock(candidate, card);
      }
    }
    return null;
  }

  function placeStack(card) {
    if (!card || card.dataset.statusStackFixed === '1') return;

    const statusBlock = findBlock(card, ['status', 'kundeninfo']);
    const sentBlock = findBlock(card, ['gesendete', 'status']);
    const archiveBlock = findBlock(card, ['nachweis', 'archiv']);
    const deleteBlock = findDeleteBlock(card);

    if (!statusBlock && !sentBlock && !archiveBlock && !deleteBlock) return;

    const stack = document.createElement('div');
    stack.className = 'status-stack-fixed';

    const blocks = [
      [statusBlock, 'stack-status-block'],
      [sentBlock, 'stack-sent-block'],
      [archiveBlock, 'stack-archive-block'],
      [deleteBlock, 'stack-delete-block']
    ];

    blocks.forEach(([block, cls]) => {
      if (!block || block.dataset.movedToStatusStack === '1') return;
      block.dataset.movedToStatusStack = '1';
      block.classList.add(cls);
      stack.appendChild(block);
    });

    if (!stack.children.length) return;

    const preferredAnchor = Array.from(card.querySelectorAll('details, section, .collapsible-admin-block')).find((el) => {
      const t = textOf(el);
      return t.includes('interne notizen') || t.includes('fotos') || t.includes('kundenantworten');
    });

    if (preferredAnchor && preferredAnchor.parentNode) {
      preferredAnchor.insertAdjacentElement('afterend', stack);
    } else {
      card.appendChild(stack);
    }

    card.dataset.statusStackFixed = '1';
  }

  function run() {
    const cards = document.querySelectorAll('.admin-request-card, [id^="request-"]');
    cards.forEach(placeStack);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Falls Aufträge später durch Tabs/Filter sichtbar werden
  document.addEventListener('click', () => setTimeout(run, 80));
  window.addEventListener('hashchange', () => setTimeout(run, 120));
})();
