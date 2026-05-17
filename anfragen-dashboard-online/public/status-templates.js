(function () {
  const STATUS_TEMPLATES = {
    neu: ['Danke für deine Anfrage. Wir haben deine Angaben erhalten und prüfen sie jetzt. Wir melden uns zeitnah mit den nächsten Schritten.'],
    'in bearbeitung': ['Wir bearbeiten deine Anfrage jetzt und melden uns zeitnah mit den nächsten Schritten bei dir.'],
    'in arbeit': ['Dein Auftrag ist jetzt in Arbeit. Wir kümmern uns um die Umsetzung und halten dich bei wichtigen Änderungen auf dem Laufenden.'],
    rueckfrage: ['Damit wir deine Anfrage richtig einschätzen können, benötigen wir noch ein paar zusätzliche Informationen von dir.'],
    rückfrage: ['Damit wir deine Anfrage richtig einschätzen können, benötigen wir noch ein paar zusätzliche Informationen von dir.'],
    'wartet auf kunde': ['Wir warten aktuell noch auf deine Rückmeldung, bevor wir mit den nächsten Schritten weitermachen können.'],
    'besichtigung geplant': ['Wir haben einen Besichtigungstermin für deine Anfrage eingeplant. Danach können wir den Aufwand genauer einschätzen.'],
    'termin bestätigt': ['Dein Termin wurde bestätigt. Wir freuen uns auf den Auftrag und melden uns, falls vorher noch etwas benötigt wird.'],
    'angebot erstellt': ['Wir haben dein Angebot vorbereitet und melden uns mit den Details. Bei Fragen kannst du uns jederzeit antworten.'],
    erledigt: ['Dein Auftrag wurde erfolgreich abgeschlossen. Vielen Dank für dein Vertrauen in GrünWerk Gartenbau.'],
    storniert: ['Deine Anfrage wurde storniert. Falls du später wieder Unterstützung brauchst, kannst du dich jederzeit erneut bei uns melden.'],
    abgelehnt: ['Danke für deine Anfrage. Leider können wir diesen Auftrag aktuell nicht passend umsetzen.']
  };

  function normalizeStatus(value) {
    return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/ae/g, 'ä').replace(/ue/g, 'ü').replace(/oe/g, 'ö').replace(/\s+/g, ' ').trim();
  }

  function findTemplate(statusValue) {
    const key = normalizeStatus(statusValue);
    if (STATUS_TEMPLATES[key]) return STATUS_TEMPLATES[key];
    if (key.includes('bearbeitung')) return STATUS_TEMPLATES['in bearbeitung'];
    if (key.includes('arbeit')) return STATUS_TEMPLATES['in arbeit'];
    if (key.includes('rück') || key.includes('frage')) return STATUS_TEMPLATES.rückfrage;
    if (key.includes('wartet')) return STATUS_TEMPLATES['wartet auf kunde'];
    if (key.includes('besichtigung')) return STATUS_TEMPLATES['besichtigung geplant'];
    if (key.includes('termin')) return STATUS_TEMPLATES['termin bestätigt'];
    if (key.includes('angebot')) return STATUS_TEMPLATES['angebot erstellt'];
    if (key.includes('erledigt')) return STATUS_TEMPLATES.erledigt;
    if (key.includes('storno')) return STATUS_TEMPLATES.storniert;
    if (key.includes('ablehn')) return STATUS_TEMPLATES.abgelehnt;
    return STATUS_TEMPLATES.neu;
  }

  function labelFromStatus(value) {
    const text = String(value || '').replace(/[_-]+/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Status';
  }

  function enhanceStatusForms() {
    document.querySelectorAll('select[name="status"]').forEach((statusSelect) => {
      const form = statusSelect.closest('form');
      if (!form || form.dataset.statusTemplatesReady === '1') return;
      const textarea = form.querySelector('textarea');
      if (!textarea) return;

      form.dataset.statusTemplatesReady = '1';
      const templateBox = document.createElement('label');
      templateBox.className = 'status-template-field';
      templateBox.innerHTML = '<span>Vorlage</span><select class="status-template-select"><option value="">Vorlage wählen</option></select>';
      const templateSelect = templateBox.querySelector('select');

      const statusLabel = statusSelect.closest('label') || statusSelect.parentElement;
      if (statusLabel && statusLabel.parentElement) statusLabel.insertAdjacentElement('afterend', templateBox);
      else statusSelect.insertAdjacentElement('afterend', templateBox);

      function rebuildTemplates(fillWhenEmpty) {
        const templates = findTemplate(statusSelect.value);
        templateSelect.innerHTML = '<option value="">Vorlage wählen</option>';
        templates.forEach((template, index) => {
          const option = document.createElement('option');
          option.value = template;
          option.textContent = `${labelFromStatus(statusSelect.value)} · Vorlage ${index + 1}`;
          templateSelect.appendChild(option);
        });
        if (fillWhenEmpty && !textarea.value.trim() && templates[0]) {
          textarea.value = templates[0];
          templateSelect.value = templates[0];
        }
      }

      statusSelect.addEventListener('change', () => rebuildTemplates(true));
      templateSelect.addEventListener('change', () => { if (templateSelect.value) textarea.value = templateSelect.value; });
      rebuildTemplates(false);
    });
  }

  function getActionElement(element) {
    if (!element) return null;
    return element.closest('details, .admin-section-block, .status-update-panel, .status-history-panel, .evidence-section, .request-edit-block, form, .request-action-card, .danger-zone') || element;
  }

  function findByText(root, needles) {
    const lowerNeedles = needles.map(n => n.toLowerCase());
    const elements = Array.from(root.querySelectorAll('details, .admin-section-block, .status-update-panel, .status-history-panel, .evidence-section, .request-edit-block, form, button, a, div'));
    return getActionElement(elements.find((el) => {
      const text = (el.innerText || '').toLowerCase();
      return lowerNeedles.some(n => text.includes(n));
    }));
  }

  function ensureCard(element, className) {
    if (!element) return null;
    element.classList.add('request-action-card', className);
    return element;
  }

  function classifyActionPanels() {
    document.querySelectorAll('.request-expanded-content').forEach((content) => {
      const statusCard = ensureCard(findByText(content, ['status ändern', 'kundeninfo schreiben']), 'status-action-card');
      const sentCard = ensureCard(findByText(content, ['gesendete status', 'status-infos anzeigen']), 'sent-status-action-card');
      const archiveCard = ensureCard(findByText(content, ['nachweis', 'auftragsakte herunterladen']), 'archive-action-card');
      const dangerCard = ensureCard(findByText(content, ['löschen']), 'danger-action-card');

      const ordered = [statusCard, sentCard, archiveCard, dangerCard].filter(Boolean);
      if (ordered.length < 2) return;

      let wrapper = content.querySelector(':scope > .request-actions-stack');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'request-actions-stack';
        const first = ordered[0];
        first.parentNode.insertBefore(wrapper, first);
      }

      ordered.forEach(card => {
        if (card.parentElement !== wrapper) wrapper.appendChild(card);
      });
    });
  }

  function boot() {
    enhanceStatusForms();
    classifyActionPanels();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  document.addEventListener('click', () => setTimeout(boot, 50));
  document.addEventListener('toggle', () => setTimeout(boot, 50), true);
  const observer = new MutationObserver(() => setTimeout(boot, 50));
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
