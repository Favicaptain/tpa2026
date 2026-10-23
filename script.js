/* =========================================================
   TPA — page controller
   ========================================================= */
import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import * as data from './data-service.js';
import { DEFAULT_COORDINATORS } from './seed-data.js';

const NIGERIAN_STATES = data.NIGERIAN_STATES;
const NIGERIAN_LGAS   = data.NIGERIAN_LGAS;
const page = document.body.dataset.page;
const ORIGINAL_TITLE = document.title;

/* ---------------------------------------------------------
   Utilities
   --------------------------------------------------------- */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tsToDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    try { return v.toDate(); } catch { return null; }
  }
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00');
    return new Date(v);
  }
  return null;
}

function formatDate(str) {
  if (!str) return '';
  const d = tsToDate(str);
  if (!d || isNaN(d.getTime())) return typeof str === 'string' ? str : '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':       return 'Invalid email or password.';
    case 'auth/invalid-email':        return 'Please enter a valid email address.';
    case 'auth/too-many-requests':    return 'Too many failed attempts. Please try again later.';
    case 'auth/invalid-api-key':      return 'Authentication is not configured correctly.';
    case 'auth/network-request-failed': return 'Network error. Please check your connection and try again.';
    default:                          return (err && err.message) ? err.message : 'Sign in failed.';
  }
}

/* ---------- CSV ---------- */
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCSV(filename, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Scroll reveal ---------- */
function observeFadeUps(root = document) {
  const els = root.querySelectorAll ? root.querySelectorAll('.fade-up:not(.visible)') : [];
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  els.forEach(el => io.observe(el));
}

/* ---------- Blur-up image loader (delegated) ---------- */
function initImageLoader() {
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.closest('.img-blur')) {
      img.classList.add('loaded');
    }
  }, true);
}

/* ---------- Skeletons ---------- */
function skeletonPersonCards(count = 4) {
  return Array.from({ length: count }, () => `
    <article class="skeleton-card">
      <div class="skeleton skeleton-photo"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </article>`).join('');
}

function skeletonNewsCards(count = 3) {
  return Array.from({ length: count }, () => `
    <article class="skeleton-card">
      <div class="skeleton skeleton-line short" style="margin-bottom:16px;"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>
    </article>`).join('');
}

function skeletonTableRows(count = 5) {
  return Array.from({ length: count }, () => `
    <tr>
      <td><div class="skeleton skeleton-line" style="margin:0;"></div></td>
      <td><div class="skeleton skeleton-line" style="margin:0;"></div></td>
      <td><div class="skeleton skeleton-line" style="margin:0;"></div></td>
    </tr>`).join('');
}

/* ---------------------------------------------------------
   Shared init
   --------------------------------------------------------- */
function initNav() {
  const toggle = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach((a) => {
    if (a.dataset.nav === page) a.classList.add('active');
    a.addEventListener('click', () => links.classList.remove('open'));
  });

  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}

function initAnimations() { observeFadeUps(document); }

/* ---------------------------------------------------------
   Home — featured news
   --------------------------------------------------------- */
async function renderHomeNews() {
  const container = document.getElementById('featuredNewsContainer');
  if (!container) return;
  container.innerHTML = skeletonNewsCards(3);
  try {
    const articles = await data.fetchNews(3);
    if (!articles.length) {
      container.innerHTML = '<p class="empty-state">No news articles have been published yet.</p>';
      return;
    }
    container.innerHTML = articles.map((a, i) => newsCardHtml(a, i)).join('');
    observeFadeUps(container);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="empty-state">Could not load news. Please try again later.</p>';
  }
}

function newsCardHtml(a, i = 0) {
  return `
    <article class="news-card fade-up" style="--i:${i}">
      <div class="news-meta">
        <span class="news-date">${escapeHtml(formatDate(a.date))}</span>
        <span class="news-category">${escapeHtml(a.category)}</span>
      </div>
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.snippet)}</p>
      <a class="news-card-link" href="news.html?id=${encodeURIComponent(a.id)}">Read More →</a>
    </article>`;
}

/* ---------------------------------------------------------
   News page
   --------------------------------------------------------- */
async function renderNewsPage() {
  const listView    = document.getElementById('newsListView');
  const list        = document.getElementById('newsList');
  const articleView = document.getElementById('articleView');
  if (!list || !listView || !articleView) return;

  const params = new URLSearchParams(window.location.search);
  const articleId = params.get('id');

  if (articleId) {
    listView.hidden = true;
    articleView.hidden = false;
    articleView.innerHTML = `
      <div class="skeleton skeleton-line short" style="margin-bottom:24px;"></div>
      <div class="skeleton skeleton-line" style="height:36px;width:85%;margin-bottom:12px;"></div>
      <div class="skeleton skeleton-line" style="height:36px;width:60%;margin-bottom:28px;"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line short"></div>`;
    try {
      const article = await data.fetchNewsById(articleId);
      renderArticleView(articleView, article);
    } catch (err) {
      console.error(err);
      articleView.innerHTML = `
        <a href="news.html" class="article-back">← Back to all news</a>
        <p class="empty-state">Could not load this article. Please try again later.</p>
      `;
    }
    return;
  }

  listView.hidden = false;
  articleView.hidden = true;
  document.title = ORIGINAL_TITLE;
  list.innerHTML = skeletonNewsCards(6);

  let articles = [];
  try {
    articles = await data.fetchNews();
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="empty-state">Could not load news. Please try again later.</p>';
    return;
  }
  if (!articles.length) {
    list.innerHTML = '<p class="empty-state">No news articles have been published yet.</p>';
    return;
  }
  list.innerHTML = articles.map((a, i) => `
    <article class="news-card fade-up" style="--i:${i}">
      <div class="news-meta">
        <span class="news-date">${escapeHtml(formatDate(a.date))}</span>
        <span class="news-category">${escapeHtml(a.category)}</span>
      </div>
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.snippet)}</p>
      <a class="news-card-link" href="news.html?id=${encodeURIComponent(a.id)}">Read Full Article →</a>
    </article>
  `).join('');
  observeFadeUps(list);
}

function renderArticleView(container, article) {
  if (!article) {
    container.innerHTML = `
      <a href="news.html" class="article-back">← Back to all news</a>
      <p class="empty-state">This article could not be found. It may have been removed.</p>
    `;
    return;
  }
  const paragraphs = (article.body || '')
    .split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`).join('');
  document.title = `${article.title} — Tinubu Progressive Advocates`;
  container.innerHTML = `
    <a href="news.html" class="article-back">← Back to all news</a>
    <div class="news-meta">
      <span class="news-date">${escapeHtml(formatDate(article.date))}</span>
      <span class="news-category">${escapeHtml(article.category)}</span>
    </div>
    <h1 class="article-title">${escapeHtml(article.title)}</h1>
    <div class="article-body">${paragraphs}</div>
  `;
}

/* ---------------------------------------------------------
   Executives page
   --------------------------------------------------------- */
async function renderLeadership() {
  const slots = [
    { key: 'national_leader', nameId: 'nationalLeaderName', roleId: 'nationalLeaderRole', imgId: 'nationalLeaderPhoto', fallbackId: 'nationalLeaderPhotoFallback' },
    { key: 'custodian',       nameId: 'custodianName',       roleId: 'custodianRole',       imgId: 'custodianPhoto',       fallbackId: 'custodianPhotoFallback' }
  ];

  for (const slot of slots) {
    const nameEl = document.getElementById(slot.nameId);
    const roleEl = document.getElementById(slot.roleId);
    const imgEl  = document.getElementById(slot.imgId);
    const fallbackEl = document.getElementById(slot.fallbackId);
    if (!nameEl || !imgEl) continue;

    try {
      const info = await data.fetchLeadership(slot.key);
      if (!info) continue;
      if (info.name) nameEl.textContent = info.name;
      if (info.role && roleEl) roleEl.textContent = info.role;
      if (info.photoUrl) {
        imgEl.src = data.cloudinaryUrl(info.photoUrl, { width: 360 });
        imgEl.hidden = false;
        if (fallbackEl) fallbackEl.hidden = true;
      } else {
        imgEl.hidden = true;
        imgEl.removeAttribute('src');
        if (fallbackEl) {
          fallbackEl.hidden = false;
          if (info.name) fallbackEl.textContent = getInitials(info.name);
        }
      }
    } catch (err) {
      console.error('Could not load leadership slot', slot.key, err);
    }
  }
}

async function renderPatrons() {
  const grid = document.getElementById('patronsGrid');
  if (!grid) return;
  grid.innerHTML = skeletonPersonCards(3);
  try {
    const list = await data.fetchPatrons();
    if (!list.length) {
      grid.innerHTML = '<p class="empty-state">Patron profiles will appear here once published.</p>';
      return;
    }
    grid.innerHTML = list.map((x, i) => cardHtmlForPerson(x, i)).join('');
    observeFadeUps(grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">Could not load patrons.</p>';
  }
}

async function renderExecutives() {
  const grid = document.getElementById('execGrid');
  if (!grid) return;
  grid.innerHTML = skeletonPersonCards(4);
  try {
    const execos = await data.fetchNationalExecos();
    if (!execos.length) {
      grid.innerHTML = '<p class="empty-state">Executive profiles will appear here once published.</p>';
      return;
    }
    grid.innerHTML = execos.map((x, i) => cardHtmlForPerson(x, i)).join('');
    observeFadeUps(grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">Could not load executive profiles.</p>';
  }
}

async function renderBoardOfTrustees() {
  const grid = document.getElementById('botGrid');
  if (!grid) return;
  grid.innerHTML = skeletonPersonCards(3);
  try {
    const list = await data.fetchBoardOfTrustees();
    if (!list.length) {
      grid.innerHTML = '<p class="empty-state">Board of Trustees profiles will appear here once published.</p>';
      return;
    }
    grid.innerHTML = list.map((x, i) => cardHtmlForPerson(x, i)).join('');
    observeFadeUps(grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">Could not load Board of Trustees.</p>';
  }
}

function cardHtmlForPerson(x, i = 0) {
  const initials = getInitials(x.name);
  const full = x.photoUrl ? data.cloudinaryUrl(x.photoUrl, { width: 400 }) : '';
  const blur = x.photoUrl ? data.cloudinaryLqip(x.photoUrl) : '';
  const useBlur = blur && blur !== x.photoUrl;
  const bgStyle = useBlur ? `style="background-image:url('${escapeHtml(blur)}')"` : '';
  const photo = x.photoUrl
    ? `<div class="exec-photo img-blur" ${bgStyle}>
         <img src="${escapeHtml(full)}"
              alt="${escapeHtml(x.name)}"
              width="400" height="400"
              loading="lazy" decoding="async">
       </div>`
    : `<div class="exec-photo exec-photo-initials">${escapeHtml(initials)}</div>`;
  return `
    <article class="exec-card fade-up" style="--i:${i}">
      ${photo}
      <h3>${escapeHtml(x.name)}</h3>
      <p class="exec-role">${escapeHtml(x.role)}</p>
    </article>`;
}

async function renderCoordinators() {
  const tbody = document.getElementById('coordTbody');
  const wrap = document.getElementById('coordTableWrap');
  const empty = document.getElementById('coordEmpty');
  const search = document.getElementById('coordSearch');
  if (!tbody || !wrap) return;

  wrap.hidden = false;
  if (empty) empty.hidden = true;
  tbody.innerHTML = skeletonTableRows(5);

  let coords = [];
  try {
    coords = await data.fetchStateCoordinators();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '';
    wrap.hidden = true;
    if (empty) { empty.hidden = false; empty.textContent = 'Could not load coordinators.'; }
    return;
  }

  function renderTable(items) {
    if (!items.length) {
      tbody.innerHTML = '';
      wrap.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.textContent = coords.length
          ? 'No coordinators match your search.'
          : 'No coordinators found.';
      }
      return;
    }
    wrap.hidden = false;
    if (empty) empty.hidden = true;
    tbody.innerHTML = items.map(c => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.state)}</td>
        <td>${escapeHtml(c.lga)}</td>
      </tr>
    `).join('');
  }

  renderTable(coords);

  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (!q) { renderTable(coords); return; }
      const filtered = coords.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.lga.toLowerCase().includes(q)
      );
      renderTable(filtered);
    });
  }
}

/* ---------------------------------------------------------
   Membership form (with LGA)
   --------------------------------------------------------- */
async function initMembershipForm() {
  const form = document.getElementById('membershipForm');
  const stateSel = document.getElementById('memberState');
  const lgaSel = document.getElementById('memberLga');
  if (!form || !stateSel || !lgaSel) return;

  if (!stateSel.options.length) {
    stateSel.innerHTML = '<option value="">Select your state…</option>' +
      NIGERIAN_STATES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }

  lgaSel.innerHTML = '<option value="">Select your state first…</option>';
  lgaSel.disabled = true;

  stateSel.addEventListener('change', () => {
    const state = stateSel.value;
    if (!state) {
      lgaSel.innerHTML = '<option value="">Select your state first…</option>';
      lgaSel.disabled = true;
      return;
    }
    const lgas = NIGERIAN_LGAS[state] || [];
    if (!lgas.length) {
      lgaSel.innerHTML = '<option value="">No LGAs available</option>';
      lgaSel.disabled = true;
      return;
    }
    lgaSel.disabled = false;
    lgaSel.innerHTML = '<option value="">Select your LGA…</option>' +
      lgas.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  });

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn ? submitBtn.textContent : 'Submit Registration';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name  = form.querySelector('[name="fullName"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phone = form.querySelector('[name="phone"]').value.trim();
    const state = stateSel.value;
    const lga = lgaSel.value;

    if (!name || !email || !phone || !state || !lga) {
      alert('Please fill in all fields.');
      return;
    }

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
    try {
      await data.createMember({ fullName: name, email, phone, state, lga });
      alert(`Thank you, ${name}! Your registration for ${lga}, ${state} has been received. Your State Coordinator will be in touch to confirm.`);
      form.reset();
      lgaSel.innerHTML = '<option value="">Select your state first…</option>';
      lgaSel.disabled = true;
    } catch (err) {
      console.error(err);
      alert('Sorry — we could not submit your registration right now. Please try again in a moment.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  });
}

/* ---------------------------------------------------------
   Admin panel
   --------------------------------------------------------- */
function initAdmin() {
  const gate = document.getElementById('adminGate');
  const denied = document.getElementById('adminDenied');
  const panel = document.getElementById('adminPanel');
  if (!gate || !denied || !panel) return;

  const gateForm     = document.getElementById('gateForm');
  const gateEmail    = document.getElementById('gateEmail');
  const gatePassword = document.getElementById('gatePassword');
  const gateError    = document.getElementById('gateError');
  const gateBtn      = document.getElementById('gateSignIn');
  const deniedTitle   = document.getElementById('deniedTitle');
  const deniedMessage = document.getElementById('deniedMessage');
  const deniedSignOut = document.getElementById('deniedSignOut');
  const panelEmail    = document.getElementById('panelEmail');
  const panelSignOut  = document.getElementById('panelSignOut');

  const tabs = Array.from(document.querySelectorAll('.admin-tab'));
  const panels = {
    news:         document.getElementById('tabNews'),
    leadership:   document.getElementById('tabLeadership'),
    patrons:      document.getElementById('tabPatrons'),
    execos:       document.getElementById('tabExecos'),
    bot:          document.getElementById('tabBot'),
    coordinators: document.getElementById('tabCoordinators'),
    members:      document.getElementById('tabMembers')
  };

  /* Lazy-load renderers: only render a tab when it is first shown */
  const rendered = { news: false };
  function ensureRendered(key) {
    if (rendered[key]) return;
    rendered[key] = true;
    if (key === 'leadership')        loadLeadershipTab();
    else if (key === 'patrons')      renderAdminPatrons();
    else if (key === 'execos')       renderAdminExecos();
    else if (key === 'bot')          renderAdminBOT();
    else if (key === 'coordinators') renderAdminCoordinators();
    else if (key === 'members')      renderAdminMembers();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.tab;
      tabs.forEach(t => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        el.hidden = k !== key;
      });
      ensureRendered(key);
    });
  });

  if (gateForm) {
    gateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (gateError) gateError.hidden = true;
      gateBtn.disabled = true;
      try {
        const email = gateEmail.value.trim();
        const pw = gatePassword.value;
        if (!email || !pw) throw new Error('Please enter your email and password.');
        await signInWithEmailAndPassword(auth, email, pw);
      } catch (err) {
        console.error(err);
        if (gateError) {
          gateError.textContent = err.code ? friendlyAuthError(err) : err.message;
          gateError.hidden = false;
        }
      } finally {
        gateBtn.disabled = false;
      }
    });
  }

  if (deniedSignOut) deniedSignOut.addEventListener('click', () => signOut(auth));
  if (panelSignOut)  panelSignOut.addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    gate.hidden = true;
    denied.hidden = true;
    panel.hidden = true;
    if (!user) {
      gate.hidden = false;
      gatePassword.value = '';
      return;
    }
    let isAdmin = false;
    let checkFailed = false;
    try {
      isAdmin = await data.checkAdmin(user);
    } catch (err) {
      console.error(err);
      checkFailed = true;
    }
    if (checkFailed) {
      if (deniedTitle)   deniedTitle.textContent = 'Could Not Verify Access';
      if (deniedMessage) deniedMessage.textContent =
        'We could not confirm your administrator privileges. This is usually a temporary network issue — please sign out and try again.';
      denied.hidden = false;
      return;
    }
    if (!isAdmin) {
      if (deniedTitle)   deniedTitle.textContent = 'Access Denied';
      if (deniedMessage) deniedMessage.innerHTML =
        `You are signed in as <strong>${escapeHtml(user.email || '')}</strong>, but this account does not have administrator privileges.`;
      denied.hidden = false;
      return;
    }
    panel.hidden = false;
    if (panelEmail) panelEmail.textContent = user.email || '';

    /* Only the active (news) tab is rendered on sign-in */
    if (!rendered.news) {
      rendered.news = true;
      renderAdminNews();
    }
  });

  /* =============== NEWS TAB =============== */
  const newsForm = document.getElementById('newsForm');
  const newsEditId = document.getElementById('newsEditId');
  const newsTitle = document.getElementById('newsTitle');
  const newsDate = document.getElementById('newsDate');
  const newsCategory = document.getElementById('newsCategory');
  const newsSnippet = document.getElementById('newsSnippet');
  const newsBody = document.getElementById('newsBody');
  const newsSubmit = document.getElementById('newsSubmit');
  const newsCancel = document.getElementById('newsCancel');
  const newsClear = document.getElementById('newsClear');
  const newsSuccess = document.getElementById('newsSuccess');
  const newsError = document.getElementById('newsError');
  const adminNewsList = document.getElementById('adminNewsList');

  if (newsDate) newsDate.value = todayISO();
  let newsCache = [];

  function resetNewsForm() {
    newsForm.reset();
    if (newsDate) newsDate.value = todayISO();
    if (newsEditId) newsEditId.value = '';
    newsSubmit.textContent = 'Publish Article';
    newsCancel.hidden = true;
    if (newsSuccess) newsSuccess.hidden = true;
    if (newsError) newsError.hidden = true;
  }
  if (newsClear) newsClear.addEventListener('click', resetNewsForm);
  if (newsCancel) newsCancel.addEventListener('click', resetNewsForm);

  newsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (newsSuccess) newsSuccess.hidden = true;
    if (newsError) newsError.hidden = true;
    const payload = {
      title: newsTitle.value.trim(),
      date: newsDate.value,
      category: newsCategory.value,
      snippet: newsSnippet.value.trim(),
      body: newsBody.value.trim()
    };
    if (!payload.title || !payload.date || !payload.snippet || !payload.body) {
      showNewsError('All fields are required.');
      return;
    }
    if (payload.snippet.length > 220) {
      showNewsError('Summary must be 220 characters or fewer.');
      return;
    }
    newsSubmit.disabled = true;
    try {
      const id = newsEditId.value;
      if (id) {
        await data.updateNews(id, payload);
        if (newsSuccess) { newsSuccess.textContent = 'Article updated.'; newsSuccess.hidden = false; }
      } else {
        await data.createNews(payload);
        if (newsSuccess) { newsSuccess.textContent = 'Article published.'; newsSuccess.hidden = false; }
      }
      resetNewsForm();
      await renderAdminNews();
    } catch (err) {
      console.error(err);
      showNewsError(err.message || 'Could not save article.');
    } finally {
      newsSubmit.disabled = false;
    }
  });

  function showNewsError(msg) {
    if (!newsError) return;
    newsError.textContent = msg;
    newsError.hidden = false;
  }

  async function renderAdminNews() {
    if (!adminNewsList) return;
    adminNewsList.innerHTML = '<p class="empty-state">Loading…</p>';
    try {
      newsCache = await data.fetchNews();
    } catch (err) {
      console.error(err);
      adminNewsList.innerHTML = '<p class="empty-state">Could not load articles.</p>';
      return;
    }
    if (!newsCache.length) {
      adminNewsList.innerHTML = '<p class="empty-state">No articles yet.</p>';
      return;
    }
    adminNewsList.innerHTML = newsCache.map(a => `
      <div class="admin-list-row" data-id="${escapeHtml(a.id)}">
        <div class="admin-list-main">
          <div>
            <strong>${escapeHtml(a.title)}</strong>
            <span class="admin-list-sub">${escapeHtml(formatDate(a.date))} · ${escapeHtml(a.category)}</span>
          </div>
        </div>
        <div class="admin-list-actions">
          <button class="btn btn-small btn-outline-navy" data-action="edit" data-id="${escapeHtml(a.id)}">Edit</button>
          <button class="btn btn-small btn-danger" data-action="delete" data-id="${escapeHtml(a.id)}">Delete</button>
        </div>
      </div>
    `).join('');

    adminNewsList.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = newsCache.find(x => x.id === btn.dataset.id);
        if (!a) return;
        newsEditId.value = a.id;
        newsTitle.value = a.title;
        newsDate.value = a.date;
        newsCategory.value = a.category;
        newsSnippet.value = a.snippet;
        newsBody.value = a.body;
        newsSubmit.textContent = 'Update Article';
        newsCancel.hidden = false;
        if (newsSuccess) newsSuccess.hidden = true;
        if (newsError) newsError.hidden = true;
        newsForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    adminNewsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this article? This cannot be undone.')) return;
        try {
          await data.deleteNews(btn.dataset.id);
          await renderAdminNews();
        } catch (err) {
          console.error(err);
          alert('Could not delete article: ' + err.message);
        }
      });
    });
  }

  /* =============== PERSON-CARD FACTORY (Patrons, Excos, BOT) =============== */
  function buildPersonAdmin(opts) {
    const {
      formId, editIdId, nameId, roleId, orderId,
      photoId, photoUrlId, previewWrapId, previewId,
      successId, errorId, submitId, cancelId, listId,
      addLabel, editLabel, fetchFn, createFn, updateFn,
      deleteFn, updateOrderFn, emptyText
    } = opts;

    const form        = document.getElementById(formId);
    const editIdEl    = document.getElementById(editIdId);
    const nameEl      = document.getElementById(nameId);
    const roleEl      = document.getElementById(roleId);
    const orderEl     = document.getElementById(orderId);
    const photoEl     = document.getElementById(photoId);
    const photoUrlEl  = document.getElementById(photoUrlId);
    const previewWrap = document.getElementById(previewWrapId);
    const previewEl   = document.getElementById(previewId);
    const successEl   = document.getElementById(successId);
    const errorEl     = document.getElementById(errorId);
    const submitEl    = document.getElementById(submitId);
    const cancelEl    = document.getElementById(cancelId);
    const listEl      = document.getElementById(listId);

    let cache = [];
    let editing = null;

    if (photoUrlEl) {
      photoUrlEl.addEventListener('input', () => {
        const url = photoUrlEl.value.trim();
        if (url) {
          if (previewEl && previewWrap) { previewEl.src = url; previewWrap.hidden = false; }
        } else if (!photoEl || !photoEl.files.length) {
          if (previewWrap) previewWrap.hidden = true;
        }
      });
    }
    if (photoEl) {
      photoEl.addEventListener('change', () => {
        const f = photoEl.files[0];
        if (f && previewEl && previewWrap) {
          const r = new FileReader();
          r.onload = () => { previewEl.src = r.result; previewWrap.hidden = false; };
          r.readAsDataURL(f);
        }
      });
    }

    function reset() {
      form.reset();
      if (editIdEl) editIdEl.value = '';
      editing = null;
      if (previewWrap) previewWrap.hidden = true;
      if (previewEl) previewEl.src = '';
      if (successEl) successEl.hidden = true;
      if (errorEl) errorEl.hidden = true;
      if (submitEl) submitEl.textContent = addLabel;
      if (cancelEl) cancelEl.hidden = true;
    }
    if (cancelEl) cancelEl.addEventListener('click', reset);

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    function startEdit(id) {
      const x = cache.find(item => item.id === id);
      if (!x) return;
      editing = { ...x };
      if (editIdEl) editIdEl.value = x.id;
      if (nameEl) nameEl.value = x.name;
      if (roleEl) roleEl.value = x.role;
      if (orderEl) orderEl.value = x.displayOrder;
      if (photoEl) photoEl.value = '';
      if (photoUrlEl) photoUrlEl.value = x.photoUrl || '';
      if (previewEl && previewWrap) {
        if (x.photoUrl) { previewEl.src = x.photoUrl; previewWrap.hidden = false; }
        else previewWrap.hidden = true;
      }
      if (submitEl) submitEl.textContent = editLabel;
      if (cancelEl) cancelEl.hidden = false;
      if (successEl) successEl.hidden = true;
      if (errorEl) errorEl.hidden = true;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (successEl) successEl.hidden = true;
      if (errorEl) errorEl.hidden = true;
      const name  = nameEl ? nameEl.value.trim() : '';
      const role  = roleEl ? roleEl.value.trim() : '';
      const order = orderEl ? (Number(orderEl.value) || 0) : 0;
      if (!name || !role) { showError('Name and position are required.'); return; }
      const id = editIdEl ? editIdEl.value : '';
      const isEdit = Boolean(id);
      let uploaded = null;
      if (submitEl) submitEl.disabled = true;
      try {
        const file = photoEl && photoEl.files ? photoEl.files[0] : null;
        let photoUrl = null, photoPath = null, photoDeleteToken = null;
        if (file) {
          uploaded = await data.uploadToStorage(file);
          photoUrl = uploaded.url;
          photoPath = uploaded.path;
          photoDeleteToken = uploaded.deleteToken;
        } else {
          const pasted = photoUrlEl ? photoUrlEl.value.trim() : '';
          if (isEdit && editing && pasted && pasted === editing.photoUrl) {
            photoUrl = editing.photoUrl;
            photoPath = editing.photoPath;
            photoDeleteToken = editing.photoDeleteToken;
          } else if (pasted) {
            try { new URL(pasted); }
            catch {
              showError('Please enter a valid image URL.');
              return;
            }
            photoUrl = pasted;
          }
        }
        try {
          const payload = { name, role, photoUrl, photoPath, photoDeleteToken, displayOrder: order };
          if (isEdit) await updateFn(id, payload);
          else         await createFn(payload);
        } catch (writeErr) {
          if (uploaded && uploaded.path && uploaded.deleteToken) {
            try { await data.deleteStorageFile(uploaded.path, uploaded.deleteToken); }
            catch (e) { console.warn('Rollback failed:', e); }
          }
          throw writeErr;
        }
        if (isEdit && editing && editing.photoPath && editing.photoDeleteToken &&
            editing.photoPath !== photoPath) {
          try { await data.deleteStorageFile(editing.photoPath, editing.photoDeleteToken); }
          catch (e) { console.warn('Old photo cleanup failed:', e); }
        }
        reset();
        if (successEl) {
          successEl.textContent = isEdit ? 'Updated.' : 'Added.';
          successEl.hidden = false;
        }
        await renderList();
      } catch (err) {
        console.error(err);
        showError(err.message || 'Could not save.');
      } finally {
        if (submitEl) submitEl.disabled = false;
      }
    });

    async function moveItem(id, direction) {
      const idx = cache.findIndex(x => x.id === id);
      if (idx < 0) return;
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= cache.length) return;
      const reordered = [...cache];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      try {
        await Promise.all(reordered.map((item, i) => updateOrderFn(item.id, i)));
        await renderList();
      } catch (err) {
        console.error(err);
        alert('Could not reorder: ' + err.message);
      }
    }

    async function renderList() {
      if (!listEl) return;
      listEl.innerHTML = '<p class="empty-state">Loading…</p>';
      try { cache = await fetchFn(); }
      catch (err) {
        console.error(err);
        listEl.innerHTML = '<p class="empty-state">Could not load list.</p>';
        return;
      }
      if (!cache.length) {
        listEl.innerHTML = `<p class="empty-state">${emptyText}</p>`;
        return;
      }
      const total = cache.length;
      listEl.innerHTML = cache.map((x, i) => {
        const isFirst = i === 0;
        const isLast = i === total - 1;
        const thumbUrl = x.photoUrl ? data.cloudinaryUrl(x.photoUrl, { width: 88 }) : '';
        const thumb = x.photoUrl
          ? `<img class="admin-thumb" src="${escapeHtml(thumbUrl)}" alt="" width="44" height="44" loading="lazy">`
          : `<span class="admin-thumb admin-thumb-initials">${escapeHtml(getInitials(x.name))}</span>`;
        return `
          <div class="admin-list-row">
            <div class="admin-list-main">
              ${thumb}
              <div>
                <strong>${escapeHtml(x.name)}</strong>
                <span class="admin-list-sub">${escapeHtml(x.role)}</span>
              </div>
            </div>
            <div class="admin-list-actions">
              <button class="btn btn-small btn-ghost" data-action="up" data-id="${escapeHtml(x.id)}" title="Move up" ${isFirst ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-up"></i>
              </button>
              <button class="btn btn-small btn-ghost" data-action="down" data-id="${escapeHtml(x.id)}" title="Move down" ${isLast ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-down"></i>
              </button>
              <button class="btn btn-small btn-outline-navy" data-action="edit" data-id="${escapeHtml(x.id)}">Edit</button>
              <button class="btn btn-small btn-danger" data-action="delete" data-id="${escapeHtml(x.id)}">Delete</button>
            </div>
          </div>`;
      }).join('');

      listEl.querySelectorAll('[data-action="up"]').forEach(b => b.addEventListener('click', () => moveItem(b.dataset.id, -1)));
      listEl.querySelectorAll('[data-action="down"]').forEach(b => b.addEventListener('click', () => moveItem(b.dataset.id, 1)));
      listEl.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => startEdit(b.dataset.id)));
      listEl.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete this entry?')) return;
        try {
          await deleteFn(b.dataset.id);
          if (editing && editing.id === b.dataset.id) reset();
          await renderList();
        } catch (err) {
          console.error(err);
          alert('Could not delete: ' + err.message);
        }
      }));
    }

    return { render: renderList };
  }

  /* =============== LEADERSHIP TAB =============== */
  const LEADERSHIP_SLOTS = [
    { key: 'national_leader', prefix: 'nl' },
    { key: 'custodian',       prefix: 'cust' }
  ];

  function initLeadershipTab() {
    LEADERSHIP_SLOTS.forEach(slot => {
      const formEl      = document.getElementById(slot.prefix + 'Form');
      const nameEl      = document.getElementById(slot.prefix + 'Name');
      const roleEl      = document.getElementById(slot.prefix + 'Role');
      const photoEl     = document.getElementById(slot.prefix + 'Photo');
      const photoUrlEl  = document.getElementById(slot.prefix + 'PhotoUrl');
      const previewWrap = document.getElementById(slot.prefix + 'PreviewWrap');
      const previewEl   = document.getElementById(slot.prefix + 'Preview');
      const successEl   = document.getElementById(slot.prefix + 'Success');
      const errorEl     = document.getElementById(slot.prefix + 'Error');
      const submitEl    = document.getElementById(slot.prefix + 'Submit');

      if (!formEl) return;

      if (photoUrlEl) {
        photoUrlEl.addEventListener('input', () => {
          const url = photoUrlEl.value.trim();
          if (url && previewEl && previewWrap) {
            previewEl.src = url; previewWrap.hidden = false;
          } else if ((!photoEl || !photoEl.files.length) && previewWrap) {
            previewWrap.hidden = true;
          }
        });
      }
      if (photoEl) {
        photoEl.addEventListener('change', () => {
          const f = photoEl.files[0];
          if (f && previewEl && previewWrap) {
            const r = new FileReader();
            r.onload = () => { previewEl.src = r.result; previewWrap.hidden = false; };
            r.readAsDataURL(f);
          }
        });
      }

      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (successEl) successEl.hidden = true;
        if (errorEl) errorEl.hidden = true;
        const name = nameEl ? nameEl.value.trim() : '';
        const role = roleEl ? roleEl.value.trim() : '';
        if (!name) {
          if (errorEl) { errorEl.textContent = 'Name is required.'; errorEl.hidden = false; }
          return;
        }
        if (submitEl) submitEl.disabled = true;
        let uploaded = null;
        try {
          let current = null;
          try { current = await data.fetchLeadership(slot.key); } catch { /* none yet */ }

          let photoUrl = current ? current.photoUrl : null;
          let photoPath = current ? current.photoPath : null;
          let photoDeleteToken = current ? current.photoDeleteToken : null;

          const file = photoEl && photoEl.files ? photoEl.files[0] : null;
          if (file) {
            uploaded = await data.uploadToStorage(file);
            photoUrl = uploaded.url;
            photoPath = uploaded.path;
            photoDeleteToken = uploaded.deleteToken;
          } else {
            const pasted = photoUrlEl ? photoUrlEl.value.trim() : '';
            const currentUrl = current ? (current.photoUrl || '') : '';
            if (pasted !== currentUrl) {
              if (pasted) {
                try { new URL(pasted); }
                catch {
                  if (errorEl) { errorEl.textContent = 'Please enter a valid image URL.'; errorEl.hidden = false; }
                  return;
                }
                photoUrl = pasted;
                photoPath = null;
                photoDeleteToken = null;
              } else {
                photoUrl = null;
                photoPath = null;
                photoDeleteToken = null;
              }
            }
          }

          try {
            await data.updateLeadership(slot.key, { name, role, photoUrl, photoPath, photoDeleteToken });
          } catch (writeErr) {
            if (uploaded && uploaded.path && uploaded.deleteToken) {
              try { await data.deleteStorageFile(uploaded.path, uploaded.deleteToken); }
              catch (e) { console.warn('Leadership rollback failed:', e); }
            }
            throw writeErr;
          }
          if (current && current.photoPath && current.photoDeleteToken &&
              current.photoPath !== photoPath) {
            try { await data.deleteStorageFile(current.photoPath, current.photoDeleteToken); }
            catch (e) { console.warn('Old leadership photo cleanup failed:', e); }
          }
          if (successEl) { successEl.textContent = 'Saved.'; successEl.hidden = false; }
        } catch (err) {
          console.error(err);
          if (errorEl) { errorEl.textContent = err.message || 'Could not save.'; errorEl.hidden = false; }
        } finally {
          if (submitEl) submitEl.disabled = false;
        }
      });
    });
  }

  async function loadLeadershipTab() {
    for (const slot of LEADERSHIP_SLOTS) {
      try {
        const current = await data.fetchLeadership(slot.key);
        if (!current) continue;
        const nameEl      = document.getElementById(slot.prefix + 'Name');
        const roleEl      = document.getElementById(slot.prefix + 'Role');
        const photoUrlEl  = document.getElementById(slot.prefix + 'PhotoUrl');
        const previewWrap = document.getElementById(slot.prefix + 'PreviewWrap');
        const previewEl   = document.getElementById(slot.prefix + 'Preview');
        if (nameEl && current.name) nameEl.value = current.name;
        if (roleEl && current.role) roleEl.value = current.role;
        if (photoUrlEl && current.photoUrl) photoUrlEl.value = current.photoUrl;
        if (current.photoUrl && previewEl && previewWrap) {
          previewEl.src = current.photoUrl;
          previewWrap.hidden = false;
        }
      } catch (err) {
        console.error('Could not load leadership slot', slot.key, err);
      }
    }
  }

  /* =============== PATRONS TAB =============== */
  const patronAdmin = buildPersonAdmin({
    formId: 'patronForm', editIdId: 'patronEditId', nameId: 'patronName', roleId: 'patronRole',
    orderId: 'patronOrder', photoId: 'patronPhoto', photoUrlId: 'patronPhotoUrl',
    previewWrapId: 'patronPreviewWrap', previewId: 'patronPreview',
    successId: 'patronSuccess', errorId: 'patronError', submitId: 'patronSubmit',
    cancelId: 'patronCancel', listId: 'adminPatronList',
    addLabel: 'Add Patron', editLabel: 'Update Patron',
    fetchFn: data.fetchPatrons,
    createFn: data.createPatron,
    updateFn: data.updatePatron,
    deleteFn: data.deletePatron,
    updateOrderFn: data.updatePatronOrder,
    emptyText: 'No patrons yet.'
  });
  const renderAdminPatrons = patronAdmin.render;

  /* =============== EXECOS TAB =============== */
  const execoAdmin = buildPersonAdmin({
    formId: 'execoForm', editIdId: 'execoEditId', nameId: 'execoName', roleId: 'execoRole',
    orderId: 'execoOrder', photoId: 'execoPhoto', photoUrlId: 'execoPhotoUrl',
    previewWrapId: 'execoPreviewWrap', previewId: 'execoPreview',
    successId: 'execoSuccess', errorId: 'execoError', submitId: 'execoSubmit',
    cancelId: 'execoCancel', listId: 'adminExecoList',
    addLabel: 'Add Executive', editLabel: 'Update Executive',
    fetchFn: data.fetchNationalExecos,
    createFn: data.createExeco,
    updateFn: data.updateExeco,
    deleteFn: data.deleteExeco,
    updateOrderFn: data.updateExecoOrder,
    emptyText: 'No executives yet.'
  });
  const renderAdminExecos = execoAdmin.render;

  /* =============== BOT TAB =============== */
  const botAdmin = buildPersonAdmin({
    formId: 'botForm', editIdId: 'botEditId', nameId: 'botName', roleId: 'botRole',
    orderId: 'botOrder', photoId: 'botPhoto', photoUrlId: 'botPhotoUrl',
    previewWrapId: 'botPreviewWrap', previewId: 'botPreview',
    successId: 'botSuccess', errorId: 'botError', submitId: 'botSubmit',
    cancelId: 'botCancel', listId: 'adminBotList',
    addLabel: 'Add Trustee', editLabel: 'Update Trustee',
    fetchFn: data.fetchBoardOfTrustees,
    createFn: data.createTrustee,
    updateFn: data.updateTrustee,
    deleteFn: data.deleteTrustee,
    updateOrderFn: data.updateTrusteeOrder,
    emptyText: 'No trustees yet.'
  });
  const renderAdminBOT = botAdmin.render;

  /* =============== COORDINATORS TAB =============== */
  const coordForm = document.getElementById('coordForm');
  const coordName = document.getElementById('coordName');
  const coordState = document.getElementById('coordState');
  const coordLga = document.getElementById('coordLga');
  const coordSuccess = document.getElementById('coordSuccess');
  const coordError = document.getElementById('coordError');
  const coordSubmit = document.getElementById('coordSubmit');
  const coordSeed = document.getElementById('coordSeed');
  const adminCoordList = document.getElementById('adminCoordList');

  if (coordState) {
    coordState.innerHTML = '<option value="">Select state…</option>' +
      NIGERIAN_STATES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }

  function resetCoordForm() {
    coordForm.reset();
    if (coordSuccess) coordSuccess.hidden = true;
    if (coordError) coordError.hidden = true;
  }

  coordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (coordSuccess) coordSuccess.hidden = true;
    if (coordError) coordError.hidden = true;
    const name = coordName.value.trim();
    const state = coordState.value;
    const lga = coordLga.value.trim();
    if (!name || !state || !lga) {
      showCoordError('Name, state, and LGA are all required.');
      return;
    }
    coordSubmit.disabled = true;
    try {
      await data.createCoordinator({ name, state, lga });
      resetCoordForm();
      if (coordSuccess) { coordSuccess.textContent = 'Coordinator added.'; coordSuccess.hidden = false; }
      await renderAdminCoordinators();
    } catch (err) {
      console.error(err);
      showCoordError(err.message || 'Could not add coordinator.');
    } finally {
      coordSubmit.disabled = false;
    }
  });

  if (coordSeed) {
    coordSeed.addEventListener('click', async () => {
      if (!confirm(`Import ${DEFAULT_COORDINATORS.length} default coordinators? Duplicates (same name + state) will be skipped.`)) return;
      coordSeed.disabled = true;
      coordSeed.textContent = 'Importing…';
      if (coordSuccess) coordSuccess.hidden = true;
      if (coordError) coordError.hidden = true;
      try {
        const summary = await data.seedCoordinators(DEFAULT_COORDINATORS);
        if (coordSuccess) {
          const parts = [`Added ${summary.added}`, `skipped ${summary.skipped} (already exist)`];
          if (summary.errors.length) parts.push(`${summary.errors.length} errors`);
          coordSuccess.textContent = `Import complete — ${parts.join(', ')}.`;
          coordSuccess.hidden = false;
        }
        await renderAdminCoordinators();
      } catch (err) {
        console.error(err);
        if (coordError) {
          coordError.textContent = 'Import failed: ' + (err.message || err);
          coordError.hidden = false;
        }
      } finally {
        coordSeed.disabled = false;
        coordSeed.textContent = 'Import Default Coordinators';
      }
    });
  }

  function showCoordError(msg) {
    if (!coordError) return;
    coordError.textContent = msg;
    coordError.hidden = false;
  }

  async function renderAdminCoordinators() {
    if (!adminCoordList) return;
    adminCoordList.innerHTML = '<p class="empty-state">Loading…</p>';
    let items = [];
    try {
      items = await data.fetchStateCoordinators();
    } catch (err) {
      console.error(err);
      adminCoordList.innerHTML = '<p class="empty-state">Could not load coordinators.</p>';
      return;
    }
    if (!items.length) {
      adminCoordList.innerHTML = '<p class="empty-state">No coordinators yet.</p>';
      return;
    }
    adminCoordList.innerHTML = items.map(c => `
      <div class="admin-list-row">
        <div class="admin-list-main">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            <span class="admin-list-sub">${escapeHtml(c.state)} · ${escapeHtml(c.lga)}</span>
          </div>
        </div>
        <div class="admin-list-actions">
          <button class="btn btn-small btn-danger" data-coord-id="${escapeHtml(c.id)}">Delete</button>
        </div>
      </div>
    `).join('');

    adminCoordList.querySelectorAll('[data-coord-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this coordinator?')) return;
        try {
          await data.deleteCoordinator(btn.dataset.coordId);
          await renderAdminCoordinators();
        } catch (err) {
          console.error(err);
          alert('Could not delete coordinator: ' + err.message);
        }
      });
    });
  }

  /* =============== MEMBERS TAB =============== */
  const adminMembersList = document.getElementById('adminMembersList');
  const membersCount = document.getElementById('membersCount');
  const membersSearch = document.getElementById('membersSearch');
  const membersDownloadCsv = document.getElementById('membersDownloadCsv');

  let membersCache = [];
  let membersView = [];

  function renderMembersRows(items) {
    membersView = items;
    if (!adminMembersList) return;
    if (membersCount) membersCount.textContent = String(items.length);
    if (!items.length) {
      adminMembersList.innerHTML = '<p class="empty-state">No registrations yet.</p>';
      return;
    }
    adminMembersList.innerHTML = items.map(m => {
      const d = tsToDate(m.createdAt);
      const createdStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-GB') : '';
      const lgaStr = m.lga ? escapeHtml(m.lga) : '—';
      return `
        <div class="admin-list-row">
          <div class="admin-list-main">
            <div>
              <strong>${escapeHtml(m.fullName)}</strong>
              <span class="admin-list-sub">${escapeHtml(m.email)} · ${escapeHtml(m.phone)}</span>
              <span class="admin-list-sub">${escapeHtml(m.state)} · ${lgaStr} · <em>${escapeHtml(m.status)}</em>${createdStr ? ' · ' + escapeHtml(createdStr) : ''}</span>
            </div>
          </div>
          <div class="admin-list-actions">
            ${m.status !== 'confirmed'
              ? `<button class="btn btn-small btn-outline-navy" data-action="confirm" data-id="${escapeHtml(m.id)}">Confirm</button>`
              : ''}
            <button class="btn btn-small btn-danger" data-action="delete" data-id="${escapeHtml(m.id)}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    adminMembersList.querySelectorAll('[data-action="confirm"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await data.updateMemberStatus(btn.dataset.id, 'confirmed');
          await renderAdminMembers();
        } catch (err) {
          console.error(err);
          alert('Could not update status: ' + err.message);
        }
      });
    });
    adminMembersList.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this registration? This cannot be undone.')) return;
        try {
          await data.deleteMember(btn.dataset.id);
          await renderAdminMembers();
        } catch (err) {
          console.error(err);
          alert('Could not delete: ' + err.message);
        }
      });
    });
  }

  async function renderAdminMembers() {
    if (!adminMembersList) return;
    adminMembersList.innerHTML = '<p class="empty-state">Loading…</p>';
    try {
      membersCache = await data.fetchMembers();
    } catch (err) {
      console.error(err);
      adminMembersList.innerHTML = '<p class="empty-state">Could not load members.</p>';
      return;
    }
    renderMembersRows(membersCache);
  }

  if (membersSearch) {
    membersSearch.addEventListener('input', () => {
      const q = membersSearch.value.trim().toLowerCase();
      const filtered = membersCache.filter(m =>
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.state.toLowerCase().includes(q) ||
        (m.lga || '').toLowerCase().includes(q)
      );
      renderMembersRows(filtered);
    });
  }

  if (membersDownloadCsv) {
    membersDownloadCsv.addEventListener('click', () => {
      if (!membersView.length) { alert('No registrations to export.'); return; }
      downloadCSV(
        `tpa-members-${todayISO()}.csv`,
        ['Full Name', 'Email', 'Phone', 'State', 'LGA', 'Status', 'Registered'],
        membersView.map(m => {
          const d = tsToDate(m.createdAt);
          return [
            m.fullName, m.email, m.phone, m.state, m.lga || '', m.status,
            d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''
          ];
        })
      );
    });
  }

  initLeadershipTab();
}

/* ---------------------------------------------------------
   Dispatch
   --------------------------------------------------------- */
initImageLoader();

if (page === 'home') {
  initNav(); initAnimations(); initMembershipForm(); renderHomeNews();
} else if (page === 'news') {
  initNav(); initAnimations(); renderNewsPage();
} else if (page === 'executives') {
  initNav(); initAnimations();
  renderLeadership();
  renderPatrons();
  renderBoardOfTrustees();
  renderExecutives();
  renderCoordinators();
} else if (page === 'admin') {
  initNav(); initAdmin();
} else {
  initNav(); initAnimations();
}