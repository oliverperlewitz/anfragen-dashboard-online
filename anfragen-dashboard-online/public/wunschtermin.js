(function () {
  'use strict';

  const fallbackSlots = [
    '08:00', '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00', '15:00',
    '16:00', '17:00', '18:00'
  ];

  function byId(id) {
    return document.getElementById(id);
  }

  function formatDateLabel(value) {
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length !== 3) return value;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function setTodayMinDate(dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayValue = `${yyyy}-${mm}-${dd}`;
    dateInput.min = todayValue;

    // Falls der Browser oder ein altes Formular ein Datum vor heute gesetzt hat,
    // nicht still hängen bleiben, sondern auf heute korrigieren.
    if (dateInput.value && dateInput.value < todayValue) {
      dateInput.value = todayValue;
    }
  }

  function normalizeSlots(slots) {
    return (slots || [])
      .map((slot) => {
        if (typeof slot === 'string') return { time: slot, available: true };
        return {
          time: slot.time || slot.uhrzeit || slot.label,
          available: slot.available !== false && slot.free !== false && slot.belegt !== true
        };
      })
      .filter((slot) => slot.time);
  }

  function setHint(slotHint, text) {
    if (slotHint) slotHint.textContent = text;
  }

  function clearSelection(timeInput) {
    if (timeInput) timeInput.value = '';
    document.querySelectorAll('.slot-card.is-selected').forEach((el) => el.classList.remove('is-selected'));
  }

  function renderNoDate(slotCards, slotHint, timeInput) {
    clearSelection(timeInput);
    slotCards.innerHTML = '<div class="slot-empty">Wähle links ein Datum aus, dann erscheinen hier die freien Uhrzeiten.</div>';
    setHint(slotHint, 'Bitte zuerst ein Datum wählen.');
  }

  function renderLoading(slotCards, slotHint, timeInput) {
    clearSelection(timeInput);
    slotCards.innerHTML = '<div class="slot-loading">Freie Uhrzeiten werden geprüft...</div>';
    setHint(slotHint, 'Kalender wird geladen...');
  }

  function renderSlots(slots, slotCards, slotHint, timeInput, hintText) {
    clearSelection(timeInput);
    slotCards.innerHTML = '';

    const normalized = normalizeSlots(slots);
    const available = normalized.filter((slot) => slot.available);

    if (!normalized.length) {
      slotCards.innerHTML = '<div class="slot-empty">Für diesen Tag wurden keine Zeiten gefunden. Bitte wähle ein anderes Datum.</div>';
      setHint(slotHint, hintText || 'Keine Uhrzeiten gefunden.');
      return;
    }

    normalized.forEach((slot) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = slot.available ? 'slot-card' : 'slot-card slot-card-booked';
      button.dataset.time = slot.time;
      button.disabled = !slot.available;
      button.innerHTML = `<strong>${slot.time}</strong><span>${slot.available ? 'frei' : 'belegt'}</span>`;

      if (slot.available) {
        button.addEventListener('click', () => {
          document.querySelectorAll('.slot-card.is-selected').forEach((el) => el.classList.remove('is-selected'));
          button.classList.add('is-selected');
          timeInput.value = slot.time;
          setHint(slotHint, `${slot.time} Uhr wurde als Wunschtermin ausgewählt.`);
        });
      }

      slotCards.appendChild(button);
    });

    setHint(
      slotHint,
      hintText || (available.length
        ? `${available.length} freie Uhrzeiten verfügbar. Klicke eine Uhrzeit an.`
        : 'An diesem Tag ist keine Uhrzeit mehr frei. Bitte wähle ein anderes Datum.')
    );
  }

  async function loadSlots(dateInput, slotCards, slotHint, timeInput) {
    const date = dateInput.value;

    if (!date) {
      renderNoDate(slotCards, slotHint, timeInput);
      return;
    }

    renderLoading(slotCards, slotHint, timeInput);

    // Fallback nach 4 Sekunden, damit der Kunde nie vor einer leeren Auswahl hängt.
    const fallbackTimer = window.setTimeout(() => {
      if (!timeInput.value && slotCards.querySelector('.slot-loading')) {
        renderSlots(
          fallbackSlots,
          slotCards,
          slotHint,
          timeInput,
          `Standard-Uhrzeiten für ${formatDateLabel(date)} angezeigt. Wir prüfen den Termin beim Absenden nochmal.`
        );
      }
    }, 4000);

    try {
      const response = await fetch(`/api/available-slots?date=${encodeURIComponent(date)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const slots = Array.isArray(data.slots) ? data.slots : [];

      window.clearTimeout(fallbackTimer);

      if (!slots.length) {
        renderSlots(
          fallbackSlots,
          slotCards,
          slotHint,
          timeInput,
          `Standard-Uhrzeiten für ${formatDateLabel(date)} angezeigt. Wir prüfen den Termin beim Absenden nochmal.`
        );
        return;
      }

      renderSlots(slots, slotCards, slotHint, timeInput, `Freie Uhrzeiten für ${formatDateLabel(date)}.`);
    } catch (error) {
      window.clearTimeout(fallbackTimer);
      console.warn('[Wunschtermin] Freie Uhrzeiten konnten nicht geladen werden:', error);
      renderSlots(
        fallbackSlots,
        slotCards,
        slotHint,
        timeInput,
        `Standard-Uhrzeiten für ${formatDateLabel(date)} angezeigt. Wir prüfen den Termin beim Absenden nochmal.`
      );
    }
  }

  function initWunschtermin() {
    const dateInput = byId('wunschDatum');
    const timeInput = byId('wunschUhrzeit');
    const slotHint = byId('slotHint');
    const slotCards = byId('slotCards');

    if (!dateInput || !timeInput || !slotCards) return;

    setTodayMinDate(dateInput);
    renderNoDate(slotCards, slotHint, timeInput);

    let lastValue = dateInput.value;
    let debounce = null;

    const triggerLoad = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (dateInput.value !== lastValue || dateInput.value) {
          lastValue = dateInput.value;
          loadSlots(dateInput, slotCards, slotHint, timeInput);
        }
      }, 80);
    };

    dateInput.addEventListener('change', triggerLoad);
    dateInput.addEventListener('input', triggerLoad);
    dateInput.addEventListener('blur', triggerLoad);

    // Mobile/iPad/Safari feuert manchmal input/change nicht zuverlässig.
    // Dieser kleine Watcher erkennt trotzdem, wenn sich das Datum geändert hat.
    window.setInterval(() => {
      if (dateInput.value && dateInput.value !== lastValue) {
        lastValue = dateInput.value;
        loadSlots(dateInput, slotCards, slotHint, timeInput);
      }
    }, 500);

    if (dateInput.value) {
      loadSlots(dateInput, slotCards, slotHint, timeInput);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWunschtermin);
  } else {
    initWunschtermin();
  }
})();
