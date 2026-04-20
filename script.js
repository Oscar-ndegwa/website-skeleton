/* =========================================================
   Salome's site — vanilla JS interactivity
   - Mobile nav toggle
   - Footer year
   - Site-wide search overlay (live results, jump-to-section)
   ========================================================= */

/* ---------- Dark mode toggle (persisted in localStorage) ---------- */
(function () {
  const STORAGE_KEY = 'salome-theme';
  const root = document.documentElement;
  const stored = (function () {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  })();
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = stored || (prefersDark ? 'dark' : 'light');
  if (initial === 'dark') root.setAttribute('data-theme', 'dark');

  function setTheme(mode) {
    if (mode === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(mode === 'dark'));
      btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    btn.setAttribute('aria-pressed', String(current === 'dark'));
    btn.setAttribute('aria-label', current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  });
})();

/* ---------- Mobile nav toggle ---------- */
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.getElementById('nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  navLinks.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- Footer year ---------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- Search ---------- */
(function initSearch() {
  const openBtn = document.getElementById('search-open');
  const closeBtn = document.getElementById('search-close');
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  if (!openBtn || !overlay || !input || !resultsEl) return;

  // Build a searchable index from the live DOM so it always matches what the user sees.
  const SECTION_LABELS = {
    home: 'Home',
    about: 'About',
    gallery: 'Gallery',
    books: 'Books',
    contact: 'Contacts',
  };

  function buildIndex() {
    const items = [];
    document.querySelectorAll('main section[id]').forEach((section) => {
      const sectionId = section.id;
      const sectionLabel = SECTION_LABELS[sectionId] || sectionId;

      // Index meaningful blocks within each section
      const blocks = section.querySelectorAll(
        'h1, h2, h3, h4, p, li, .book-card, .article-card, .gallery-item, .contact-list li'
      );
      const seen = new Set();
      blocks.forEach((el) => {
        // Avoid double-indexing nested elements (e.g. <p> inside a card we already added)
        if ([...seen].some((s) => s.contains(el))) return;
        const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
        if (text.length < 3) return;
        // Pick a short title: first heading inside, otherwise first sentence
        const heading = el.querySelector && el.querySelector('h1,h2,h3,h4,.book-title');
        const title = heading
          ? heading.innerText.trim()
          : text.split(/[.!?]/)[0].slice(0, 80);
        items.push({
          sectionId,
          sectionLabel,
          title,
          text,
          el,
        });
        seen.add(el);
      });
    });
    return items;
  }

  let index = [];

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function highlight(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  }

  function snippet(text, query, len = 140) {
    if (!query) return text.slice(0, len);
    const i = text.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return text.slice(0, len);
    const start = Math.max(0, i - 40);
    const end = Math.min(text.length, i + query.length + 100);
    return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
  }

  function render(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      resultsEl.innerHTML = '<p class="search-hint">Start typing to search the whole site.</p>';
      return;
    }
    const matches = index
      .map((item) => {
        const hay = (item.title + ' ' + item.text).toLowerCase();
        const score = hay.includes(q) ? hay.indexOf(q) : -1;
        return { item, score };
      })
      .filter((m) => m.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 25);

    if (!matches.length) {
      resultsEl.innerHTML = '<p class="search-empty">No results for “' + escapeHtml(query) + '”.</p>';
      return;
    }

    resultsEl.innerHTML = matches
      .map(({ item }, idx) => {
        const snip = snippet(item.text, q);
        return (
          '<button class="search-result" data-idx="' + idx + '">' +
            '<span class="sr-section">' + escapeHtml(item.sectionLabel) + '</span>' +
            '<div class="sr-title">' + highlight(item.title, q) + '</div>' +
            '<div class="sr-snippet">' + highlight(snip, q) + '</div>' +
          '</button>'
        );
      })
      .join('');

    resultsEl.querySelectorAll('.search-result').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-idx'));
        const target = matches[i].item.el;
        closeSearch();
        // briefly highlight the matched element
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('search-flash');
        setTimeout(() => target.classList.remove('search-flash'), 1800);
      });
    });
  }

  function openSearch() {
    index = buildIndex();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('search-open');
    setTimeout(() => input.focus(), 30);
  }

  function closeSearch() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('search-open');
    input.value = '';
    render('');
  }

  openBtn.addEventListener('click', openSearch);
  closeBtn && closeBtn.addEventListener('click', closeSearch);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSearch(); });

  // Live search (debounced)
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => render(input.value), 80);
  });

  // Keyboard: "/" to open, Esc to close, Enter to jump to first result
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !overlay.classList.contains('open')) {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeSearch();
    } else if (e.key === 'Enter' && overlay.classList.contains('open')) {
      const first = resultsEl.querySelector('.search-result');
      if (first) first.click();
    }
  });
})();

/* === Chapter accordion === */
(function () {
  document.querySelectorAll('.chapter-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });
  });
})();

/* ---------- Contact form (vanilla validation, no backend) ---------- */
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const nameEl = form.querySelector('#cf-name');
  const emailEl = form.querySelector('#cf-email');
  const msgEl = form.querySelector('#cf-message');
  const countEl = form.querySelector('#cf-count');
  const successBox = form.querySelector('#cf-success');
  const successName = form.querySelector('#cf-success-name');
  const submitBtn = form.querySelector('.form-submit');

  // Strict but reasonable email check
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const errorEls = {
    name: form.querySelector('[data-error-for="name"]'),
    email: form.querySelector('[data-error-for="email"]'),
    message: form.querySelector('[data-error-for="message"]'),
  };

  function setError(field, message) {
    const el = errorEls[field];
    if (!el) return;
    el.textContent = message || '';
    const row = el.closest('.form-row');
    if (row) row.classList.toggle('has-error', !!message);
  }

  function clearAllErrors() {
    Object.keys(errorEls).forEach((k) => setError(k, ''));
  }

  function validate() {
    const values = {
      name: (nameEl.value || '').trim(),
      email: (emailEl.value || '').trim(),
      message: (msgEl.value || '').trim(),
    };
    const errors = {};

    if (!values.name) errors.name = 'Please enter your name.';
    else if (values.name.length < 2) errors.name = 'Name is a bit too short.';
    else if (values.name.length > 100) errors.name = 'Name must be under 100 characters.';

    if (!values.email) errors.email = 'Please enter your email.';
    else if (values.email.length > 255) errors.email = 'Email is too long.';
    else if (!EMAIL_RE.test(values.email)) errors.email = 'Please enter a valid email address.';

    if (!values.message) errors.message = 'Please write a short message.';
    else if (values.message.length < 10) errors.message = 'Message should be at least 10 characters.';
    else if (values.message.length > 1000) errors.message = 'Message must be under 1000 characters.';

    return { values, errors };
  }

  // Live character counter
  function updateCount() {
    if (countEl) countEl.textContent = String((msgEl.value || '').length);
  }
  msgEl.addEventListener('input', updateCount);
  updateCount();

  // Clear field-level errors as the user types
  [nameEl, emailEl, msgEl].forEach((el) => {
    el.addEventListener('input', () => {
      const field = el.name;
      if (errorEls[field]) setError(field, '');
      if (!successBox.hidden) successBox.hidden = true;
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();
    const { values, errors } = validate();
    const errorKeys = Object.keys(errors);

    if (errorKeys.length) {
      errorKeys.forEach((k) => setError(k, errors[k]));
      const firstField = errorKeys[0];
      const firstEl = form.querySelector(`[name="${firstField}"]`);
      if (firstEl) firstEl.focus();
      return;
    }

    // Simulate sending (no backend)
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = 'Sending…';

    setTimeout(() => {
      // Show inline success
      successName.textContent = values.name;
      successBox.hidden = false;
      form.reset();
      updateCount();
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      // Bring success into view on small screens
      successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 450);
  });
})();

/* ============================================================
   Modern interactivity additions
   ============================================================ */

/* ---------- Reading progress bar ---------- */
(function () {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  function update() {
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (scrolled / max) * 100 : 0;
    bar.style.width = pct + '%';
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

/* ---------- Scroll reveal (IntersectionObserver) ---------- */
(function () {
  const els = document.querySelectorAll('.reveal, .reveal-stagger');
  if (!('IntersectionObserver' in window)) {
    els.forEach((e) => e.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
})();

/* ---------- Scroll spy: active nav link ---------- */
(function () {
  const links = document.querySelectorAll('.nav-links a[href^="#"]');
  const sections = [...links].map((l) => document.querySelector(l.getAttribute('href'))).filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const map = new Map();
  sections.forEach((s, i) => map.set(s.id, links[i]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.remove('is-active'));
        const link = map.get(e.target.id);
        if (link) link.classList.add('is-active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach((s) => io.observe(s));
})();

/* ---------- Animated number counters ---------- */
(function () {
  const nums = document.querySelectorAll('.stat-num[data-count]');
  if (!nums.length) return;
  function animate(el) {
    const target = parseInt(el.getAttribute('data-count'), 10) || 0;
    const dur = 1400;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + (t === 1 ? '+' : '');
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if (!('IntersectionObserver' in window)) { nums.forEach(animate); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  nums.forEach((n) => io.observe(n));
})();

/* ---------- Typewriter for hero roles ---------- */
(function () {
  const el = document.getElementById('typewriter');
  if (!el) return;
  const words = ['SCHOLAR', 'EDUCATOR', 'RESEARCHER', 'AUTHOR'];
  let i = 0, j = 0, deleting = false;
  function tick() {
    const word = words[i];
    el.textContent = deleting ? word.slice(0, --j) : word.slice(0, ++j);
    let delay = deleting ? 60 : 110;
    if (!deleting && j === word.length) { delay = 1400; deleting = true; }
    else if (deleting && j === 0) { deleting = false; i = (i + 1) % words.length; delay = 300; }
    setTimeout(tick, delay);
  }
  tick();
})();

/* ---------- Back to top ---------- */
(function () {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;
  btn.hidden = false;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('is-visible', window.scrollY > 600);
  }, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ---------- Toast helper ---------- */
const showToast = (function () {
  const el = document.getElementById('toast');
  let t;
  return function (msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove('is-visible'), 2200);
  };
})();

/* ---------- Copy to clipboard ---------- */
(function () {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    const text = btn.getAttribute('data-copy');
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast('Copied: ' + text),
        () => showToast('Copy failed')
      );
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('Copied: ' + text); }
      catch (_) { showToast('Copy failed'); }
      document.body.removeChild(ta);
    }
  });
})();

/* ---------- Lightbox for gallery ---------- */
(function () {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const content = lb.querySelector('.lightbox-content');
  const closeBtn = lb.querySelector('.lightbox-close');

  function open(html) {
    content.innerHTML = html;
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.classList.add('search-open');
  }
  function close() {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('search-open');
    content.innerHTML = '';
  }

  document.querySelectorAll('.gallery-item').forEach((item) => {
    item.addEventListener('click', () => {
      const img = item.querySelector('.gallery-img');
      const title = item.querySelector('h3')?.textContent || '';
      const cap = item.querySelector('p')?.textContent || '';
      const bg = img ? getComputedStyle(img).backgroundImage : '';
      const html =
        '<div style="width:min(80vw,900px);aspect-ratio:16/10;background:' + bg + ';background-size:cover;background-position:center;"></div>' +
        '<div class="lb-cap"><strong>' + title + '</strong><br>' + cap + '</div>';
      open(html);
    });
  });

  closeBtn.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lb.classList.contains('open')) close(); });
})();

/* ---------- Magnetic hover for primary buttons ---------- */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.btn-primary').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.25}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
})();

/* ---------- Konami easter egg 🎉 ---------- */
(function () {
  const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let i = 0;
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === seq[i].toLowerCase()) {
      i++;
      if (i === seq.length) {
        i = 0;
        showToast('🎉 You found the secret! Enjoy the site, friend.');
        document.documentElement.animate(
          [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(360deg)' }],
          { duration: 2000 }
        );
      }
    } else { i = 0; }
  });
})();
