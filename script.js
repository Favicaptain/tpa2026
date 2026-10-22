/* =========================================================
   TPA — page controller
   Self-executing module. Reads document.body.dataset.page
   and initialises the right renderer.
   Media uploads go to Cloudinary (unsigned preset); all
   other data persists in Firebase Firestore.
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
const page = document.body.dataset.page;

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

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
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
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/invalid-api-key':
      return 'Authentication is not configured correctly. Check firebase-config.js.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    default:
      return (err && err.message) ? err.message : 'Sign in failed.';
  }
}

/* ---------- CSV export helpers ---------- */

function csvEscape(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCSV(filename, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  // BOM (\uFEFF) so Excel opens UTF-8 (Nigerian names) correctly
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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

/* ---------------------------------------------------------
   Shared init
   --------------------------------------------------------- */

function initNav() {
  const toggle = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  links.querySelectorAll('a').forEach((a) => {
    if (a.dataset.nav === page) a.classList.add('active');
    a.addEventListener('click', () => links.classList.remove('open'));
  });
}

function initAnimations() {
  observeFadeUps(document);
}

/* ---------------------------------------------------------
   Home — featured news (latest 3)
   --------------------------------------------------------- */

async function renderHomeNews() {
  const container = document.getElementById('featuredNewsContainer');
  if (!container) return;
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const articles = await data.fetchNews(3);
    if (!articles.length) {
      container.innerHTML = '<p class="empty-state">No news articles have been published yet.</p>';
      return;
    }
    container.innerHTML = articles.map(newsCardHtml).join('');
    observeFadeUps(container);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="empty-state">Could not load news. Please try again later.</p>';
  }
}

function newsCardHtml(a) {
  return `
    <article class="news-card fade-up">
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
   News page — list mode + single-article mode
   --------------------------------------------------------- */

async function renderNewsPage() {
  const listView    = document.getElementById('newsListView');
  const list        = document.getElementById('newsList');
  const articleView = document.getElementById('articleView');
  if (!list || !listView || !articleView) return;

  const params = new URLSearchParams(window.location.search);
  const articleId = params.get('id');

  /* ---- Single-article mode (news.html?id=xyz) ---- */
  if (articleId) {
    listView.hidden = true;
    articleView.hidden = false;
    articleView.innerHTML = '<p class="empty-state">Loading article…</p>';
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

  /* ---- List mode (news.html) ---- */
  listView.hidden = false;
  articleView.hidden = true;
  list.innerHTML = '<p class="empty-state">Loading…</p>';

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

  list.innerHTML = articles.map(a => `
    <article class="news-card fade-up">
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
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('');
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

async function renderExecutives() {
  const grid = document.getElementById('execGrid');
  if (!grid) return;
  grid.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const execos = await data.fetchNationalExecos();
    if (!execos.length) {
      grid.innerHTML = '<p class="empty-state">Executive profiles will appear here once published.</p>';
      return;
    }
    grid.innerHTML = execos.map(cardHtmlForPerson).join('');
    observeFadeUps(grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">Could not load executive profiles.</p>';
  }
}

async function renderBoardOfTrustees() {
  const grid = document.getElementById('botGrid');
  if (!grid) return;
  grid.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const list = await data.fetchBoardOfTrustees();
    if (!list.length) {
      grid.innerHTML = '<p class="empty-state">Board of Trustees profiles will appear here once published.</p>';
      return;
    }
    grid.innerHTML = list.map(cardHtmlForPerson).join('');
    observeFadeUps(grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="empty-state">Could not load Board of Trustees.</p>';
  }
}

function cardHtmlForPerson(x) {
  const initials = getInitials(x.name);
  const photo = x.photoUrl
    ? `<div class="exec-photo"><img src="${escapeHtml(x.photoUrl)}" alt="${escapeHtml(x.name)}" loading="lazy"></div>`
    : `<div class="exec-photo exec-photo-initials">${escapeHtml(initials)}</div>`;
  return `
    <article class="exec-card fade-up">
      ${photo}
      <h3>${escapeHtml(x.name)}</h3>
      <p class="exec-role">${escapeHtml(x.role)}</p>
    </article>`;
}

async function renderCoordinators() {
  const tbody = document.getElementById('coordTableBody');
  const empty = document.getElementById('coordEmpty');
  const search = document.getElementById('coordSearch');
  if (!tbody) return;

  let coords = [];
  try {
    coords = await data.fetchStateCoordinators();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '';
    if (empty) { empty.hidden = false; empty.textContent = 'Could not load coordinators.'; }
    return;
  }

  function renderRows(items) {
    if (!items.length) {
      tbody.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = 'No coordinators found.'; }
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = items.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.state)}</td>
        <td>${escapeHtml(c.lga)}</td>
      </tr>
    `).join('');
  }

  renderRows(coords);

  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const filtered = coords.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.lga.toLowerCase().includes(q)
      );
      renderRows(filtered);
    });
  }
}

/* ---------------------------------------------------------
   Membership form (home page)
   Writes to Firestore `members` collection.
   --------------------------------------------------------- */

async function initMembershipForm() {
  const form = document.getElementById('membershipForm');
  if (!form) return;

  const stateSel = document.getElementById('memberState');
  if (stateSel && !stateSel.options.length) {
    stateSel.innerHTML = '<option value="">Select your state…</option>' +
      NIGERIAN_STATES.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn ? submitBtn.textContent : 'Submit Registration';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name  = form.querySelector('[name="fullName"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const phone = form.querySelector('[name="phone"]').value.trim();
    const state = stateSel.value;

    if (!name || !email || !phone || !state) {
      alert('Please fill in all fields.');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
    }
    try {
      await data.createMember({ fullName: name, email, phone, state });
      alert(`Thank you, ${name}! Your registration for ${state} has been received. Your State Coordinator will be in touch to confirm.`);
      form.reset();
    } catch (err) {
      console.error(err);
      alert('Sorry — we could not submit your registration right now. Please try again in a moment.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
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

  const gateEmail = document.getElementById('gateEmail');
  const gatePassword = document.getElementById('gatePassword');
  const gateError = document.getElementById('gateError');
  const gateBtn = document.getElementById('gateSignIn');
  const deniedEmail = document.getElementById('deniedEmail');
  const deniedSignOut = document.getElementById('deniedSignOut');
  const panelEmail = document.getElementById('panelEmail');
  const panelSignOut = document.getElementById('panelSignOut');

  /* --- Tabs --- */
  const tabs = Array.from(document.querySelectorAll('.admin-tab'));
  const panels = {
    news:         document.getElementById('tabNews'),
    execos:       document.getElementById('tabExecos'),
    bot:          document.getElementById('tabBot'),
    coordinators: document.getElementById('tabCoordinators'),
    members:      document.getElementById('tabMembers')
  };
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
    });
  });

  /* --- Sign-in --- */
  gateBtn.addEventListener('click', async () => {
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

  deniedSignOut.addEventListener('click', () => signOut(auth));
  panelSignOut.addEventListener('click', () => signOut(auth));

  /* --- Auth state --- */
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
    try {
      isAdmin = await data.checkAdmin(user);
    } catch (err) {
      console.error(err);
    }
    if (!isAdmin) {
      deniedEmail.textContent = user.email || '';
      denied.hidden = false;
      return;
    }
    panel.hidden = false;
    panelEmail.textContent = user.email || '';
    await Promise.all([
      renderAdminNews(),
      renderAdminExecos(),
      renderAdminBOT(),
      renderAdminCoordinators(),
      renderAdminMembers()
    ]);
  });

  /* =========================================================
     NEWS TAB
     ========================================================= */
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

  /* =========================================================
     Shared "person card admin" factory
     Used by National Excos and Board of Trustees — identical
     shape, identical UX. Provides add / edit / reorder / delete
     with photo upload.
     ========================================================= */
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
          previewEl.src = url;
          previewWrap.hidden = false;
        } else if (!photoEl.files.length) {
          previewWrap.hidden = true;
        }
      });
    }
    if (photoEl) {
      photoEl.addEventListener('change', () => {
        const f = photoEl.files[0];
        if (f) {
          const r = new FileReader();
          r.onload = () => {
            previewEl.src = r.result;
            previewWrap.hidden = false;
          };
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
      editIdEl.value = x.id;
      nameEl.value = x.name;
      roleEl.value = x.role;
      orderEl.value = x.displayOrder;
      photoEl.value = '';
      photoUrlEl.value = x.photoUrl || '';
      if (x.photoUrl) { previewEl.src = x.photoUrl; previewWrap.hidden = false; }
      else previewWrap.hidden = true;
      submitEl.textContent = editLabel;
      cancelEl.hidden = false;
      if (successEl) successEl.hidden = true;
      if (errorEl) errorEl.hidden = true;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (successEl) successEl.hidden = true;
      if (errorEl) errorEl.hidden = true;

      const name  = nameEl.value.trim();
      const role  = roleEl.value.trim();
      const order = Number(orderEl.value) || 0;
      if (!name || !role) { showError('Name and position are required.'); return; }

      const id = editIdEl.value;
      const isEdit = Boolean(id);

      let uploaded = null;
      submitEl.disabled = true;
      try {
        const file = photoEl.files[0];
        let photoUrl = null, photoPath = null, photoDeleteToken = null;

        if (file) {
          uploaded = await data.uploadToStorage(file);
          photoUrl = uploaded.url;
          photoPath = uploaded.path;
          photoDeleteToken = uploaded.deleteToken;
        } else {
          const pasted = photoUrlEl.value.trim();
          if (isEdit && editing && pasted && pasted === editing.photoUrl) {
            photoUrl = editing.photoUrl;
            photoPath = editing.photoPath;
            photoDeleteToken = editing.photoDeleteToken;
          } else if (pasted) {
            photoUrl = pasted;
          }
        }

        try {
          const payload = { name, role, photoUrl, photoPath, photoDeleteToken, displayOrder: order };
          if (isEdit) await updateFn(id, payload);
          else         await createFn(payload);
        } catch (writeErr) {
          if (uploaded && uploaded.path && uploaded.deleteToken) {
            await data.deleteStorageFile(uploaded.path, uploaded.deleteToken);
          }
          throw writeErr;
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
        submitEl.disabled = false;
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
      try {
        cache = await fetchFn();
      } catch (err) {
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
        const thumb = x.photoUrl
          ? `<img class="admin-thumb" src="${escapeHtml(x.photoUrl)}" alt="">`
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

  /* =========================================================
     EXECOS TAB
     ========================================================= */
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

  /* =========================================================
     BOARD OF TRUSTEES TAB
     ========================================================= */
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

  /* =========================================================
     COORDINATORS TAB
     ========================================================= */
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

  /* =========================================================
     MEMBERS TAB
     ========================================================= */
  const adminMembersList = document.getElementById('adminMembersList');
  const membersCount = document.getElementById('membersCount');
  const membersSearch = document.getElementById('membersSearch');
  const membersDownloadCsv = document.getElementById('membersDownloadCsv');

  let membersCache = [];
  let membersView = [];   // tracks what is currently visible (respects search)

  function renderMembersRows(items) {
    membersView = items;
    if (!adminMembersList) return;
    if (membersCount) membersCount.textContent = String(items.length);
    if (!items.length) {
      adminMembersList.innerHTML = '<p class="empty-state">No registrations yet.</p>';
      return;
    }
    adminMembersList.innerHTML = items.map(m => `
      <div class="admin-list-row">
        <div class="admin-list-main">
          <div>
            <strong>${escapeHtml(m.fullName)}</strong>
            <span class="admin-list-sub">${escapeHtml(m.email)} · ${escapeHtml(m.phone)}</span>
            <span class="admin-list-sub">${escapeHtml(m.state)} · <em>${escapeHtml(m.status)}</em>${m.createdAt ? ' · ' + escapeHtml(new Date(m.createdAt).toLocaleDateString('en-GB')) : ''}</span>
          </div>
        </div>
        <div class="admin-list-actions">
          ${m.status !== 'confirmed'
            ? `<button class="btn btn-small btn-outline-navy" data-action="confirm" data-id="${escapeHtml(m.id)}">Confirm</button>`
            : ''}
          <button class="btn btn-small btn-danger" data-action="delete" data-id="${escapeHtml(m.id)}">Delete</button>
        </div>
      </div>
    `).join('');

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
        m.state.toLowerCase().includes(q)
      );
      renderMembersRows(filtered);
    });
  }

  if (membersDownloadCsv) {
    membersDownloadCsv.addEventListener('click', () => {
      if (!membersView.length) {
        alert('No registrations to export.');
        return;
      }
      downloadCSV(
        `tpa-members-${todayISO()}.csv`,
        ['Full Name', 'Email', 'Phone', 'State', 'Status', 'Registered'],
        membersView.map(m => [
          m.fullName,
          m.email,
          m.phone,
          m.state,
          m.status,
          m.createdAt ? new Date(m.createdAt).toISOString().slice(0, 10) : ''
        ])
      );
    });
  }
}

/* ---------------------------------------------------------
   Dispatch
   --------------------------------------------------------- */

if (page === 'home') {
  initNav(); initAnimations(); initMembershipForm(); renderHomeNews();
} else if (page === 'news') {
  initNav(); initAnimations(); renderNewsPage();
} else if (page === 'executives') {
  initNav(); initAnimations();
  renderExecutives();
  renderBoardOfTrustees();
  renderCoordinators();
} else if (page === 'admin') {
  initNav(); initAdmin();
} else {
  initNav(); initAnimations();
}