/* Undertow 1.1 — personal feelings check-in app. Data stays on this device. */
(() => {
'use strict';
const VERSION = '1.1';
const VERSION_DATE = 'Nov 10, 2026';
const KEY = 'undertow.v1';
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view'), sheet = $('#sheet');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const QCOL = { hu: 'var(--hu)', hp: 'var(--hp)', lu: 'var(--lu)', lp: 'var(--lp)' };
const QORDER = ['hu', 'hp', 'lu', 'lp'];
const MAX_FEEL = 3;
const STRENGTH = ['a little', 'somewhat', 'moderately', 'strongly', 'very'];
const BACKUP_DAYS = 14;

/* ---------- storage: localStorage plus an IndexedDB second copy ---------- */
const blank = () => ({
  entries: [], toolUses: [], customTools: [], customTags: { people: [], places: [], doing: [] }, hiddenTags: [],
  settings: { theme: 'auto', mode: 'grid', arabic: 'sh', faith: true, reminders: ['09:00', '20:00'] },
  seenTour: false, savedAt: null, lastBackupAt: null, installNoticeAt: null, backupSnoozeAt: null,
});
let state = blank();
let idb = null;
function idbOpen() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('undertow', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { idb = r.result; res(idb); };
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
function idbPut(v) { try { if (idb) idb.transaction('kv', 'readwrite').objectStore('kv').put(v, KEY); } catch {} }
function idbGet() {
  return new Promise(res => {
    try { if (!idb) return res(null); const q = idb.transaction('kv').objectStore('kv').get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }
    catch { res(null); }
  });
}
function merge(s) {
  const b = blank();
  return { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) }, customTags: { ...b.customTags, ...(s.customTags || {}) } };
}
let readOk = true;
function save() {
  if (!readOk) return; // never write over a list we couldn't read
  state.savedAt = new Date().toISOString();
  const txt = JSON.stringify(state);
  try { localStorage.setItem(KEY, txt); } catch {}
  idbPut(txt);
}
async function load() {
  await idbOpen();
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch {}
  let parsed = null;
  if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = null; } }
  if (!parsed) {
    const copy = await idbGet();
    if (copy) { try { parsed = JSON.parse(copy); if (raw) toastLater('Recovered your check-ins from the second copy.'); } catch {} }
    else if (raw) { readOk = false; toastLater('Your saved check-ins could not be read. Nothing was changed; restore a backup in More.'); }
  }
  if (parsed) state = merge(parsed);
}
let pendingToast = null;
function toastLater(m) { pendingToast = m; }

/* ---------- helpers ---------- */
const fmtTime = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = d => new Date(d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const isToday = d => dayKey(d) === dayKey(new Date());
const domQ = e => ((e.feelings || []).slice().sort((a, b) => b.i - a.i)[0] || {}).q;
const isCheckin = e => !!(e.feelings && e.feelings.length); // tool notes have no feelings
const daysSince = iso => iso ? (Date.now() - new Date(iso)) / 864e5 : Infinity;
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let storagePersisted = false;
const unpleasant = q => q === 'hu' || q === 'lu';
function arOf(f) {
  const a = state.settings.arabic;
  if (a === 'off') return '';
  if (f.src === 'wheel') return f.fu || '';
  if (a === 'fu') return f.fu || '';
  if (a === 'both') return f.sh === f.fu ? f.sh : `${f.sh} · ${f.fu}`;
  return f.sh || '';
}
function toast(msg, action, fn) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { fn(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}
function tagsFor(group) {
  return [...TAG_GROUPS[group], ...state.customTags[group]].filter(t => !state.hiddenTags.includes(group + ':' + t));
}
function allTools() {
  return [...TOOLS, ...state.customTools].filter(t => state.settings.faith || !t.optional);
}
function toolStats(id) {
  const u = state.toolUses.filter(x => x.id === id && x.result != null);
  const helped = u.filter(x => x.result > 0).length;
  return { n: u.length, helped, avg: u.length ? u.reduce((s, x) => s + x.result, 0) / u.length : 0 };
}
function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ar';
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('ar')); if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { toast('This browser has no Arabic voice.'); }
}

/* ---------- grid geometry ---------- */
const CORNER = { hu: [0, 0], hp: [0, 3], lu: [3, 0], lp: [3, 3] };
function gridCells(q) {
  const [cr, cc] = CORNER[q];
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push({ r, c, d: Math.abs(r - cr) + Math.abs(c - cc) });
  const order = cells.slice().sort((a, b) => a.d - b.d || Math.abs(a.r - cr) - Math.abs(b.r - cr));
  order.forEach((cell, k) => { cell.k = k; });
  const map = {};
  order.forEach(cell => {
    const w = GRID[q][cell.k];
    const xd = (q === 'hu' || q === 'lu') ? 4 - cell.c : cell.c + 1;
    const yd = (q === 'hu' || q === 'hp') ? 4 - cell.r : cell.r + 1;
    map[cell.r + ',' + cell.c] = { w: w[0], sh: w[1], fu: w[2], tr: w[3], q, d: cell.d, p: QUADS[q].p * xd / 2, e: QUADS[q].e * yd / 2 };
  });
  return map;
}
const GRIDMAP = Object.fromEntries(QORDER.map(q => [q, gridCells(q)]));
function wheelWord(pi, level) {
  const pet = WHEEL[pi], w = pet.words[level];
  const p = pet.p[level], e = pet.e[level];
  return { w: w[0], fu: w[1], tr: w[2], src: 'wheel', petal: pet.id, level, p, e, q: (e >= 0 ? 'h' : 'l') + (p >= 0 ? 'p' : 'u') };
}
function dyadWord(i) {
  const d = DYADS[i];
  return { w: d[0], fu: d[1], tr: d[2], src: 'wheel', dyad: i, p: d[3], e: d[4], q: (d[4] >= 0 ? 'h' : 'l') + (d[3] >= 0 ? 'p' : 'u') };
}

/* ---------- tabs ---------- */
let tab = 'today';
const TITLES = { today: 'Today', journal: 'Journal', patterns: 'Patterns', tools: 'Tools', more: 'More' };
function go(t) {
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#title').textContent = TITLES[t];
  render();
  window.scrollTo(0, 0);
}
function render() {
  ({ today: renderToday, journal: renderJournal, patterns: renderPatterns, tools: renderTools, more: renderMore })[tab]();
}

/* ---------- Today ---------- */
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still up. How are you, really?';
  if (h < 12) return 'Morning. What\'s here right now?';
  if (h < 17) return 'Afternoon. How are you doing?';
  if (h < 22) return 'Evening. What\'s moving under the surface?';
  return 'Late. How are you, really?';
}
function entryRow(e) {
  const q = domQ(e);
  const words = isCheckin(e)
    ? e.feelings.map(f => `${esc(f.w)}${arOf(f) ? `<span class="ar" lang="ar" dir="rtl">${esc(arOf(f))}</span>` : ''}`).join(', ')
    : `Note from ${esc(e.toolName || 'a tool')}`;
  const meta = [...(e.body || []).map(b => (BODY.find(x => x[0] === b) || [b, b])[1].toLowerCase()), ...(e.tags || [])].slice(0, 6).join(' · ');
  return `<button class="entry" data-act="open-entry" data-id="${esc(e.id)}">
    <span class="bar" style="background:${QCOL[q] || 'var(--edge)'}"></span>
    <span><span class="when">${fmtTime(e.at)}${e.tool && isCheckin(e) ? ' · tried a tool' : ''}</span>
    <span class="words" style="display:block">${words}</span>
    ${meta ? `<span class="meta" style="display:block">${esc(meta)}</span>` : ''}
    ${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}</span></button>`;
}
function renderToday() {
  const today = state.entries.filter(e => isToday(e.at)).sort((a, b) => b.at.localeCompare(a.at));
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const weekKeys = new Set(days.map(dayKey));
  const weekCount = state.entries.filter(e => isCheckin(e) && weekKeys.has(dayKey(e.at))).length;
  const week = days.map(d => {
    const es = state.entries.filter(e => isCheckin(e) && dayKey(e.at) === dayKey(d));
    const counts = {}; es.forEach(e => { const q = domQ(e); counts[q] = (counts[q] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const label = d.toLocaleDateString([], { weekday: 'narrow' });
    const long = d.toLocaleDateString([], { weekday: 'long' });
    const say = es.length ? `${long}: ${es.length} check-in${es.length === 1 ? '' : 's'}, mostly ${QUADS[top[0]].short}` : `${long}: no check-ins`;
    return `<div class="${i0(d) ? 'today' : ''}" role="img" aria-label="${say}"><div class="d" aria-hidden="true">${label}</div><div class="dot ${top ? 'on' : ''}" style="${top ? `background:var(--${top[0]}-soft);border-color:var(--${top[0]})` : ''}" aria-hidden="true">${es.length || ''}</div></div>`;
  }).join('');
  view.innerHTML = `
  ${notices()}
  <section class="hero" id="t-hero">
    <div class="date">${fmtDay(new Date())}</div>
    <h2>${greeting()}</h2>
    <button class="btn primary checkin-btn" data-act="checkin" id="t-checkin">Check in</button>
  </section>
  <section class="section" id="t-week">
    <div class="row between"><h2 style="margin:0">This week</h2><span class="muted small">${weekCount} check-in${weekCount === 1 ? '' : 's'}</span></div>
    <p class="muted small" style="margin-top:4px">Each day takes the color of the feeling you logged most.</p>
    <div class="week">${week}</div>
    <div class="legend" style="margin-top:12px">${QORDER.map(q => `<span><i style="background:${QCOL[q]}"></i>${QUADS[q].short}</span>`).join('')}</div>
  </section>
  <section class="section">
    <h2>Today</h2>
    ${today.length ? today.map(entryRow).join('') : `<div class="empty">Nothing logged yet today. A check-in takes about 20 seconds.</div>`}
  </section>
  <section class="section">
    <button class="linkrow" data-act="tab" data-to="tools">Need something now? Open the tools<span class="d">Breathing, grounding, movement and more, sorted by what has helped you</span></button>
  </section>`;
}
function i0(d) { return dayKey(d) === dayKey(new Date()); }
/* Notices that protect the only copy of the data: install, then back up. One at a time. */
function notices() {
  const n = state.entries.length;
  if (!isInstalled() && !storagePersisted && n >= 1 && daysSince(state.installNoticeAt) > 14) {
    return `<section class="notice" aria-labelledby="nt-install"><h2 id="nt-install">Keep your check-ins safe</h2>
      <p>Your browser can clear saved data from websites you haven't opened in a while. Add Undertow to your Home Screen (in Safari: Share, then Add to Home Screen) and it keeps your check-ins.</p>
      <div class="row"><button class="btn" data-act="notice-later" data-k="installNoticeAt">Not now</button></div></section>`;
  }
  if (n >= 5 && daysSince(state.lastBackupAt) > BACKUP_DAYS && daysSince(state.backupSnoozeAt) > 3) {
    const when = state.lastBackupAt ? `Your last backup was ${Math.floor(daysSince(state.lastBackupAt))} days ago.` : 'You haven\'t saved a backup yet.';
    return `<section class="notice" aria-labelledby="nt-backup"><h2 id="nt-backup">Back up your check-ins</h2>
      <p>${when} Your ${n} check-ins live only on this phone.</p>
      <div class="row"><button class="btn primary" data-act="backup">Save a backup</button><button class="btn" data-act="notice-later" data-k="backupSnoozeAt">Later</button></div></section>`;
  }
  return '';
}

/* ---------- Check-in ---------- */
let ck = null;
const ckFields = c => JSON.stringify([c.feelings.map(f => [f.w, f.i]), c.body, c.tags, c.note.trim(), c.sleep, c.moved, c.when]);
function startCheckin() {
  ck = { step: 0, mode: state.settings.mode, quad: null, petal: null, feelings: [], body: [], tags: [], note: '', sleep: null, moved: null, when: null };
  ck.orig = ckFields(ck);
  drawCheckin();
}
/* Edit an existing check-in in the same editor, prefilled. */
function editCheckin(id) {
  const e = state.entries.find(x => x.id === id); if (!e || !isCheckin(e)) return;
  const local = new Date(e.at); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  ck = { editId: id, step: 0, mode: e.feelings.every(f => f.src === 'wheel') ? 'wheel' : 'grid', quad: null, petal: null,
    feelings: e.feelings.map(f => ({ ...f })), body: [...(e.body || [])], tags: [...(e.tags || [])], note: e.note || '',
    sleep: e.sleep || null, moved: e.moved || null, when: local.toISOString().slice(0, 16) };
  ck.orig = ckFields(ck);
  drawCheckin();
}

/* ---------- sheets are modal dialogs: focus moves in, the page behind is inert, focus returns on close ---------- */
let lastFocus = null, lastFocusSel = null;
/* A selector that finds the same control after the page behind is redrawn. */
function pageKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const d = el.dataset || {};
  if (d.tab) return `[data-tab="${CSS.escape(d.tab)}"]`;
  if (d.act) return `[data-act="${CSS.escape(d.act)}"]` + (d.id ? `[data-id="${CSS.escape(d.id)}"]` : '');
  return null;
}
function focusKey(el) {
  if (!el || !sheet.contains(el) || el === sheet) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const a = el.dataset && el.dataset.act; if (!a) return null;
  let sel = `[data-act="${CSS.escape(a)}"]`;
  for (const k of ['q', 'rc', 'p', 'l', 'b', 't', 'k', 'v', 'i', 'm', 'f', 'g', 'id', 'json', 'step']) {
    if (el.dataset[k] !== undefined) sel += `[data-${k}="${CSS.escape(el.dataset[k])}"]`;
  }
  return sel;
}
function openSheet(html, keep) {
  const fresh = sheet.hidden;
  const key = !fresh && keep ? focusKey(document.activeElement) : null;
  if (fresh) { lastFocus = document.activeElement; lastFocusSel = pageKey(lastFocus); }
  sheet.innerHTML = html;
  const h = sheet.querySelector('h2');
  if (h) { h.id = 'sheet-title'; h.tabIndex = -1; }
  sheet.hidden = false; document.body.style.overflow = 'hidden';
  $('#app').inert = true;
  if (!keep) sheet.scrollTop = 0;
  let target = key && sheet.querySelector(key);
  if (!target || target.disabled) target = h || sheet.querySelector('button, [href], input, textarea, select');
  if (target) target.focus({ preventScroll: !!keep });
}
function closeSheet() {
  sheet.hidden = true; sheet.innerHTML = ''; document.body.style.overflow = '';
  $('#app').inert = false;
  ck = null; runner = null; stopBreath(); render();
  let back = lastFocus && document.body.contains(lastFocus) ? lastFocus : (lastFocusSel && $(lastFocusSel));
  if (!back) { back = $('#title'); back.tabIndex = -1; }
  back.focus({ preventScroll: true });
  lastFocus = null; lastFocusSel = null;
}
/* Ask before throwing away work. Returns true when there is something to lose. */
function unsavedWork() {
  if (ck) return ckFields(ck) !== ck.orig;
  if (runner) return !!(runner.journal && runner.journal.trim());
  return false;
}
function requestClose() {
  if (sheet.hidden) return;
  if ($('#guard')) return;
  if (!unsavedWork()) return closeSheet();
  const what = ck ? (ck.editId ? 'your changes to this check-in' : 'this check-in') : 'what you wrote';
  const g = document.createElement('div');
  g.id = 'guard'; g.className = 'guard';
  g.setAttribute('role', 'alertdialog'); g.setAttribute('aria-modal', 'true');
  g.setAttribute('aria-labelledby', 'guard-t'); g.setAttribute('aria-describedby', 'guard-d');
  g.innerHTML = `<div class="guard-box"><h3 id="guard-t">Discard ${what}?</h3><p id="guard-d" class="muted small">It hasn't been saved.</p>
    <div class="row"><button class="btn primary" data-act="guard-keep">Keep editing</button><button class="btn danger" data-act="guard-discard">Discard</button></div></div>`;
  [...sheet.children].forEach(c => { c.inert = true; });
  sheet.appendChild(g);
  g.querySelector('[data-act="guard-keep"]').focus();
}
function closeGuard() {
  const g = $('#guard'); if (!g) return;
  g.remove(); [...sheet.children].forEach(c => { c.inert = false; });
  const h = sheet.querySelector('h2'); if (h) h.focus({ preventScroll: true });
}

const STEPS = ['Feelings', 'Body', 'Details'];
function drawCheckin(keepScroll) {
  const y = sheet.scrollTop;
  const s = ck.step;
  const body = s === 0 ? stepFeel() : s === 1 ? stepBody() : stepContext();
  const canNext = s !== 0 || ck.feelings.length > 0;
  const top = ck.editId
    ? `<button class="btn quiet" data-act="close">Cancel</button>
       <div class="seg" role="group" aria-label="Part of the check-in">${STEPS.map((l, i) => `<button data-act="ck-step" data-step="${i}" aria-pressed="${i === s}">${l}</button>`).join('')}</div><span></span>`
    : `<button class="btn quiet" data-act="${s ? 'ck-back' : 'close'}">${s ? 'Back' : 'Cancel'}</button>
      <div class="progress" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div>
      <span class="step">Step ${s + 1} of 3</span>`;
  const foot = ck.editId
    ? `<button class="btn primary" data-act="ck-save" ${ck.feelings.length ? '' : 'disabled'}>${ck.feelings.length ? 'Save changes' : 'Pick a feeling'}</button>`
    : `${s === 1 ? `<button class="btn" data-act="ck-next">Skip</button>` : ''}
    <button class="btn primary" data-act="${s === 2 ? 'ck-save' : 'ck-next'}" ${canNext ? '' : 'disabled'}>${s === 2 ? 'Save check-in' : s === 0 && !ck.feelings.length ? 'Pick a feeling' : 'Next'}</button>`;
  openSheet(`<div class="sheet-in">
    <div class="sheet-top ${ck.editId ? 'edit' : ''}">${top}</div>
    ${body}
  </div>
  <div class="sheet-foot"><div class="in">${foot}</div></div>`, keepScroll);
  if (keepScroll) sheet.scrollTop = y;
}
function pickedList() {
  if (!ck.feelings.length) return '';
  return `<div class="picked" id="ck-picked">${ck.feelings.map((f, i) => `
    <div class="p"><div class="row between"><div><span class="name">${esc(f.w)}${arOf(f) ? `<span class="ar" lang="ar" dir="rtl">${esc(arOf(f))}</span>` : ''}</span>
      ${arOf(f) && f.tr ? `<div class="tr">${esc(f.src === 'wheel' || state.settings.arabic === 'fu' ? f.tr : f.tr)}</div>` : ''}</div>
      <div class="row">${arOf(f) ? `<button class="say" data-act="say" data-i="${i}" aria-label="Hear it in Arabic">▸</button>` : ''}
      <button class="btn quiet" data-act="ck-unpick" data-i="${i}" aria-label="Remove ${esc(f.w)}">Remove</button></div></div>
      <label class="sr" for="int${i}">How strong is ${esc(f.w)}?</label>
      <input class="range" id="int${i}" type="range" min="1" max="5" value="${f.i}" aria-valuetext="${STRENGTH[f.i - 1]}" data-act-input="ck-int" data-i="${i}">
      <div class="range-labels" aria-hidden="true"><span>a little</span><span class="now">${STRENGTH[f.i - 1]}</span><span>very</span></div></div>`).join('')}
    ${ck.feelings.length < MAX_FEEL ? `<p class="muted xs" style="margin:6px 0 0">Mixed feelings are normal. Add up to ${MAX_FEEL}.</p>` : ''}</div>`;
}
function isPicked(w) { return ck.feelings.some(f => f.w === w); }
function stepFeel() {
  const seg = `<div class="seg" role="group" aria-label="Check-in style"><button data-act="ck-mode" data-m="grid" aria-pressed="${ck.mode === 'grid'}">Grid</button><button data-act="ck-mode" data-m="wheel" aria-pressed="${ck.mode === 'wheel'}">Wheel</button></div>`;
  let inner;
  if (ck.mode === 'grid') {
    if (!ck.quad) {
      const cnt = q => ck.feelings.filter(f => f.q === q).length;
      inner = `<div class="axis"><span>↑ more energy</span></div>
      <div class="plane">${QORDER.map(q => `<button class="quad ${q}" data-act="ck-quad" data-q="${q}"><span>${QUADS[q].name}</span><b>${QUADS[q].short}</b><span class="count">${cnt(q) ? cnt(q) + ' picked' : ''}</span></button>`).join('')}</div>
      <div class="axis"><span>less pleasant</span><span>more pleasant →</span></div>`;
    } else {
      const q = ck.quad, m = GRIDMAP[q];
      let cells = '';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const w = m[r + ',' + c];
        const pct = Math.max(12, 62 - w.d * 9);
        const a = arOf({ ...w, src: 'grid' });
        cells += `<button class="word${w.w.length > 10 ? ' long' : ''}" data-act="ck-word" data-q="${q}" data-rc="${r},${c}" aria-pressed="${isPicked(w.w)}" style="background:color-mix(in srgb, ${QCOL[q]} calc(${pct}% * var(--tile-k)), var(--surface))">${esc(w.w)}${a ? `<span class="ar" lang="ar" dir="rtl">${esc(a)}</span>` : ''}</button>`;
      }
      inner = `<div class="row between" style="margin-top:12px"><button class="btn quiet" data-act="ck-quad" data-q="">← All four</button><span class="muted small">${QUADS[q].name}</span></div>
      <div class="words">${cells}</div><p class="muted xs">Stronger feelings sit toward the outer corner.</p>`;
    }
  } else {
    inner = wheelSvg() + petalPanel();
  }
  return `<h2>How are you feeling?</h2><div class="row between">${seg}</div>${inner}${pickedList()}`;
}
const PETAL_COL = ['#d9a91a', '#8fb33a', '#2f9a74', '#2c9bb5', '#4f74c4', '#8d6cc0', '#c8702c', '#d58a2a'];
function wheelSvg() {
  const R = [46, 98, 142, 182];
  const pt = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  let out = '';
  WHEEL.forEach((pet, i) => {
    const a0 = (-90 - 22.5 + i * 45) * Math.PI / 180, a1 = a0 + Math.PI / 4;
    for (let lv = 0; lv < 3; lv++) {
      const r0 = R[lv], r1 = R[lv + 1];
      const [x0, y0] = pt(r0, a0), [x1, y1] = pt(r1, a0), [x2, y2] = pt(r1, a1), [x3, y3] = pt(r0, a1);
      const w = pet.words[lv][0];
      const op = [0.95, 0.7, 0.42][lv];
      out += `<path d="M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0}Z" fill="${PETAL_COL[i]}" fill-opacity="${op}" class="${isPicked(w) ? 'sel' : ''}" data-act="ck-wheel" data-p="${i}" data-l="${lv}" role="button" aria-label="${w}" aria-pressed="${isPicked(w)}" tabindex="0"></path>`;
    }
    const am = (a0 + a1) / 2;
    const [tx, ty] = pt(120, am);
    out += `<text x="${tx}" y="${ty}">${pet.words[1][0]}</text>`;
  });
  return `<div class="wheel-wrap"><svg class="wheel" viewBox="-190 -190 380 380" role="group" aria-label="Wheel of emotions">${out}<circle r="44" fill="var(--bg)"></circle><text y="-6" style="font-size:10px;fill:var(--muted);font-weight:500">strong</text><text y="8" style="font-size:10px;fill:var(--muted);font-weight:500">at center</text></svg></div>`;
}
function petalPanel() {
  if (ck.petal == null) return `<p class="muted small" style="text-align:center">Tap a band: the center is strongest, the edge is mildest. Then you can add a blend.</p>`;
  const i = ck.petal, pet = WHEEL[i];
  const chip = (f, lab) => `<button class="chip" data-act="ck-wheelword" data-json='${esc(JSON.stringify(f))}' aria-pressed="${isPicked(f.w)}">${esc(lab || f.w)}</button>`;
  const prev = (i + 7) % 8;
  return `<div class="petal-pick"><h3>${pet.id}</h3>
    <div class="chips">${[2, 1, 0].map(l => chip(wheelWord(i, l), pet.words[l][0] + (l === 2 ? ' (mild)' : l === 0 ? ' (strong)' : ''))).join('')}</div>
    <p class="muted xs" style="margin:10px 0 6px">Blends with its neighbours</p>
    <div class="chips">${chip(dyadWord(prev), `${DYADS[prev][0]} (${WHEEL[prev].id} + ${pet.id})`)}${chip(dyadWord(i), `${DYADS[i][0]} (${pet.id} + ${WHEEL[(i + 1) % 8].id})`)}</div></div>`;
}
function addFeeling(f) {
  const at = ck.feelings.findIndex(x => x.w === f.w);
  if (at >= 0) { ck.feelings.splice(at, 1); return; }
  if (ck.feelings.length >= MAX_FEEL) { toast(`Up to ${MAX_FEEL} feelings. Remove one first.`); return; }
  ck.feelings.push({ ...f, i: 3 });
}
function bodySvg() {
  const on = id => ck.body.includes(id) ? ' on' : '';
  const z = (id, shape) => `<g class="zone${on(id)}" data-act="ck-body" data-b="${id}" role="button" tabindex="0" aria-label="${(BODY.find(b => b[0] === id) || [])[1]}" aria-pressed="${ck.body.includes(id)}">${shape}</g>`;
  return `<svg class="bodysvg" viewBox="0 0 160 330" aria-label="Body map">
    ${z('head', '<ellipse cx="80" cy="26" rx="20" ry="22"/>')}
    ${z('jaw', '<path d="M64 38 Q80 56 96 38 L94 46 Q80 60 66 46Z"/>')}
    ${z('throat', '<rect x="71" y="52" width="18" height="14" rx="4"/>')}
    ${z('shoulders', '<path d="M40 70 Q80 58 120 70 L118 82 Q80 72 42 82Z"/>')}
    ${z('chest', '<path d="M46 84 Q80 76 114 84 L112 124 Q80 132 48 124Z"/>')}
    ${z('stomach', '<path d="M50 128 Q80 136 110 128 L108 168 Q80 174 52 168Z"/>')}
    ${z('arms', '<path d="M38 76 L28 150 L38 152 L48 90Z M122 76 L132 150 L122 152 L112 90Z"/>')}
    ${z('hands', '<ellipse cx="30" cy="164" rx="9" ry="12"/><ellipse cx="130" cy="164" rx="9" ry="12"/>')}
    ${z('hips', '<path d="M52 172 Q80 178 108 172 L110 196 L50 196Z"/>')}
    ${z('legs', '<path d="M52 200 L78 200 L76 300 L60 300Z M82 200 L108 200 L100 300 L84 300Z"/>')}
    ${z('feet', '<path d="M56 304 L76 304 L76 316 L50 316Z M84 304 L104 304 L110 316 L84 316Z"/>')}
  </svg>`;
}
function stepBody() {
  return `<h2>Where do you feel it?</h2><p class="muted">Tap any places that feel tight, heavy, warm, buzzy or different. Skip if nothing stands out.</p>
  <div class="bodywrap">${bodySvg()}<div class="chips">${BODY.map(b => `<button class="chip" data-act="ck-body" data-b="${b[0]}" aria-pressed="${ck.body.includes(b[0])}">${b[1]}</button>`).join('')}</div></div>`;
}
function stepContext() {
  const dom = ck.feelings.slice().sort((a, b) => b.i - a.i)[0];
  const group = (g, label) => `<label class="lbl">${label}</label><div class="chips">${tagsFor(g).map(t => `<button class="chip" data-act="ck-tag" data-t="${esc(t)}" aria-pressed="${ck.tags.includes(t)}">${esc(t)}</button>`).join('')}<button class="chip add" data-act="ck-addtag" data-g="${g}">+ Add</button></div>`;
  const opt = (k, v, l) => `<button class="chip" data-act="ck-opt" data-k="${k}" data-v="${v}" aria-pressed="${ck[k] === v}">${l}</button>`;
  const now = new Date(ck.when || Date.now()); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return `<h2>What's going on?</h2><p class="muted">All optional. Tags are what make Patterns useful.</p>
  ${group('people', 'Who with')}${group('places', 'Where')}${group('doing', 'Doing')}
  <label class="lbl">Sleep last night</label><div class="chips">${opt('sleep', 'short', 'Short')}${opt('sleep', 'ok', 'OK')}${opt('sleep', 'good', 'Good')}</div>
  <label class="lbl">Moved your body today</label><div class="chips">${opt('moved', 'yes', 'Yes')}${opt('moved', 'no', 'Not yet')}</div>
  <label class="lbl" for="ck-note">Note</label>
  <textarea id="ck-note" placeholder="${esc(PROMPTS[dom ? dom.q : 'lp'])}" data-act-input="ck-note">${esc(ck.note)}</textarea>
  <label class="lbl" for="ck-when">When</label>
  <input id="ck-when" type="datetime-local" value="${now.toISOString().slice(0, 16)}" data-act-input="ck-when" max="${new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)}">`;
}
function saveCheckin() {
  if (!ck.feelings.length) return;
  const fields = {
    at: ck.when ? new Date(ck.when).toISOString() : new Date().toISOString(),
    feelings: ck.feelings.map(f => ({ w: f.w, src: f.src || 'grid', q: f.q, i: f.i, p: f.p, e: f.e, sh: f.sh, fu: f.fu, tr: f.tr })),
    body: ck.body, tags: ck.tags, note: ck.note.trim(), sleep: ck.sleep, moved: ck.moved,
  };
  if (ck.editId) {
    const e = state.entries.find(x => x.id === ck.editId);
    if (e) Object.assign(e, fields); // keeps id and any tool already tried
    save(); closeSheet(); toast('Check-in updated.');
    return;
  }
  const e = { id: uid(), ...fields };
  state.entries.push(e); save();
  ck = null;
  afterSave(e);
}
function afterSave(e) {
  const q = domQ(e);
  const picks = suggestTools(q).slice(0, 3);
  ck = null;
  openSheet(`<div class="sheet-in"><div class="sheet-top"><span></span><button class="btn quiet" data-act="close">Done</button></div>
    <h2>Logged.</h2>
    <p>${e.feelings.map(f => `<b>${esc(f.w)}</b>`).join(', ')}${e.body.length ? ` · felt in your ${e.body.map(b => (BODY.find(x => x[0] === b) || [b, b])[1].toLowerCase()).join(', ')}` : ''}.</p>
    <p class="muted">Naming it is already doing something. Want to try a tool?</p>
    ${picks.map(t => toolRow(t, e.id)).join('')}
    <div style="margin-top:20px"><button class="btn block" data-act="close">Not now</button></div>
    ${q === 'lu' ? crisisLine() : ''}</div>`);
}
function suggestTools(q) {
  return allTools().filter(t => t.q.includes(q)).sort((a, b) => {
    const sa = toolStats(a.id), sb = toolStats(b.id);
    return (sb.n ? sb.avg : 0.4) - (sa.n ? sa.avg : 0.4) || a.min - b.min;
  });
}
const crisisLine = () => `<p class="crisis">If you're in crisis or thinking about hurting yourself, call or text <b>988</b> (US) any time, or text HOME to 741741.</p>`;

/* ---------- Tools ---------- */
function toolRow(t, entryId) {
  const s = toolStats(t.id);
  return `<button class="tool" data-act="run-tool" data-id="${esc(t.id)}" ${entryId ? `data-entry="${esc(entryId)}"` : ''}>
    <span><span class="n">${esc(t.name)}</span><span class="qdots" aria-hidden="true">${t.q.map(q => `<i style="background:${QCOL[q]}"></i>`).join('')}</span>
    <span class="k" style="display:block">${esc(t.kind || 'Your tool')} · about ${t.min || 3} min</span></span>
    <span class="h">${s.n ? `helped ${s.helped} of ${s.n}` : ''}</span></button>`;
}
let toolFilter = 'all';
function renderTools() {
  const list = allTools().filter(t => toolFilter === 'all' || t.q.includes(toolFilter));
  const tried = list.filter(t => toolStats(t.id).n).sort((a, b) => toolStats(b.id).avg - toolStats(a.id).avg);
  const rest = list.filter(t => !toolStats(t.id).n);
  view.innerHTML = `<p class="muted">After each tool, you say whether it helped. The ones that work for you rise to the top.</p>
  <div class="chips" style="margin-bottom:12px"><button class="chip" data-act="tool-filter" data-f="all" aria-pressed="${toolFilter === 'all'}">All</button>${QORDER.map(q => `<button class="chip" data-act="tool-filter" data-f="${q}" aria-pressed="${toolFilter === q}">${QUADS[q].short}</button>`).join('')}</div>
  ${tried.length ? `<h2>What's helped you</h2>${tried.map(t => toolRow(t)).join('')}` : ''}
  <h2>${tried.length ? 'Not tried yet' : 'All tools'}</h2>${rest.map(t => toolRow(t)).join('') || '<p class="muted">You\'ve tried them all.</p>'}
  <div style="margin-top:16px"><button class="btn" data-act="add-tool">Add your own tool</button></div>
  ${crisisLine()}`;
}
let runner = null;
function runTool(id, entryId) {
  const t = allTools().find(x => x.id === id) || [...TOOLS, ...state.customTools].find(x => x.id === id);
  if (!t) return;
  runner = { t, entryId, result: null, journal: '' };
  drawRunner();
}
function drawRunner() {
  const { t } = runner;
  const res = [[-1, 'Worse'], [0, 'About the same'], [1, 'A bit better'], [2, 'Better']];
  const custom = state.customTools.some(c => c.id === t.id);
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">${esc(t.kind || 'Your tool')}</span></div>
    <h2>${esc(t.name)}</h2>${t.why ? `<p class="muted">${esc(t.why)}</p>` : ''}
    ${t.timer === 'box' ? `<div class="breather"><div class="ring" id="ring"></div><div class="lbl2" id="phase">Ready</div></div><div style="text-align:center"><button class="btn" data-act="breath">Start</button></div>` : ''}
    <ol class="steps">${t.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${t.journal ? `<label class="lbl" for="tj">Write it here (optional, saved to your journal)</label><textarea id="tj" data-act-input="tool-journal">${esc(runner.journal)}</textarea>` : ''}
    <h3>Compared to before, you feel…</h3>
    <div class="chips">${res.map(([v, l]) => `<button class="chip" data-act="tool-res" data-v="${v}" aria-pressed="${runner.result === v}">${l}</button>`).join('')}</div>
    ${custom ? `<div style="margin-top:28px"><button class="btn danger" data-act="del-tool" data-id="${t.id}">Delete this tool</button></div>` : ''}
  </div><div class="sheet-foot"><div class="in"><button class="btn primary" data-act="tool-save" ${runner.result == null ? 'disabled' : ''}>Save</button></div></div>`);
}
let breathT = null;
function stopBreath() { clearInterval(breathT); breathT = null; }
function breath() {
  if (breathT) { stopBreath(); $('#phase').textContent = 'Paused'; return; }
  const ph = [['Breathe in', 1], ['Hold', 1], ['Breathe out', 0.55], ['Hold', 0.55]];
  let k = 0, n = 0;
  const tick = () => {
    const ring = $('#ring'), lab = $('#phase'); if (!ring) return stopBreath();
    const [l, sc] = ph[k % 4]; lab.textContent = l; ring.style.transform = `scale(${sc})`;
    k++; if (k % 4 === 0) n++;
    if (n >= 6) { stopBreath(); setTimeout(() => { if ($('#phase')) $('#phase').textContent = 'Done'; }, 4000); }
  };
  tick(); breathT = setInterval(tick, 4000);
}
function saveTool() {
  const { t, entryId, result, journal } = runner;
  const note = (journal || '').trim();
  const at = new Date().toISOString();
  let savedNote = false;
  const e = entryId && state.entries.find(x => x.id === entryId);
  if (e) {
    e.tool = { id: t.id, result };
    if (note) { e.note = (e.note ? e.note + '\n\n' : '') + `${t.name}: ${note}`; savedNote = true; }
  } else if (note) {
    // Opened from the Tools tab: keep the writing as its own journal entry.
    state.entries.push({ id: uid(), at, feelings: [], body: [], tags: [], note, toolOnly: true, toolName: t.name, tool: { id: t.id, result } });
    savedNote = true;
  }
  state.toolUses.push({ id: t.id, at, entryId: e ? e.id : null, result });
  save(); stopBreath(); runner = null;
  closeSheet();
  const how = result > 0 ? 'Glad it helped.' : 'Good to know what doesn\'t help, too.';
  toast(savedNote ? `${how} Your note is in the Journal.` : `${how} Saved.`);
}
function addToolSheet() {
  runner = null;
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Cancel</button><span class="step">New tool</span></div>
  <h2>Add your own tool</h2>
  <label class="lbl" for="nt-name">Name</label><input id="nt-name" type="text" placeholder="e.g. Call Mom, Play guitar, Cold water on my face">
  <label class="lbl" for="nt-steps">Steps, one per line</label><textarea id="nt-steps" placeholder="What you do, in order"></textarea>
  <label class="lbl">Good for</label><div class="chips" id="nt-q">${QORDER.map(q => `<button class="chip" data-act="nt-q" data-q="${q}" aria-pressed="false">${QUADS[q].short}</button>`).join('')}</div>
  </div><div class="sheet-foot"><div class="in"><button class="btn primary" data-act="nt-save">Save tool</button></div></div>`);
}

/* ---------- Journal ---------- */
let jFilter = 'all', jSearch = '';
function renderJournal() {
  let list = state.entries.slice().sort((a, b) => b.at.localeCompare(a.at));
  if (jFilter !== 'all') list = list.filter(e => e.feelings.some(f => f.q === jFilter));
  if (jSearch) { const s = jSearch.toLowerCase(); list = list.filter(e => JSON.stringify([e.feelings.map(f => f.w), e.tags, e.note, e.body]).toLowerCase().includes(s)); }
  let html = `<div class="chips" style="margin-bottom:12px"><button class="chip" data-act="j-filter" data-f="all" aria-pressed="${jFilter === 'all'}">All</button>${QORDER.map(q => `<button class="chip" data-act="j-filter" data-f="${q}" aria-pressed="${jFilter === q}">${QUADS[q].short}</button>`).join('')}</div>
  <label class="sr" for="jsearch">Search</label><input id="jsearch" type="text" placeholder="Search words, tags and notes" value="${esc(jSearch)}" data-act-input="j-search">`;
  if (!state.entries.length) html += `<div class="empty" style="margin-top:16px">Your check-ins will show up here, newest first.</div>`;
  else if (!list.length) html += `<p class="muted" style="margin-top:16px">Nothing matches.</p>`;
  let last = '';
  list.forEach(e => { const k = dayKey(e.at); if (k !== last) { html += `<div class="dayhead">${isToday(e.at) ? 'Today' : fmtDay(e.at)}</div>`; last = k; } html += entryRow(e); });
  view.innerHTML = html;
}
function openEntry(id) {
  const e = state.entries.find(x => x.id === id); if (!e) return;
  const tool = e.tool && [...TOOLS, ...state.customTools].find(t => t.id === e.tool.id);
  const resL = { '-1': 'worse', '0': 'about the same', '1': 'a bit better', '2': 'better' };
  const sl = { short: 'Short sleep', ok: 'OK sleep', good: 'Good sleep' };
  const eid = esc(e.id);
  const when = `${fmtDay(e.at)}, ${fmtTime(e.at)}`;
  if (!isCheckin(e)) {
    // A note written in a tool: only the note can change.
    openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">${when}</span></div>
      <h2>Note from ${esc(e.toolName || (tool && tool.name) || 'a tool')}</h2>
      ${tool ? `<p class="muted">Felt ${resL[e.tool.result] || ''} after.</p>` : ''}
      <label class="lbl" for="en-note">Note</label><textarea id="en-note" data-id="${eid}">${esc(e.note)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="en-save" data-id="${eid}">Save note</button></div>
      <div style="margin-top:28px"><button class="btn danger" data-act="en-del" data-id="${eid}">Delete note</button></div></div>`);
    return;
  }
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><button class="btn primary" data-act="en-edit" data-id="${eid}">Edit</button></div>
    <h2>${when}</h2>
    <ul class="feel-list">${e.feelings.map(f => `<li><i class="qdot" style="background:${QCOL[f.q]}" aria-hidden="true"></i><span><span class="name">${esc(f.w)}${arOf(f) ? ` <span class="ar muted" lang="ar" dir="rtl">${esc(arOf(f))}</span>` : ''}</span><span class="muted small" style="display:block">${STRENGTH[f.i - 1]} · ${QUADS[f.q].short.toLowerCase()}${f.src === 'wheel' ? ' · from the wheel' : ''}</span></span></li>`).join('')}</ul>
    ${e.body.length ? `<p><b>Body:</b> ${e.body.map(b => (BODY.find(x => x[0] === b) || [b, b])[1].toLowerCase()).join(', ')}</p>` : ''}
    ${e.tags.length ? `<p><b>Tags:</b> ${e.tags.map(esc).join(', ')}</p>` : ''}
    ${e.sleep || e.moved ? `<p class="muted">${[sl[e.sleep], e.moved === 'yes' ? 'Moved today' : e.moved === 'no' ? 'Hadn\'t moved yet' : ''].filter(Boolean).join(' · ')}</p>` : ''}
    ${tool ? `<p class="muted">Tried ${esc(tool.name)}: felt ${resL[e.tool.result] || ''} after.</p>` : ''}
    <h3>Note</h3>${e.note ? `<p class="entry-note">${esc(e.note)}</p>` : `<p class="muted">No note. Tap Edit to add one.</p>`}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="run-tool-pick" data-id="${eid}">Try a tool</button></div>
    <div style="margin-top:28px"><button class="btn danger" data-act="en-del" data-id="${eid}">Delete check-in</button></div></div>`);
}

/* ---------- Patterns ---------- */
let pRange = 30;
function renderPatterns() {
  const since = pRange ? Date.now() - pRange * 864e5 : 0;
  const es = state.entries.filter(e => isCheckin(e) && new Date(e.at) >= since);
  const rangeSeg = `<div class="seg" role="group" aria-label="Range">${[[7, '7 days'], [30, '30 days'], [0, 'All']].map(([v, l]) => `<button data-act="p-range" data-v="${v}" aria-pressed="${pRange === v}">${l}</button>`).join('')}</div>`;
  if (es.length < 5) {
    view.innerHTML = `${rangeSeg}<div class="empty" style="margin-top:16px">Patterns show up after about 5 check-ins in this range. You have ${es.length}.<br><br>Tags, sleep and movement make them sharper.</div>`;
    return;
  }
  const counts = { hu: 0, hp: 0, lu: 0, lp: 0 }; es.forEach(e => counts[domQ(e)]++);
  const tot = es.length;
  const U = (counts.hu + counts.lu) / tot;
  const pct = x => Math.round(x * 100);
  const mix = QORDER.filter(q => counts[q]).map(q => `<span style="background:${QCOL[q]};width:${counts[q] / tot * 100}%" title="${QUADS[q].short} ${counts[q]}"></span>`).join('');
  // scatter of every feeling
  const pts = es.flatMap(e => e.feelings).map((f, k) => {
    const jx = ((k * 37) % 11 - 5) * 0.06, jy = ((k * 53) % 11 - 5) * 0.06;
    const cl = v => Math.max(16, Math.min(204, v)); const x = cl(110 + (f.p + jx) * 44), y = cl(110 - (f.e + jy) * 44), r = 2.5 + f.i * 0.9;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${QCOL[f.q]}" fill-opacity=".7"/>`;
  }).join('');
  const scatter = `<svg class="scatter" viewBox="0 0 220 220" role="img" aria-label="Every feeling you logged, placed by energy and pleasantness"><rect x="10" y="10" width="200" height="200" rx="10" fill="var(--surface)" stroke="var(--line)"/><line x1="110" y1="14" x2="110" y2="206" stroke="var(--line)"/><line x1="14" y1="110" x2="206" y2="110" stroke="var(--line)"/>${pts}<text x="16" y="24">${QUADS.hu.short}</text><text x="204" y="24" text-anchor="end">${QUADS.hp.short}</text><text x="16" y="202">${QUADS.lu.short}</text><text x="204" y="202" text-anchor="end">${QUADS.lp.short}</text></svg>`;
  // time of day
  const tb = [['Morning', h => h >= 5 && h < 12], ['Afternoon', h => h >= 12 && h < 17], ['Evening', h => h >= 17 && h < 22], ['Night', h => h >= 22 || h < 5]];
  const tod = tb.map(([l, f]) => { const g = es.filter(e => f(new Date(e.at).getHours())); const c = { hu: 0, hp: 0, lu: 0, lp: 0 }; g.forEach(e => c[domQ(e)]++); return { l, n: g.length, c }; });
  const todHtml = `<div class="minibars">${tod.map(t => `<div class="col"><div class="stack">${t.n ? QORDER.map(q => `<span style="height:${t.c[q] / t.n * 100}%;background:${QCOL[q]}"></span>`).join('') : ''}</div>${t.l}<br>${t.n}</div>`).join('')}</div>`;
  // findings
  const F = [];
  const cmp = (label, group, min = 3) => {
    if (group.length < min) return null;
    const u = group.filter(e => unpleasant(domQ(e))).length / group.length;
    return { label, n: group.length, u, diff: u - U };
  };
  const todF = tod.map((t, i) => cmp(t.l.toLowerCase(), es.filter(e => tb[i][1](new Date(e.at).getHours())))).filter(Boolean).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
  if (todF && Math.abs(todF.diff) >= 0.15) F.push([`${todF.diff > 0 ? 'Harder' : 'Easier'} in the ${todF.label}`, `${pct(todF.u)}% of ${todF.label} check-ins are unpleasant, against ${pct(U)}% overall (${todF.n} check-ins).`]);
  const wd = [0, 1, 2, 3, 4, 5, 6].map(d => cmp(new Date(2026, 0, 4 + d).toLocaleDateString([], { weekday: 'long' }), es.filter(e => new Date(e.at).getDay() === d))).filter(Boolean).sort((a, b) => b.diff - a.diff);
  if (wd.length >= 2 && wd[0].diff - wd[wd.length - 1].diff >= 0.2) F.push([`${wd[0].label}s are your hardest day`, `${pct(wd[0].u)}% unpleasant on ${wd[0].label}s; ${wd[wd.length - 1].label}s are lightest at ${pct(wd[wd.length - 1].u)}%.`]);
  const tagSet = [...new Set(es.flatMap(e => e.tags))];
  tagSet.map(t => cmp(t, es.filter(e => e.tags.includes(t)))).filter(x => x && Math.abs(x.diff) >= 0.15).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 4)
    .forEach(x => F.push([x.diff > 0 ? `“${x.label}” tends to come with harder feelings` : `“${x.label}” tends to come with easier feelings`, `${pct(x.u)}% unpleasant with “${x.label}” vs ${pct(U)}% overall (${x.n} check-ins).`]));
  const sl = cmp('short sleep', es.filter(e => e.sleep === 'short')), sg = cmp('ok or good sleep', es.filter(e => e.sleep === 'ok' || e.sleep === 'good'));
  if (sl && sg && sl.u - sg.u >= 0.1) F.push(['Short sleep shows up in your feelings', `After short nights ${pct(sl.u)}% of check-ins are unpleasant; after OK or good nights, ${pct(sg.u)}%.`]);
  const my = cmp('moved', es.filter(e => e.moved === 'yes')), mn = cmp('not yet', es.filter(e => e.moved === 'no'));
  if (my && mn && mn.u - my.u >= 0.1) F.push(['Moving helps', `On days you moved, ${pct(my.u)}% unpleasant; before moving, ${pct(mn.u)}%.`]);
  const bodyC = {}; es.filter(e => unpleasant(domQ(e))).forEach(e => e.body.forEach(b => bodyC[b] = (bodyC[b] || 0) + 1));
  const bTop = Object.entries(bodyC).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (bTop.length && bTop[0][1] >= 2) F.push(['Where hard feelings land', `Most often your ${bTop.map(b => (BODY.find(x => x[0] === b[0]) || [b[0], b[0]])[1].toLowerCase()).join(' and ')} (${bTop.map(b => b[1]).join(' and ')} times).`]);
  const wc = {}; es.forEach(e => e.feelings.forEach(f => wc[f.w] = (wc[f.w] || 0) + 1));
  const wTop = Object.entries(wc).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const used = state.toolUses.filter(u => new Date(u.at) >= since && u.result != null);
  const tc = {}; used.forEach(u => { tc[u.id] = tc[u.id] || { n: 0, h: 0 }; tc[u.id].n++; if (u.result > 0) tc[u.id].h++; });
  const tTop = Object.entries(tc).sort((a, b) => b[1].h / b[1].n - a[1].h / a[1].n || b[1].n - a[1].n).slice(0, 3);
  const nm = id => ([...TOOLS, ...state.customTools].find(t => t.id === id) || { name: id }).name;
  view.innerHTML = `${rangeSeg}
  <h2>The mix</h2><p class="muted small">${tot} check-ins. ${pct(U)}% leaned unpleasant, ${100 - pct(U)}% pleasant.</p>
  <div class="mixbar">${mix}</div><div class="legend">${QORDER.map(q => `<span><i style="background:${QCOL[q]}"></i>${QUADS[q].short} ${counts[q]}</span>`).join('')}</div>
  <h2>Every feeling, placed</h2><p class="muted small">Up is more energy, right is more pleasant. Bigger dots were stronger.</p>${scatter}
  <h2>By time of day</h2>${todHtml}
  <h2>What stands out</h2>${F.length ? F.map(f => `<div class="finding"><b>${esc(f[0])}</b><span class="muted">${esc(f[1])}</span></div>`).join('') : `<p class="muted">Nothing stands out yet. Tags, sleep and movement give Patterns more to compare.</p>`}
  <h2>Words you used most</h2><p>${wTop.map(([w, n]) => `${esc(w)} <span class="muted small">×${n}</span>`).join(' · ')}</p>
  ${tTop.length ? `<h2>Tools that helped</h2>${tTop.map(([id, s]) => `<div class="finding"><b>${esc(nm(id))}</b><span class="muted">Helped ${s.h} of ${s.n} ${s.n === 1 ? 'try' : 'tries'}.</span></div>`).join('')}` : ''}
  <p class="muted xs" style="margin-top:20px">These are patterns in what you logged, not diagnoses. A few check-ins can swing them a lot.</p>`;
}

/* ---------- More ---------- */
function renderMore() {
  const s = state.settings;
  const sel = (k, opts, desc) => `<select id="set-${k}" ${desc ? `aria-describedby="set-${k}-d"` : ''} data-act-input="set" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const row = (k, title, desc, opts) => `<div class="set"><div><label class="t" for="set-${k}">${title}</label>${desc ? `<div class="d" id="set-${k}-d">${desc}</div>` : ''}</div>${sel(k, opts, desc)}</div>`;
  view.innerHTML = `
  <h2>Settings</h2>
  ${row('theme', 'Appearance', '', [['auto', 'Match phone'], ['light', 'Light'], ['dark', 'Dark']])}
  ${row('mode', 'Check-in starts with', 'You can switch during any check-in', [['grid', 'Grid'], ['wheel', 'Wheel']])}
  ${row('arabic', 'Arabic words', 'Shown under each feeling, with a button to hear them', [['sh', 'Shami'], ['fu', 'Fusha'], ['both', 'Both'], ['off', 'Off']])}
  ${row('faith', 'Faith tools', 'Prayer and scripture in Tools', [[true, 'Show'], [false, 'Hide']].map(([v, l]) => [String(v), l]))}
  <h2>Tags</h2><p class="muted small">Tap a tag to hide it. Add new ones during a check-in.</p>
  ${Object.keys(TAG_GROUPS).map(g => `<div class="chips" style="margin-bottom:10px">${[...TAG_GROUPS[g], ...state.customTags[g]].map(t => `<button class="chip" data-act="tag-hide" data-k="${g}:${esc(t)}" aria-pressed="${!state.hiddenTags.includes(g + ':' + t)}">${esc(t)}</button>`).join('')}</div>`).join('')}
  <h2>Reminders</h2>
  <p class="muted small">Undertow doesn't nag. If you'd like a nudge, add check-in times to your calendar.</p>
  <div class="row" id="rem">${s.reminders.map((t, i) => `<input type="time" value="${t}" aria-label="Reminder ${i + 1} time" data-act-input="rem" data-i="${i}" style="width:auto">`).join('')}<button class="btn quiet" data-act="rem-add">+ Time</button>${s.reminders.length ? `<button class="btn quiet" data-act="rem-del">− Time</button>` : ''}</div>
  <div style="margin-top:10px"><button class="btn" data-act="ics" ${s.reminders.length ? '' : 'disabled'}>Add to calendar</button></div>
  <h2>Your data</h2>
  <p class="muted small">Everything stays on this phone. Save a backup now and then; it's the only copy.${isInstalled() ? '' : ' Adding Undertow to your Home Screen also stops the browser from clearing it.'}</p>
  <button class="linkrow" data-act="backup">Save a backup<span class="d">${state.entries.length} entries · last backup ${state.lastBackupAt ? fmtDay(state.lastBackupAt) : 'never'}</span></button>
  <button class="linkrow" data-act="restore">Restore from a backup<span class="d">Adds check-ins you don't already have</span></button>
  <button class="linkrow" data-act="csv">Export a spreadsheet (CSV)</button>
  <input type="file" id="restore-file" accept=".json,application/json" hidden>
  <h2>Help</h2>
  <button class="linkrow" data-act="tour">Take the tour</button>
  <button class="linkrow" data-act="help">How Undertow works</button>
  <p class="muted xs" style="margin-top:20px">Undertow ${VERSION} · ${VERSION_DATE}</p>`;
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/* The share sheet works inside an installed iPhone app, where download links often don't.
   Returns 'shared', 'downloaded' or 'cancelled'. Must be called straight from a tap. */
async function shareOrDownload(name, text, type) {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
  }
  download(name, text, type);
  return 'downloaded';
}
async function backup() {
  const how = await shareOrDownload(`undertow-backup-${dayKey(new Date())}.json`, JSON.stringify(state, null, 1), 'application/json');
  if (how === 'cancelled') return toast('Backup not saved.');
  state.lastBackupAt = new Date().toISOString(); save(); render();
  toast(how === 'shared' ? 'Backup ready. Save it to Files or somewhere safe.' : 'Backup saved to your downloads.');
}
function makeIcs() {
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(); const ds = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = state.settings.reminders.map((t, i) => {
    const [h, m] = t.split(':');
    const end = new Date(2000, 0, 1, +h, +m + 5);
    return ['BEGIN:VEVENT', `UID:undertow-checkin-${i}-${ds}@undertow`, `DTSTAMP:${stamp}`, `DTSTART:${ds}T${h}${m}00`, `DTEND:${ds}T${pad(end.getHours())}${pad(end.getMinutes())}00`,
      'RRULE:FREQ=DAILY', 'SUMMARY:Undertow check-in', `DESCRIPTION:How are you\\, really? ${location.origin}`, `URL:${location.origin}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Undertow check-in', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Undertow//EN', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
}
function csv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['date', 'time', 'feelings', 'quadrants', 'intensities', 'body', 'tags', 'sleep', 'moved', 'note', 'tool', 'tool_result']];
  state.entries.slice().sort((a, b) => a.at.localeCompare(b.at)).forEach(e => {
    const d = new Date(e.at);
    rows.push([dayKey(d), d.toTimeString().slice(0, 5), e.feelings.map(f => f.w).join('; '), e.feelings.map(f => f.q).join('; '), e.feelings.map(f => f.i).join('; '),
      e.body.join('; '), e.tags.join('; '), e.sleep || '', e.moved || '', e.note, e.tool ? e.tool.id : '', e.tool ? e.tool.result : '']);
  });
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
/* Accept only well-formed entries from a backup file; anything else is skipped and counted. */
function cleanEntry(e) {
  if (!e || typeof e.id !== 'string' || !e.id || isNaN(Date.parse(e.at))) return null;
  const strs = a => Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  const feelings = (Array.isArray(e.feelings) ? e.feelings : [])
    .filter(f => f && typeof f.w === 'string' && QUADS[f.q])
    .map(f => ({ w: f.w, src: f.src === 'wheel' ? 'wheel' : 'grid', q: f.q, i: Math.min(5, Math.max(1, Math.round(+f.i) || 3)),
      p: +f.p || 0, e: +f.e || 0, sh: typeof f.sh === 'string' ? f.sh : '', fu: typeof f.fu === 'string' ? f.fu : '', tr: typeof f.tr === 'string' ? f.tr : '' }));
  if (!feelings.length && !e.toolOnly) return null;
  const out = { id: e.id, at: new Date(e.at).toISOString(), feelings, body: strs(e.body).filter(b => BODY.some(x => x[0] === b)), tags: strs(e.tags),
    note: typeof e.note === 'string' ? e.note : '', sleep: ['short', 'ok', 'good'].includes(e.sleep) ? e.sleep : null, moved: ['yes', 'no'].includes(e.moved) ? e.moved : null };
  if (e.tool && typeof e.tool.id === 'string') out.tool = { id: e.tool.id, result: Math.min(2, Math.max(-1, Math.round(+e.tool.result) || 0)) };
  if (e.toolOnly) { out.toolOnly = true; out.toolName = typeof e.toolName === 'string' ? e.toolName : ''; }
  return out;
}
function restore(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.entries)) throw new Error('not a backup');
      const have = new Set(state.entries.map(e => e.id));
      const clean = d.entries.map(cleanEntry);
      const skipped = clean.filter(e => !e).length;
      const add = clean.filter(e => e && !have.has(e.id));
      state.entries.push(...add);
      const uh = new Set(state.toolUses.map(u => u.at + u.id));
      state.toolUses.push(...(Array.isArray(d.toolUses) ? d.toolUses : []).filter(u => u && typeof u.id === 'string' && !isNaN(Date.parse(u.at)) && !uh.has(u.at + u.id)));
      const th = new Set(state.customTools.map(t => t.id));
      state.customTools.push(...(Array.isArray(d.customTools) ? d.customTools : []).filter(t => t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.steps) && Array.isArray(t.q) && !th.has(t.id)));
      for (const g of Object.keys(TAG_GROUPS)) state.customTags[g] = [...new Set([...state.customTags[g], ...(((d.customTags || {})[g]) || []).filter(t => typeof t === 'string')])];
      readOk = true; save(); render();
      const msg = `Restored ${add.length} entr${add.length === 1 ? 'y' : 'ies'}${skipped ? `, skipped ${skipped} that couldn't be read` : ''}.`;
      if (d.settings && typeof d.settings === 'object') {
        toast(msg, 'Use its settings', () => {
          state.settings = { ...state.settings, ...d.settings };
          if (Array.isArray(d.hiddenTags)) state.hiddenTags = d.hiddenTags.filter(t => typeof t === 'string');
          save(); applyTheme(); render(); toast('Settings restored.');
        });
      } else toast(msg);
    } catch { toast('That file isn\'t an Undertow backup.'); }
  };
  r.readAsText(file);
}
function helpSheet() {
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">Help</span></div>
  <h2>How Undertow works</h2>
  <p>Check in whenever something shifts. Pick up to three feelings, how strong each is, where you feel it, and what's going on. After a check-in you can try a tool and say whether it helped.</p>
  <h3>Grid and wheel</h3>
  <p>The <b>grid</b> sorts feelings by energy (up and down) and pleasantness (left and right), the same two-axis idea researchers use for mood. The word list and layout are Undertow's own.</p>
  <p>The <b>wheel</b> is drawn from Robert Plutchik's 1980 model of emotion: eight basic emotions, each at three strengths, with blends between neighbours (joy and trust make love). The strongest sit at the center. The drawing and colors here are Undertow's own.</p>
  <h3>Arabic</h3>
  <p>Grid words show Shami (Levantine) by default, with Fusha in settings. Wheel words show the Fusha noun. The ▸ button reads a word aloud if your phone has an Arabic voice. These translations are a first draft; check them with a speaker.</p>
  <h3>Patterns</h3>
  <p>After about five check-ins, Patterns compares your feelings across times of day, weekdays, tags, sleep and movement, and shows which tools have helped. They're patterns in what you logged, not diagnoses.</p>
  <h3>Privacy</h3>
  <p>Everything stays on this device: no account, no server, no tracking. A second copy is kept in the browser's database in case the first can't be read. Save a backup file in More now and then; Undertow reminds you every two weeks.</p>
  <p>Add Undertow to your Home Screen (in Safari: Share, then Add to Home Screen). In a normal Safari tab, Safari can clear a site's saved data after 7 days without a visit; an app on the Home Screen keeps it.</p>
  <h3>Limitations</h3>
  <ul><li>No sync between devices yet; move data with a backup file.</li><li>Undertow can't read Snooz or Ironwood yet; use the sleep and movement buttons for now.</li><li>Reminders are calendar events, not app notifications.</li></ul>
  ${crisisLine()}
  <p class="muted xs">Undertow ${VERSION} · ${VERSION_DATE}. A personal tool, not medical care.</p></div>`);
}

/* ---------- Tour ---------- */
const TOUR = [
  { sel: null, tab: 'today', h: 'Welcome to Undertow', b: 'A quiet place to notice what\'s moving under the surface. Here\'s a quick look around.' },
  { sel: '#t-checkin', tab: 'today', h: 'Check in', b: 'Pick up to three feelings on the grid or the wheel, then where you feel it and what\'s going on. About 20 seconds.' },
  { sel: '#t-week', tab: 'today', h: 'Your week', b: 'Each day takes the color of the feeling you logged most. No streaks: a blank day is just a blank day.' },
  { sel: '[data-tab="journal"]', tab: 'today', h: 'Journal', b: 'Every check-in, newest first. Filter by color or search your notes and tags.' },
  { sel: '[data-tab="patterns"]', tab: 'today', h: 'Patterns', b: 'After about five check-ins: what times, days, people and places tend to come with harder or easier feelings.' },
  { sel: '[data-tab="tools"]', tab: 'today', h: 'Tools', b: 'Breathing, grounding, movement and more. After each one you say if it helped, so the useful ones rise to the top. Add your own too.' },
  { sel: '[data-tab="more"]', tab: 'today', h: 'More', b: 'Arabic words, the faith tools, tags, calendar reminders and backups.' },
  { sel: '[data-tab="more"]', tab: 'today', lim: true, h: 'One thing to know', b: 'Your check-ins live only on this phone. There\'s no sync yet, so save a backup in More now and then.' },
];
let tourI = 0;
function startTour() { closeSheetQuiet(); tourI = 0; go('today'); drawTour(); }
function closeSheetQuiet() { sheet.hidden = true; sheet.innerHTML = ''; document.body.style.overflow = ''; $('#app').inert = false; ck = null; runner = null; lastFocus = null; }
function drawTour() {
  const t = TOUR[tourI], el = $('#tour'); el.hidden = false;
  $('#app').inert = false; // measure the real layout, then lock it
  const target = t.sel && $(t.sel);
  let hole = '', pos = 'top:30%';
  if (target) {
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    hole = `<div class="hole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>`;
    pos = r.top > innerHeight / 2 ? `bottom:${innerHeight - r.top + 18}px` : `top:${r.bottom + 18}px`;
  } else hole = `<div class="hole" style="left:50%;top:50%;width:0;height:0"></div>`;
  el.innerHTML = `${hole}<div class="tip" style="${pos}" role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-b">${t.lim ? '<div class="lim">Limitation</div>' : ''}<h3 id="tour-h">${t.h}</h3><p id="tour-b">${t.b}</p>
    <div class="row between"><span class="muted xs">${tourI + 1} of ${TOUR.length}</span><div class="row"><button class="btn quiet" data-act="tour-end">Skip</button>${tourI ? '<button class="btn" data-act="tour-prev">Back</button>' : ''}<button class="btn primary" data-act="tour-next">${tourI === TOUR.length - 1 ? 'Done' : 'Next'}</button></div></div></div>`;
  $('#app').inert = true;
  el.querySelector('[data-act="tour-next"]').focus({ preventScroll: true });
}
function endTour() {
  $('#tour').hidden = true; $('#tour').innerHTML = ''; $('#app').inert = !sheet.hidden;
  state.seenTour = true; save();
  const c = $('#t-checkin'); if (c) c.focus({ preventScroll: true });
}

/* ---------- events ---------- */
let delArmed = null;
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act], [data-tab]'); if (!b) return;
  if (b.dataset.tab) return go(b.dataset.tab);
  const a = b.dataset.act, d = b.dataset;
  switch (a) {
    case 'tab': return go(d.to);
    case 'checkin': return startCheckin();
    case 'close': return requestClose();
    case 'guard-keep': return closeGuard();
    case 'guard-discard': return closeSheet();
    case 'help': return helpSheet();
    case 'notice-later': state[d.k] = new Date().toISOString(); save(); return render();
    case 'ck-step': ck.step = +d.step; return drawCheckin();
    case 'en-edit': return editCheckin(d.id);
    case 'ck-mode': ck.mode = d.m; return drawCheckin(true);
    case 'ck-quad': ck.quad = d.q || null; return drawCheckin(true);
    case 'ck-word': { const w = GRIDMAP[d.q][d.rc]; addFeeling({ ...w, src: 'grid' }); return drawCheckin(true); }
    case 'ck-wheel': { const p = +d.p, l = +d.l; ck.petal = p; addFeeling(wheelWord(p, l)); return drawCheckin(true); }
    case 'ck-wheelword': addFeeling(JSON.parse(d.json)); return drawCheckin(true);
    case 'ck-unpick': ck.feelings.splice(+d.i, 1); return drawCheckin(true);
    case 'say': { const f = ck.feelings[+d.i]; return say(f.src === 'wheel' ? f.fu : (state.settings.arabic === 'fu' ? f.fu : f.sh)); }
    case 'ck-next': if (ck.step === 0 && !ck.feelings.length) return; ck.step++; return drawCheckin();
    case 'ck-back': ck.step--; return drawCheckin();
    case 'ck-body': { const i = ck.body.indexOf(d.b); if (i >= 0) ck.body.splice(i, 1); else ck.body.push(d.b); return drawCheckin(true); }
    case 'ck-tag': { const i = ck.tags.indexOf(d.t); if (i >= 0) ck.tags.splice(i, 1); else ck.tags.push(d.t); return drawCheckin(true); }
    case 'ck-addtag': {
      const t = (prompt('New tag') || '').trim().toLowerCase().slice(0, 30); if (!t) return;
      if (!tagsFor(d.g).includes(t)) state.customTags[d.g].push(t);
      state.hiddenTags = state.hiddenTags.filter(x => x !== d.g + ':' + t);
      if (!ck.tags.includes(t)) ck.tags.push(t); save(); return drawCheckin(true);
    }
    case 'ck-opt': ck[d.k] = ck[d.k] === d.v ? null : d.v; return drawCheckin(true);
    case 'ck-save': return saveCheckin();
    case 'open-entry': return openEntry(d.id);
    case 'en-save': { const e = state.entries.find(x => x.id === d.id); if (!e) return; e.note = $('#en-note').value.trim(); save(); closeSheet(); return toast('Note saved.'); }
    case 'en-del': {
      if (delArmed !== d.id) { delArmed = d.id; b.textContent = 'Tap again to delete'; setTimeout(() => { delArmed = null; }, 4000); return; }
      const i = state.entries.findIndex(x => x.id === d.id); if (i < 0) return;
      const [gone] = state.entries.splice(i, 1); save(); closeSheet();
      return toast(isCheckin(gone) ? 'Check-in deleted.' : 'Note deleted.', 'Undo', () => { state.entries.push(gone); save(); render(); });
    }
    case 'run-tool-pick': {
      const e = state.entries.find(x => x.id === d.id); if (!e) return; const q = domQ(e);
      openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">Pick a tool</span></div><h2>Try a tool</h2>${suggestTools(q).map(t => toolRow(t, e.id)).join('')}</div>`);
      return;
    }
    case 'run-tool': return runTool(d.id, d.entry);
    case 'breath': b.textContent = breathT ? 'Start' : 'Pause'; return breath();
    case 'tool-res': runner.result = +d.v; { const j = $('#tj'); if (j) runner.journal = j.value; } return drawRunner();
    case 'tool-save': return saveTool();
    case 'tool-filter': toolFilter = d.f; return render();
    case 'add-tool': return addToolSheet();
    case 'nt-q': b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); return;
    case 'nt-save': {
      const name = $('#nt-name').value.trim(); const steps = $('#nt-steps').value.split('\n').map(s => s.trim()).filter(Boolean);
      const q = [...sheet.querySelectorAll('[data-act="nt-q"][aria-pressed="true"]')].map(x => x.dataset.q);
      if (!name) return toast('Give it a name.');
      state.customTools.push({ id: 'c-' + uid(), name, steps: steps.length ? steps : [name], q: q.length ? q : QORDER.slice(), min: 5, kind: 'Your tool' });
      save(); closeSheet(); return toast('Tool added.');
    }
    case 'del-tool': {
      if (delArmed !== d.id) { delArmed = d.id; b.textContent = 'Tap again to delete'; setTimeout(() => { delArmed = null; }, 4000); return; }
      state.customTools = state.customTools.filter(t => t.id !== d.id); save(); closeSheet(); return toast('Tool deleted.');
    }
    case 'j-filter': jFilter = d.f; return render();
    case 'p-range': pRange = +d.v; return render();
    case 'tag-hide': { const k = d.k; state.hiddenTags = state.hiddenTags.includes(k) ? state.hiddenTags.filter(x => x !== k) : [...state.hiddenTags, k]; save(); return render(); }
    case 'rem-add': state.settings.reminders.push('13:00'); save(); return render();
    case 'rem-del': state.settings.reminders.pop(); save(); return render();
    case 'ics': shareOrDownload('undertow-checkins.ics', makeIcs(), 'text/calendar').then(h => { if (h !== 'cancelled') toast('Open the file to add the reminders to your calendar.'); }); return;
    case 'backup': backup(); return;
    case 'restore': return $('#restore-file').click();
    case 'csv': shareOrDownload(`undertow-${dayKey(new Date())}.csv`, csv(), 'text/csv'); return;
    case 'tour': return startTour();
    case 'tour-next': if (tourI === TOUR.length - 1) return endTour(); tourI++; return drawTour();
    case 'tour-prev': tourI--; return drawTour();
    case 'tour-end': return endTour();
  }
});
document.addEventListener('keydown', ev => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('svg [data-act]')) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  if (ev.key === 'Escape') {
    if (!$('#tour').hidden) endTour();
    else if ($('#guard')) closeGuard();
    else if (!sheet.hidden) requestClose();
  }
  // Keep Tab inside an open dialog (the page behind is inert; this also wraps the ends).
  if (ev.key === 'Tab') {
    const box = $('#guard') || (!$('#tour').hidden && $('#tour .tip')) || (!sheet.hidden && sheet);
    if (!box) return;
    const items = [...box.querySelectorAll('button:not([disabled]), [href], input, textarea, select, [tabindex="0"]')].filter(x => !x.closest('[inert]') && x.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { ev.preventDefault(); first.focus(); }
  }
});
document.addEventListener('input', ev => {
  const el = ev.target, a = el.dataset.actInput; if (!a) return;
  if (a === 'ck-int') { ck.feelings[+el.dataset.i].i = +el.value; const word = STRENGTH[el.value - 1]; el.setAttribute('aria-valuetext', word); el.nextElementSibling.querySelector('.now').textContent = word; }
  if (a === 'ck-note') ck.note = el.value;
  if (a === 'ck-when') ck.when = el.value || null;
  if (a === 'tool-journal') runner.journal = el.value;
  if (a === 'j-search') { jSearch = el.value; const pos = el.selectionStart; renderJournal(); const n = $('#jsearch'); n.focus(); n.setSelectionRange(pos, pos); }
  if (a === 'rem') { state.settings.reminders[+el.dataset.i] = el.value; save(); }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.id === 'restore-file' && el.files[0]) { restore(el.files[0]); el.value = ''; }
  if (el.dataset.actInput === 'set') {
    const k = el.dataset.k; let v = el.value; if (k === 'faith') v = v === 'true';
    state.settings[k] = v; save(); if (k === 'theme') applyTheme();
  }
});
addEventListener('resize', () => { if (!$('#tour').hidden) drawTour(); });

/* ---------- start ---------- */
(async () => {
  await load();
  applyTheme();
  // Ask the browser to keep this app's storage. Installed apps and engaged sites usually get it.
  try {
    if (navigator.storage && navigator.storage.persist) {
      storagePersisted = await navigator.storage.persisted() || await navigator.storage.persist();
    }
  } catch {}
  go('today');
  if (pendingToast) toast(pendingToast);
  if (!state.seenTour) setTimeout(startTour, 400);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
