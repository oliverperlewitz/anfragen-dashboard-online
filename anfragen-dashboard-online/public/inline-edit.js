(function () {
  function findInputByName(form, name) {
    if (!form || !name) return null;
    for (const el of Array.from(form.elements || [])) {
      if (el.name === name) return el;
    }
    return null;
  }

  function getOrCreateModal() {
    let modal = document.getElementById('inline-edit-modal-v2');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'inline-edit-modal-v2';
    modal.className = 'inline-edit-modal is-v2';
    modal.innerHTML = `
      <div class="inline-edit-modal-backdrop" data-inline-edit-close="1"></div>
      <div class="inline-edit-modal-card" role="dialog" aria-modal="true" aria-labelledby="inline-edit-title-v2">
        <button type="button" class="inline-edit-modal-close" data-inline-edit-close="1" aria-label="Schließen">×</button>
        <p class="admin-kicker">Auftragsfeld bearbeiten</p>
        <h3 id="inline-edit-title-v2">Feld bearbeiten</h3>
        <label class="inline-edit-modal-label" for="inline-edit-value-v2">Neuer Wert</label>
        <textarea id="inline-edit-value-v2" class="inline-edit-modal-input" rows="4"></textarea>
        <div class="inline-edit-modal-actions">
          <button type="button" class="secondary inline-edit-cancel" data-inline-edit-close="1">Abbrechen</button>
          <button type="button" class="inline-edit-save-v2">Speichern</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', function (event) {
      if (event.target && event.target.matches('[data-inline-edit-close]')) {
        modal.classList.remove('is-open');
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') modal.classList.remove('is-open');
    });

    return modal;
  }

  function openInlineEdit(button, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }

    const formId = button.getAttribute('data-edit-form');
    const field = button.getAttribute('data-edit-field');
    const label = button.getAttribute('data-edit-label') || field || 'Feld';
    const multiline = button.getAttribute('data-edit-multiline') === 'true';

    const form = document.getElementById(formId);
    if (!form) {
      alert('Bearbeitungsformular wurde nicht gefunden. Bitte Seite neu laden.');
      return false;
    }

    const input = findInputByName(form, field);
    if (!input) {
      alert('Dieses Feld konnte nicht gefunden werden. Bitte Seite neu laden.');
      return false;
    }

    const currentValue = input.value || button.getAttribute('data-edit-value') || '';

    try {
      const modal = getOrCreateModal();
      const title = modal.querySelector('#inline-edit-title-v2');
      const textarea = modal.querySelector('#inline-edit-value-v2');
      const saveButton = modal.querySelector('.inline-edit-save-v2');

      title.textContent = label + ' bearbeiten';
      textarea.value = currentValue;
      textarea.rows = multiline ? 7 : 3;
      modal.classList.add('is-open');

      saveButton.onclick = function () {
        input.value = textarea.value.trim();
        modal.classList.remove('is-open');
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      };

      setTimeout(function () { textarea.focus(); textarea.select(); }, 40);
    } catch (err) {
      const newValue = window.prompt(label + ' bearbeiten:', currentValue);
      if (newValue !== null) {
        input.value = String(newValue).trim();
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      }
    }

    return false;
  }

  window.openInlineEditFromButton = openInlineEdit;

  document.addEventListener('click', function (event) {
    const button = event.target && event.target.closest ? event.target.closest('.inline-edit-pencil') : null;
    if (!button) return;
    openInlineEdit(button, event);
  }, true);
})();
