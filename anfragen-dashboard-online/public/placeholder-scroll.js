(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function isIgnoredField(el) {
    if (!el || el.dataset.noMarquee === 'true') return true;
    if (el.matches('input[type="file"], input[type="checkbox"], input[type="radio"], input[type="hidden"], input[type="submit"], button')) return true;
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
    if (el.tagName === 'TEXTAREA') wrapper.classList.add('is-textarea');

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
        const distance = Math.max(18, Math.ceil(textWidth - fieldWidth + 22));
        wrapper.style.setProperty('--gw-marquee-distance', distance + 'px');
        wrapper.style.setProperty('--gw-marquee-duration', Math.min(11, Math.max(5, distance / 16)) + 's');
      });
    }

    ['input', 'change', 'focus', 'blur'].forEach(function (eventName) {
      el.addEventListener(eventName, update);
    });

    setTimeout(update, 60);
    window.addEventListener('resize', update);
  }

  function init() {
    document
      .querySelectorAll('input[placeholder], textarea[placeholder], select')
      .forEach(enhanceField);
  }

  ready(function () {
    init();
    const observer = new MutationObserver(init);
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
