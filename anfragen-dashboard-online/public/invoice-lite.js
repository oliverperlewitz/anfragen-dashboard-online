(function () {
  const COMPANY_NAME = 'GrünWerk Gartenbau';
  const DEFAULT_FOOTER = 'Vielen Dank für deinen Auftrag.';
  let invoiceSettings = {
    companyName: COMPANY_NAME,
    companyAddress: '',
    iban: '',
    bic: '',
    accountHolder: '',
    bank: '',
    paypalEmail: '',
    footer: DEFAULT_FOOTER
  };

  function paymentDetailsFromSettings() {
    return [
      invoiceSettings.iban ? `IBAN: ${invoiceSettings.iban}` : '',
      invoiceSettings.bic ? `BIC: ${invoiceSettings.bic}` : '',
      invoiceSettings.accountHolder ? `Kontoinhaber: ${invoiceSettings.accountHolder}` : '',
      invoiceSettings.bank ? `Bank: ${invoiceSettings.bank}` : '',
      invoiceSettings.paypalEmail ? `PayPal: ${invoiceSettings.paypalEmail}` : ''
    ].filter(Boolean).join('\n');
  }

  async function loadInvoiceSettings() {
    try {
      const response = await fetch('/admin/invoice-settings', { credentials: 'same-origin' });
      if (!response.ok) return invoiceSettings;
      const data = await response.json();
      invoiceSettings = { ...invoiceSettings, ...(data || {}) };
    } catch (error) {
      console.warn('[Invoice] Einstellungen konnten nicht geladen werden:', error);
    }
    return invoiceSettings;
  }

  function applyInvoiceSettings(panel) {
    const companyAddress = panel.querySelector('.company-address');
    if (companyAddress && !companyAddress.value.trim() && invoiceSettings.companyAddress) companyAddress.value = invoiceSettings.companyAddress;

    const ibanField = panel.querySelector('.invoice-iban');
    const paymentDetails = paymentDetailsFromSettings();
    if (ibanField && !ibanField.value.trim() && paymentDetails) ibanField.value = paymentDetails;
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function text(el) {
    return (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim();
  }

  function money(value) {
    const number = Number(String(value || '').replace(',', '.')) || 0;
    return number.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  function parseMoney(value) {
    return Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char];
    });
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function isoDate(date = new Date()) {
    return date.toISOString().slice(0, 10);
  }

  function germanDate(dateValue) {
    const d = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(d.getTime())) return isoDate();
    return d.toLocaleDateString('de-DE');
  }

  function findDataValue(card, labels) {
    const wanted = labels.map(l => String(l).toLowerCase());
    const candidates = Array.from(card.querySelectorAll('.mini-box, .data-list > div, .editable-data-row, .admin-card-grid > div'));
    for (const box of candidates) {
      const label = text(box.querySelector('span')).toLowerCase();
      if (wanted.some(w => label.includes(w))) {
        const strong = box.querySelector('strong');
        const value = text(strong || box).replace(text(box.querySelector('span')), '').trim();
        return value || '-';
      }
    }
    return '-';
  }

  function extractRequestData(card) {
    const ticketRaw = text(card.querySelector('.request-id')) || '#000000';
    const ticket = ticketRaw.replace(/[^#0-9A-Za-z-]/g, '') || ticketRaw;
    const name = text(card.querySelector('.admin-request-top h3, h3')) || 'Kunde';
    const date = text(card.querySelector('.request-date')) || germanDate(new Date());
    const service = findDataValue(card, ['leistung']) || 'Gartenarbeit';
    const email = findDataValue(card, ['e-mail', 'email']);
    const phone = findDataValue(card, ['telefon']);
    const address = findDataValue(card, ['adresse', 'ort']);
    const detailsEl = card.querySelector('.request-details-clean p, .details-edit-row p');
    const detailsText = text(detailsEl);
    let paymentWish = findDataValue(card, ['zahlungswunsch', 'zahlung']);
    if (!paymentWish || paymentWish === '-') {
      const match = detailsText.match(/Zahlungswunsch:\s*([^\n]+)/i);
      paymentWish = match ? match[1].trim() : '';
    }
    return { ticket, name, date, service, email, phone, address, details: detailsText, paymentWish };
  }

  function invoiceNumber(kind, ticket) {
    const year = new Date().getFullYear();
    const suffix = String(ticket || '').replace(/\D/g, '').slice(-6) || Math.floor(Math.random() * 999999).toString().padStart(6, '0');
    return `${kind === 'cash' ? 'BR' : 'RG'}-${year}-${suffix}`;
  }

  function createItemRow(description = '', qty = '1', price = '') {
    const row = document.createElement('div');
    row.className = 'invoice-lite-item-row';
    row.innerHTML = `
      <input class="invoice-lite-desc" placeholder="Beschreibung" value="${escapeHtml(description)}">
      <input class="invoice-lite-qty" inputmode="decimal" placeholder="Menge" value="${escapeHtml(qty)}">
      <input class="invoice-lite-price" inputmode="decimal" placeholder="Einzelpreis €" value="${escapeHtml(price)}">
      <button type="button" class="invoice-lite-remove" title="Position entfernen">×</button>
    `;
    row.querySelector('.invoice-lite-remove').addEventListener('click', () => row.remove());
    return row;
  }

  function makePanel(card) {
    if (card.querySelector('.invoice-lite-panel')) return;
    const data = extractRequestData(card);
    const panel = document.createElement('details');
    panel.className = 'invoice-lite-panel';
    panel.innerHTML = `
      <summary>Zahlung & Rechnung <small>PDF/Barquittung erstellen</small></summary>
      <div class="invoice-lite-body">
        <p class="invoice-lite-note">PDF kann im Browser geöffnet oder direkt per Resend an den Kunden gesendet werden.</p>
        <div class="invoice-lite-grid three">
          <label class="invoice-lite-field"><span>Dokument</span><select class="invoice-kind"><option value="invoice">Rechnung / Überweisung</option><option value="cash">Barzahlung / Quittung</option><option value="paypal">PayPal</option><option value="card">Kartenzahlung / Sonstiges</option></select></label>
          <label class="invoice-lite-field"><span>Rechnungsdatum</span><input class="invoice-date" type="date" value="${isoDate()}"></label>
          <label class="invoice-lite-field"><span>Leistungsdatum</span><input class="service-date" type="date" value="${isoDate()}"></label>
        </div>
        <div class="invoice-lite-grid">
          <label class="invoice-lite-field"><span>Kunde</span><input class="customer-name" value="${escapeHtml(data.name)}"></label>
          <label class="invoice-lite-field"><span>E-Mail</span><input class="customer-email" value="${escapeHtml(data.email === '-' ? '' : data.email)}"></label>
          <label class="invoice-lite-field"><span>Kundenadresse</span><textarea class="customer-address" placeholder="Straße, PLZ Ort">${escapeHtml(data.address === '-' ? '' : data.address)}</textarea></label>
          <label class="invoice-lite-field"><span>Deine Firmenadresse</span><textarea class="company-address" placeholder="Oliver Perlewitz\nStraße Hausnummer\nPLZ Ort"></textarea></label>
        </div>
        <div class="invoice-lite-items">
          <div class="invoice-lite-items-head"><span>Leistung</span><span>Menge</span><span>Preis</span><span></span></div>
          <div class="invoice-lite-items-list"></div>
          <button type="button" class="secondary invoice-add-item">+ Position hinzufügen</button>
        </div>
        <div class="invoice-lite-grid">
          <label class="invoice-lite-field"><span>IBAN / Zahlungsdaten</span><textarea class="invoice-iban" placeholder="IBAN: DE...\nBIC: ...\nKontoinhaber: GrünWerk Gartenbau"></textarea></label>
          <label class="invoice-lite-field"><span>Rechtlicher Hinweis</span><textarea class="invoice-legal">Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</textarea></label>
        </div>
        <div class="invoice-lite-actions">
          <button type="button" class="invoice-preview">PDF öffnen / drucken</button>
          <button type="button" class="secondary invoice-email">Rechnung per E-Mail senden</button>
        </div>
      </div>
    `;
    const list = panel.querySelector('.invoice-lite-items-list');
    list.appendChild(createItemRow(data.service && data.service !== '-' ? data.service : 'Gartenarbeit vor Ort', '1', ''));
    panel.querySelector('.invoice-add-item').addEventListener('click', () => list.appendChild(createItemRow('', '1', '')));
    const kindSelect = panel.querySelector('.invoice-kind');
    const wish = String(data.paymentWish || '').toLowerCase();
    if (kindSelect) {
      if (wish.includes('bar')) kindSelect.value = 'cash';
      else if (wish.includes('paypal') || wish.includes('pay pal')) kindSelect.value = 'paypal';
      else if (wish.includes('karte') || wish.includes('sumup') || wish.includes('sonstig')) kindSelect.value = 'card';
      else if (wish.includes('rechnung') || wish.includes('überweisung') || wish.includes('ueberweisung')) kindSelect.value = 'invoice';
    }
    panel.querySelector('.invoice-preview').addEventListener('click', () => openInvoice(panel, data));
    panel.querySelector('.invoice-email').addEventListener('click', () => sendInvoiceEmail(panel, data));
    applyInvoiceSettings(panel);

    const target = card.querySelector('.calendar-request-panel') || card.querySelector('.admin-card-grid') || card.querySelector('.request-expanded-content');
    if (target && target.parentNode) target.parentNode.insertBefore(panel, target.nextSibling);
    else card.appendChild(panel);
  }

  function collect(panel, data) {
    const kind = panel.querySelector('.invoice-kind').value;
    const invNo = invoiceNumber(kind, data.ticket);
    const invDate = panel.querySelector('.invoice-date').value || isoDate();
    const serviceDate = panel.querySelector('.service-date').value || invDate;
    const rows = Array.from(panel.querySelectorAll('.invoice-lite-item-row')).map(row => {
      const description = row.querySelector('.invoice-lite-desc').value || 'Leistung';
      const qty = parseMoney(row.querySelector('.invoice-lite-qty').value || '1') || 1;
      const price = parseMoney(row.querySelector('.invoice-lite-price').value || '0');
      return { description, qty, price, total: qty * price };
    }).filter(r => r.description.trim());
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    return {
      kind,
      title: kind === 'cash' ? 'BARRECHNUNG / QUITTUNG' : 'RECHNUNG',
      invNo,
      invDate,
      serviceDate,
      dueDate: isoDate(addDays(invDate, 14)),
      customerName: panel.querySelector('.customer-name').value || data.name,
      customerEmail: panel.querySelector('.customer-email').value || '',
      customerAddress: panel.querySelector('.customer-address').value || '',
      companyAddress: panel.querySelector('.company-address').value || '',
      iban: panel.querySelector('.invoice-iban').value || '',
      legal: panel.querySelector('.invoice-legal').value || '',
      rows,
      total,
      ticket: data.ticket
    };
  }

  function paymentDueText(doc) {
    const due = germanDate(doc.dueDate);
    if (doc.kind === 'cash') {
      return `Zahlungsart: Barzahlung\nBetrag dankend bar erhalten am ${germanDate(doc.invDate)}.\nZahlungsstatus: Bezahlt`;
    }
    if (doc.kind === 'paypal') {
      return [
        'Zahlungsart: PayPal',
        'Zahlungsziel: 14 Tage',
        `Zahlbar bis: ${due}`,
        `Bitte senden Sie den Rechnungsbetrag ohne Abzug bis zum genannten Datum per PayPal${invoiceSettings.paypalEmail ? ` an ${invoiceSettings.paypalEmail}` : ''}.`,
        `Verwendungszweck: ${doc.invNo}`
      ].filter(Boolean).join('\n');
    }
    if (doc.kind === 'card') {
      return 'Zahlungsart: Kartenzahlung / Sonstiges\nZahlung erhalten oder gesondert vereinbart.';
    }
    return [
      'Zahlungsart: Überweisung',
      'Zahlungsziel: 14 Tage',
      `Zahlbar bis: ${due}`,
      'Bitte überweisen Sie den Rechnungsbetrag ohne Abzug bis zum genannten Datum.',
      `Bitte geben Sie als Verwendungszweck die Rechnungsnummer ${doc.invNo} an.`
    ].join('\n');
  }

  function openInvoice(panel, data) {
    const doc = collect(panel, data);
    const paymentText = paymentDueText(doc);

    const rowsHtml = doc.rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.description)}</td>
        <td>${String(row.qty).replace('.', ',')}</td>
        <td>${money(row.price)}</td>
        <td>${money(row.total)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(doc.invNo)}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: Arial, sans-serif; color:#173522; margin:0; background:#fff; }
        .top { display:flex; justify-content:space-between; gap:30px; align-items:flex-start; }
        .brand h1 { margin:0; font-size:26px; color:#123b25; }
        .brand p, .meta p, .small { white-space:pre-line; color:#5d6c5c; line-height:1.45; margin:6px 0 0; font-size:12px; }
        .meta { text-align:right; }
        .meta strong { display:block; font-size:15px; margin-bottom:4px; }
        .line { height:5px; background:#1f5d38; border-radius:99px; margin:24px 0; }
        h2 { margin:0 0 10px; font-size:30px; letter-spacing:-.03em; color:#123b25; }
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin:20px 0 26px; }
        .box { background:#f7f8f2; border:1px solid #dfe6dc; border-radius:16px; padding:15px; min-height:95px; }
        .box span { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.08em; font-weight:bold; color:#72806f; margin-bottom:8px; }
        .box p { margin:0; white-space:pre-line; line-height:1.55; }
        table { width:100%; border-collapse:collapse; margin-top:18px; }
        th { background:#123b25; color:white; text-align:left; padding:11px 10px; font-size:12px; }
        td { border-bottom:1px solid #e5eadf; padding:11px 10px; vertical-align:top; }
        td:nth-child(1), td:nth-child(3), td:nth-child(4), td:nth-child(5), th:nth-child(1), th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align:right; }
        .total { margin-left:auto; margin-top:20px; width:310px; background:#123b25; color:white; border-radius:18px; padding:18px; display:flex; justify-content:space-between; align-items:center; }
        .total span { font-size:13px; opacity:.85; }
        .total strong { font-size:24px; }
        .payment { margin-top:24px; padding:16px; border-radius:16px; background:#f1f7ed; border:1px solid #d6e7d2; }
        .payment h3, .footer h3 { margin:0 0 8px; color:#123b25; }
        .payment p { margin:0; white-space:pre-line; line-height:1.55; }
        .footer { margin-top:22px; color:#5d6c5c; font-size:12px; line-height:1.55; }
        .print { position:fixed; right:18px; top:18px; border:0; background:#1f5d38; color:#fff; border-radius:999px; padding:12px 18px; font-weight:bold; cursor:pointer; }
        @media print { .print { display:none; } }
      </style></head><body>
      <button class="print" onclick="window.print()">Als PDF speichern / drucken</button>
      <div class="top">
        <div class="brand"><h1>${escapeHtml(invoiceSettings.companyName || COMPANY_NAME)}</h1><p>${escapeHtml(doc.companyAddress || invoiceSettings.companyAddress || 'Firmenadresse hier eintragen')}</p></div>
        <div class="meta"><strong>${escapeHtml(doc.invNo)}</strong><p>Datum: ${germanDate(doc.invDate)}\nLeistungsdatum: ${germanDate(doc.serviceDate)}\nTicket: ${escapeHtml(doc.ticket)}</p></div>
      </div>
      <div class="line"></div>
      <h2>${doc.title}</h2>
      <div class="grid">
        <div class="box"><span>Rechnung an</span><p><strong>${escapeHtml(doc.customerName)}</strong>\n${escapeHtml(doc.customerAddress || '')}</p></div>
        <div class="box"><span>Zahlung</span><p>${escapeHtml(paymentText)}</p></div>
      </div>
      <table><thead><tr><th>Pos.</th><th>Beschreibung</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <div class="total"><span>Gesamtbetrag</span><strong>${money(doc.total)}</strong></div>
      <div class="payment"><h3>Zahlungsdaten</h3><p>${escapeHtml(doc.iban || paymentText)}</p></div>
      <div class="footer"><h3>Hinweis</h3><p>${escapeHtml(doc.legal || '')}</p><p>${escapeHtml(invoiceSettings.footer || DEFAULT_FOOTER)}</p></div>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Popup wurde blockiert. Bitte Popups für diese Seite erlauben.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function getCsrfToken() {
    const tokenInput = document.querySelector('input[name="_csrf"]');
    return tokenInput ? tokenInput.value : '';
  }

  async function sendInvoiceEmail(panel, data) {
    const doc = collect(panel, data);
    const email = doc.customerEmail || data.email;
    if (!email || email === '-') {
      alert('Keine Kunden-E-Mail gefunden. Bitte erst E-Mail eintragen.');
      return;
    }
    if (!doc.rows.length || doc.total <= 0) {
      alert('Bitte mindestens eine Position mit Preis eintragen.');
      return;
    }

    const confirmed = confirm(`Rechnung ${doc.invNo} über ${money(doc.total)} an ${email} senden?`);
    if (!confirmed) return;

    const button = panel.querySelector('.invoice-email');
    const oldText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Sende Rechnung...';
    }

    try {
      const body = new URLSearchParams();
      body.set('_csrf', getCsrfToken());
      body.set('invoiceData', JSON.stringify({
        ...doc,
        companyName: invoiceSettings.companyName || COMPANY_NAME,
        footer: invoiceSettings.footer || DEFAULT_FOOTER,
        paypalEmail: invoiceSettings.paypalEmail || '',
        paymentText: paymentDueText(doc),
        paymentDetails: doc.iban || paymentDetailsFromSettings()
      }));

      const response = await fetch('/admin/invoice/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        credentials: 'same-origin',
        body
      });

      let result = {};
      try { result = await response.json(); } catch (error) {}
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      alert(`Rechnung wurde gesendet.\nPDF gespeichert: ${result.filename || doc.invNo}`);
      if (result.downloadUrl) {
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.textContent = 'Gespeicherte PDF herunterladen';
        link.className = 'invoice-sent-download';
        link.target = '_blank';
        const actions = panel.querySelector('.invoice-lite-actions');
        if (actions && !actions.querySelector('.invoice-sent-download')) actions.appendChild(link);
      }
    } catch (error) {
      console.error('[Invoice] Senden fehlgeschlagen:', error);
      alert(`Rechnung konnte nicht gesendet werden:\n${error.message}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || 'Rechnung per E-Mail senden';
      }
    }
  }


  function initInvoices() {
    const cards = document.querySelectorAll('.admin-request-card');
    cards.forEach(makePanel);
    document.querySelectorAll('.invoice-lite-panel').forEach(applyInvoiceSettings);
  }

  ready(async function () {
    await loadInvoiceSettings();
    initInvoices();
    const observer = new MutationObserver(() => initInvoices());
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
