(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function normalized(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isIgnoredField(el) {
    if (!el || el.dataset.noMarquee === 'true') return true;
    if (el.matches('textarea, input[type="file"], input[type="checkbox"], input[type="radio"], input[type="hidden"], input[type="submit"], button')) return true;

    const name = normalized(el.getAttribute('name'));
    const type = normalized(el.getAttribute('type'));
    const placeholder = normalized(el.getAttribute('placeholder'));

    // Name und E-Mail sollen bewusst stehen bleiben.
    if (name === 'name' || name === 'email') return true;
    if (type === 'email') return true;
    if (placeholder.includes('name')) return true;
    if (placeholder.includes('e-mail') || placeholder.includes('email')) return true;

    return false;
  }

  function getHintText(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const option = el.options && el.options[el.selectedIndex >= 0 ? el.selectedIndex : 0];
      return option ? option.textContent.trim() : '';
    }
    return (el.getAttribute('placeholder') || '').trim();
  }

  function hasRealValue(el) {
    if (el.tagName === 'SELECT') return Boolean(el.value);
    return Boolean(String(el.value || '').trim());
  }

  function measureTextWidth(text, el) {
    const measure = document.createElement('span');
    const style = window.getComputedStyle(el);
    measure.textContent = text;
    measure.style.position = 'absolute';
    measure.style.visibility = 'hidden';
    measure.style.whiteSpace = 'nowrap';
    measure.style.font = style.font;
    measure.style.letterSpacing = style.letterSpacing;
    document.body.appendChild(measure);
    const width = measure.getBoundingClientRect().width;
    measure.remove();
    return width;
  }

  function enhanceField(el) {
    if (isIgnoredField(el) || el.closest('.gw-marquee-field')) return;

    const hintText = getHintText(el);
    if (!hintText) return;

    const parent = el.parentElement;
    if (!parent) return;

    const wrapper = document.createElement('span');
    wrapper.className = 'gw-marquee-field';

    parent.insertBefore(wrapper, el);
    wrapper.appendChild(el);

    const overlay = document.createElement('span');
    overlay.className = 'gw-marquee-overlay';
    const text = document.createElement('span');
    text.className = 'gw-marquee-text';
    text.textContent = hintText;
    overlay.appendChild(text);
    wrapper.appendChild(overlay);

    if (el.tagName !== 'SELECT') {
      el.dataset.originalPlaceholder = hintText;
      el.classList.add('gw-native-placeholder-hidden');
    }

    function update() {
      const currentText = getHintText(el);
      text.textContent = currentText;
      wrapper.classList.toggle('has-value', hasRealValue(el));
      wrapper.classList.toggle('is-focused', document.activeElement === el);

      if (el.tagName === 'SELECT') {
        el.classList.toggle('gw-native-placeholder-hidden', !hasRealValue(el));
      }

      window.requestAnimationFrame(function () {
        const fieldWidth = Math.max(0, el.getBoundingClientRect().width - 34);
        const textWidth = measureTextWidth(currentText, el);
        const overflow = textWidth > fieldWidth && !hasRealValue(el);
        wrapper.classList.toggle('is-overflow', overflow);

        const distance = Math.max(18, Math.ceil(textWidth - fieldWidth + 28));
        // Langsamer als vorher: je länger der Text, desto länger läuft er.
        const duration = Math.min(24, Math.max(10, distance / 8));
        wrapper.style.setProperty('--gw-marquee-distance', distance + 'px');
        wrapper.style.setProperty('--gw-marquee-duration', duration + 's');
      });
    }

    ['input', 'change', 'focus', 'blur'].forEach(function (eventName) {
      el.addEventListener(eventName, update);
    });

    setTimeout(update, 80);
    window.addEventListener('resize', update);
  }

  function init() {
    document
      .querySelectorAll('input[placeholder], select')
      .forEach(enhanceField);
  }

  ready(function () {
    init();
    const observer = new MutationObserver(init);
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
