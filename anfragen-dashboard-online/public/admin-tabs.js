(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    const mainPages = new Set(['uebersicht', 'anfragen', 'kalender', 'emails', 'sicherheit']);
    const securityPages = new Set(['backups', 'aktivitaetsprotokoll', 'login-historie', 'geloeschte-anfragen']);

    function cleanHash(value) {
      return String(value || '').replace('#', '').trim() || 'uebersicht';
    }

    function pageFor(targetValue) {
      const target = cleanHash(targetValue);
      if (securityPages.has(target) || target === 'sicherheit') return 'sicherheit';
      if (target === 'general-emails') return 'emails';
      if (target.startsWith('dep-') || target.startsWith('request-')) return 'anfragen';
      if (mainPages.has(target)) return target;
      return 'uebersicht';
    }

    function updateActiveNavigation(page, target) {
      document.querySelectorAll('[data-nav-page]').forEach((link) => {
        const isMainSecurity = link.classList.contains('sidebar-security-main');
        const active = link.dataset.navPage === page && (!isMainSecurity || page === 'sicherheit');
        link.classList.toggle('active', active);
      });

      document.querySelectorAll('[data-security-nav]').forEach((box) => {
        box.classList.toggle('active', page === 'sicherheit');
      });

      document.querySelectorAll('.sidebar-subnav a').forEach((link) => {
        const hrefTarget = cleanHash(link.getAttribute('href'));
        link.classList.toggle('active', hrefTarget === target);
      });
    }

    function showPage(targetValue, shouldScroll) {
      const target = cleanHash(targetValue || window.location.hash);
      const page = pageFor(target);
      const sections = document.querySelectorAll('[data-admin-page]');

      sections.forEach((section) => {
        let show = section.dataset.adminPage === page;

        if (page === 'sicherheit') {
          if (securityPages.has(target)) {
            show = section.id === target;
          } else {
            show = section.id === 'sicherheit';
          }
        }

        if (show) {
          section.removeAttribute('hidden');
          section.classList.remove('admin-page-hidden');
        } else {
          section.setAttribute('hidden', '');
          section.classList.add('admin-page-hidden');
        }
      });

      updateActiveNavigation(page, target);
      document.body.classList.remove('sidebar-open');

      if (shouldScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', function (event) {
        const target = cleanHash(link.getAttribute('href'));
        const page = pageFor(target);
        if (!mainPages.has(page)) return;
        event.preventDefault();
        if (window.location.hash === '#' + target) {
          showPage(target, true);
        } else {
          window.location.hash = target;
        }
      });
    });

    window.addEventListener('hashchange', function () {
      showPage(window.location.hash, true);
    });

    const initial = window.location.hash || '#uebersicht';
    showPage(initial, false);
    window.GRUENWERK_SHOW_ADMIN_PAGE = showPage;
  });
})();
