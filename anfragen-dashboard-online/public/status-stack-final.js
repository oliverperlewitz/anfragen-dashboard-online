(function () {
  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function containsText(el, needles) {
    const t = textOf(el);
    return needles.some((n) => t.includes(n));
  }

  function closestCard(el) {
    return el && el.closest('article, .admin-request-card, .compact-request-card, .request-card, .request-expanded-content, .admin-card, .customer-card');
  }

  function findActionElements(card) {
    const all = Array.from(card.querySelectorAll('details, section, article, form, div, button'));

    const status = all.find((el) =>
      containsText(el, ['status ändern', 'kundeninfo schreiben']) &&
      !containsText(el, ['gesendete status'])
    );

    const sent = all.find((el) => containsText(el, ['gesendete status-infos', 'gesendete status infos']));
    const archive = all.find((el) => containsText(el, ['nachweis & archiv', 'auftragsakte herunterladen']));

    let del = all.find((el) => {
      const t = textOf(el);
      return (el.tagName === 'FORM' || el.tagName === 'BUTTON' || el.querySelector('button')) &&
        (t === 'löschen' || t.includes('löschen'));
    });

    if (del && del.tagName === 'BUTTON') del = del.closest('form') || del;

    return { status, sent, archive, del };
  }

  function commonContainer(card, elements) {
    const present = elements.filter(Boolean);
    if (!present.length) return null;
    let node = present[0].parentElement;
    while (node && node !== card.parentElement && node !== document.body) {
      if (present.every((el) => node.contains(el))) return node;
      node = node.parentElement;
    }
    return card;
  }

  function moveActions(card) {
    if (!card || card.dataset.gwStackDone === '1') return;

    const { status, sent, archive, del } = findActionElements(card);
    if (!status || !sent || !archive) return;

    const elements = [status, sent, archive, del].filter(Boolean);
    const container = commonContainer(card, elements);
    if (!container) return;

    const stack = document.createElement('div');
    stack.className = 'gw-final-action-stack';
    stack.dataset.gwFinalStack = '1';

    // Wichtig: Reihenfolge exakt wie gewünscht.
    stack.appendChild(status);
    stack.appendChild(sent);
    stack.appendChild(archive);

    if (del) {
      const deleteWrap = document.createElement('div');
      deleteWrap.className = 'gw-final-delete-area';
      deleteWrap.appendChild(del);
      stack.appendChild(deleteWrap);
    }

    container.appendChild(stack);
    card.dataset.gwStackDone = '1';
  }

  function run() {
    const candidates = Array.from(document.querySelectorAll('.admin-request-card, .compact-request-card, article, .request-expanded-content'));
    candidates.forEach((card) => {
      const t = textOf(card);
      if (t.includes('status ändern') && t.includes('gesendete status') && t.includes('nachweis')) {
        moveActions(card);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.addEventListener('load', run);
  setTimeout(run, 300);
  setTimeout(run, 1000);

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
