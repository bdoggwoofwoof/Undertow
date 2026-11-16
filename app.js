/* Undertow 1.2 — personal feelings check-in app. Data stays on this device. */
(() => {
'use strict';
const VERSION = '1.2';
const VERSION_DATE = 'Nov 15, 2026';
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
  schema: 2, entries: [], toolUses: [], kit: [], hiddenBuiltIns: [], customTools: [], customTags: { people: [], places: [], doing: [] }, hiddenTags: [],
  settings: { theme: 'auto', mode: 'field', arabic: 'off', faith: true, reminders: ['09:00', '20:00'] },
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
/* 1.1 tools you added become Toolkit skills (same ids, so "helped X of Y" carries over). */
const customToKit = t => ({ id: t.id, type: 'skill', title: t.name, body: '', steps: t.steps, q: t.q, needs: [], tags: [], min: t.min || 5, anywhere: true, source: '', fav: false, at: new Date().toISOString() });
const validCustom = t => t && typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.steps) && Array.isArray(t.q);
/* Saved data from 1.1 or earlier: Arabic now starts hidden, the grid became the field, tools became the Toolkit. */
function migrate(s) {
  if ((s.schema || 1) >= 2) return s;
  s.settings = s.settings || {};
  if (s.settings.arabic && s.settings.arabic !== 'off') s.settings.arabicWas = s.settings.arabic;
  s.settings.arabic = 'off';
  if (s.settings.mode !== 'wheel') s.settings.mode = 'field';
  s.kit = [...(Array.isArray(s.kit) ? s.kit : []), ...(Array.isArray(s.customTools) ? s.customTools : []).filter(validCustom).map(customToKit)];
  s.customTools = [];
  s.schema = 2;
  return s;
}
function merge(s) {
  s = migrate(s);
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
function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ar';
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('ar')); if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { toast('This browser has no Arabic voice.'); }
}

/* ---------- the feeling field ---------- */
/* Each word's place: quadrant, distance from the middle (0 mildest .. 10 strongest), and
   pleasantness and energy on a -2..2 scale for Patterns. */
const FMAP = {};
FIELD.forEach((row, r) => row.forEach((w, c) => {
  const top = r < 6, left = c < 6;
  const [def, sh, fu, tr] = WORDS[w];
  FMAP[w] = { w, sh, fu, tr, def, r, c, q: (top ? 'h' : 'l') + (left ? 'u' : 'p'),
    d: (top ? 5 - r : r - 6) + (left ? 5 - c : c - 6),
    p: +((c - 5.5) / 2.75).toFixed(2), e: +((5.5 - r) / 2.75).toFixed(2) };
}));
const fieldFeeling = w => { const f = FMAP[w]; return { w: f.w, sh: f.sh, fu: f.fu, tr: f.tr, q: f.q, p: f.p, e: f.e, src: 'grid' }; };
function wheelWord(pi, level) {
  const pet = WHEEL[pi], w = pet.words[level];
  const p = pet.p[level], e = pet.e[level];
  return { w: w[0], fu: w[1], tr: w[2], src: 'wheel', petal: pet.id, level, p, e, q: (e >= 0 ? 'h' : 'l') + (p >= 0 ? 'p' : 'u') };
}
function dyadWord(i) {
  const d = DYADS[i];
  return { w: d[0], fu: d[1], tr: d[2], src: 'wheel', dyad: i, p: d[3], e: d[4], q: (d[4] >= 0 ? 'h' : 'l') + (d[3] >= 0 ? 'p' : 'u') };
}
/* Every word you can pick, for search: the field plus the wheel. */
const ALL_WORDS = (() => {
  const out = FIELD.flat().map(fieldFeeling);
  WHEEL.forEach((_, i) => [0, 1, 2].forEach(l => out.push(wheelWord(i, l))));
  DYADS.forEach((_, i) => out.push(dyadWord(i)));
  return out;
})();
const defOf = w => (FMAP[w] && FMAP[w].def) || WHEEL_DEFS[w] || '';

/* ---------- tabs ---------- */
let tab = 'today';
const TITLES = { today: 'Today', journal: 'Journal', toolkit: 'Toolkit', more: 'More' };
function go(t) {
  if (t === 'patterns') { jView = 'patterns'; t = 'journal'; }
  if (t === 'tools') t = 'toolkit';
  tab = t;
  document.querySelectorAll('.tabs button').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#title').textContent = TITLES[t];
  render();
  window.scrollTo(0, 0);
}
function render() {
  ({ today: renderToday, journal: renderJournal, toolkit: renderToolkit, more: renderMore })[tab]();
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
    <button class="linkrow" data-act="quiz" id="t-quiz">Need something now? Help me choose<span class="d">A few quick questions, then the skills and affirmations from your toolkit that fit</span></button>
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
function newCk() {
  return { step: 0, mode: state.settings.mode === 'wheel' ? 'wheel' : 'field', petal: null, feelings: [], focus: null, search: '',
    fx: null, fy: null, body: [], tags: [], note: '', sleep: null, moved: null, when: null };
}
function startCheckin() {
  ck = newCk();
  ck.orig = ckFields(ck);
  drawCheckin();
}
/* Edit an existing check-in in the same editor, prefilled. */
function editCheckin(id) {
  const e = state.entries.find(x => x.id === id); if (!e || !isCheckin(e)) return;
  const local = new Date(e.at); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  ck = { ...newCk(), editId: id, mode: e.feelings.every(f => f.src === 'wheel') ? 'wheel' : 'field',
    feelings: e.feelings.map(f => ({ ...f })), body: [...(e.body || [])], tags: [...(e.tags || [])], note: e.note || '',
    sleep: e.sleep || null, moved: e.moved || null, when: local.toISOString().slice(0, 16) };
  ck.focus = (ck.feelings[0] || {}).w || null;
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
  for (const k of ['q', 'w', 'p', 'l', 'b', 't', 'k', 'v', 'i', 'm', 'f', 'g', 'id', 'json', 'step']) {
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
  ck = null; runner = null; kd = null; quiz = null; stopBreath(); render();
  let back = lastFocus && document.body.contains(lastFocus) ? lastFocus : (lastFocusSel && $(lastFocusSel));
  if (!back) { back = $('#title'); back.tabIndex = -1; }
  back.focus({ preventScroll: true });
  lastFocus = null; lastFocusSel = null;
}
/* Ask before throwing away work. Returns true when there is something to lose. */
function unsavedWork() {
  if (ck) return ckFields(ck) !== ck.orig;
  if (runner) return !!(runner.journal && runner.journal.trim());
  if (kd) return kdFields(kd) !== kd.orig;
  return false;
}
function requestClose() {
  if (sheet.hidden) return;
  if ($('#guard')) return;
  if (!unsavedWork()) return closeSheet();
  const what = ck ? (ck.editId ? 'your changes to this check-in' : 'this check-in') : kd ? (kd.id ? 'your changes' : 'this new item') : 'what you wrote';
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

const STEPS = ['Feelings', 'Details'];
function drawCheckin(keepScroll) {
  const y = sheet.scrollTop;
  const fw = $('#ck-field');
  if (fw) { ck.fx = fw.scrollLeft; ck.fy = fw.scrollTop; }
  const s = ck.step, n = ck.feelings.length;
  const body = s === 0 ? stepFeel() : stepDetails();
  const top = ck.editId
    ? `<button class="btn quiet" data-act="close">Cancel</button>
       <div class="seg" role="group" aria-label="Part of the check-in">${STEPS.map((l, i) => `<button data-act="ck-step" data-step="${i}" aria-pressed="${i === s}">${l}</button>`).join('')}</div><span></span>`
    : `<button class="btn quiet" data-act="${s ? 'ck-back' : 'close'}">${s ? 'Back' : 'Cancel'}</button>
      <span class="step">${s ? 'Optional details' : n ? `${n} of ${MAX_FEEL} picked` : ''}</span>`;
  const foot = ck.editId
    ? `<button class="btn primary" data-act="ck-save" ${n ? '' : 'disabled'}>${n ? 'Save changes' : 'Pick a feeling'}</button>`
    : s === 0
      ? `<button class="btn" data-act="ck-next" ${n ? '' : 'disabled'}>Add details</button><button class="btn primary" data-act="ck-save" ${n ? '' : 'disabled'}>${n ? 'Save' : 'Pick a feeling'}</button>`
      : `<button class="btn primary" data-act="ck-save">Save check-in</button>`;
  openSheet(`<div class="sheet-in">
    <div class="sheet-top ${ck.editId ? 'edit' : ''}">${top}</div>
    ${body}
  </div>
  <div class="sheet-foot"><div class="in">${foot}</div></div>`, keepScroll);
  if (keepScroll) sheet.scrollTop = y;
  placeField();
}
/* Keep the field where you left it; the first time, open on the middle, where the everyday words are. */
function placeField(zone, smooth) {
  const el = $('#ck-field'); if (!el) return;
  let x, y;
  if (zone) {
    const [r, c] = { hu: [2.5, 2.5], hp: [2.5, 8.5], lu: [8.5, 2.5], lp: [8.5, 8.5] }[zone];
    const cell = el.scrollWidth / 12;
    x = c * cell + cell / 2 - el.clientWidth / 2; y = r * cell + cell / 2 - el.clientHeight / 2;
  } else if (ck.fx != null) { x = ck.fx; y = ck.fy; }
  else { x = (el.scrollWidth - el.clientWidth) / 2; y = (el.scrollHeight - el.clientHeight) / 2; }
  el.scrollTo({ left: x, top: y, behavior: smooth ? 'smooth' : 'auto' });
}
function isPicked(w) { return ck.feelings.some(f => f.w === w); }
const arSpan = f => arOf(f) ? `<span class="ar" lang="ar" dir="rtl">${esc(arOf(f))}</span>` : '';
/* The words you use most, newest breaking ties. */
function usualWords(n) {
  const c = {}, last = {};
  state.entries.filter(isCheckin).forEach(e => e.feelings.forEach(f => { c[f.w] = (c[f.w] || 0) + 1; if (!last[f.w] || e.at > last[f.w].at) last[f.w] = { at: e.at, f }; }));
  return Object.keys(c).sort((a, b) => c[b] - c[a] || last[b].at.localeCompare(last[a].at)).slice(0, n).map(w => last[w].f);
}
function stepFeel() {
  const seg = `<div class="seg" role="group" aria-label="Check-in style"><button data-act="ck-mode" data-m="field" aria-pressed="${ck.mode === 'field'}">Words</button><button data-act="ck-mode" data-m="wheel" aria-pressed="${ck.mode === 'wheel'}">Wheel</button></div>`;
  const usual = usualWords(8);
  const usualHtml = usual.length && !ck.editId ? `<div class="usual"><span class="lbl2">Your usual</span><div class="chips">${usual.map(f => `<button class="chip" data-act="ck-pick" data-json='${esc(JSON.stringify(fieldOrWheel(f)))}' aria-pressed="${isPicked(f.w)}"><i class="cdot" style="background:${QCOL[f.q]}" aria-hidden="true"></i>${esc(f.w)}</button>`).join('')}</div></div>` : '';
  let inner;
  if (ck.mode === 'field') {
    let cells = '';
    FIELD.forEach(row => row.forEach(w => {
      const f = FMAP[w];
      const a = arOf({ ...f, src: 'grid' });
      cells += `<button class="fw${w.length > 10 ? ' long' : ''}" data-act="ck-fword" data-w="${esc(w)}" aria-pressed="${isPicked(w)}" style="--c:${QCOL[f.q]};--k:${Math.round(12 + f.d * 5)}%">${esc(w)}${a ? `<span class="ar" lang="ar" dir="rtl">${esc(a)}</span>` : ''}</button>`;
    }));
    inner = `<div class="zones" role="group" aria-label="Jump to an area">${[['hu', '↖'], ['hp', '↗'], ['lu', '↙'], ['lp', '↘']].map(([q, arr]) => `<button class="zone-btn" data-act="ck-zone" data-q="${q}" style="--c:${QCOL[q]}"><span aria-hidden="true">${arr}</span> ${QUADS[q].short}<span class="sr">: ${QUADS[q].name.toLowerCase()}</span></button>`).join('')}</div>
      <div class="field-wrap" id="ck-field" tabindex="-1"><div class="field" role="group" aria-label="Feeling words. Up is more energy, right is more pleasant.">${cells}</div></div>
      <p class="muted xs field-hint">Drag around to explore. Up is more energy, right is more pleasant, and the strongest feelings sit in the corners.</p>`;
  } else {
    inner = wheelSvg() + petalPanel();
  }
  return `<h2>How are you feeling?</h2>
    <div class="find"><label class="sr" for="ck-search">Search for a feeling</label><input id="ck-search" type="search" placeholder="Search feelings" autocomplete="off" value="${esc(ck.search)}" data-act-input="ck-search">${seg}</div>
    <div id="ck-results">${searchResults()}</div>
    <div id="ck-browse" ${ck.search.trim() ? 'hidden' : ''}>${usualHtml}${inner}</div>
    ${pickCard()}`;
}
/* A saved feeling, refreshed from the current word list when it still exists. */
function fieldOrWheel(f) { return f.src !== 'wheel' && FMAP[f.w] ? fieldFeeling(f.w) : { w: f.w, src: f.src, q: f.q, p: f.p, e: f.e, sh: f.sh, fu: f.fu, tr: f.tr }; }
function searchResults() {
  const s = ck.search.trim().toLowerCase();
  if (!s) return '';
  const scored = ALL_WORDS.map(f => {
    const w = f.w.toLowerCase(), d = defOf(f.w).toLowerCase();
    const sc = w.startsWith(s) ? 3 : w.includes(s) ? 2 : d.includes(s) ? 1 : 0;
    return { f, sc };
  }).filter(x => x.sc).sort((a, b) => b.sc - a.sc || a.f.w.localeCompare(b.f.w)).slice(0, 12);
  if (!scored.length) return `<p class="muted small">No words match “${esc(ck.search.trim())}”. Try a simpler word, or clear the search to browse.</p>`;
  return `<p class="muted xs" id="ck-res-n" aria-live="polite">${scored.length} match${scored.length === 1 ? '' : 'es'}</p><div class="results">${scored.map(({ f }) => `<button class="res" data-act="ck-pick" data-json='${esc(JSON.stringify(f))}' aria-pressed="${isPicked(f.w)}"><i class="qdot" style="background:${QCOL[f.q]}" aria-hidden="true"></i><span><b>${esc(f.w)}</b><span class="d">${esc(defOf(f.w))}${f.src === 'wheel' ? ' (wheel)' : ''}</span></span></button>`).join('')}</div>`;
}
/* The card for the feeling you're looking at: its meaning and how strong it is. Sticks above the Save bar. */
function pickCard() {
  if (!ck.feelings.length) return `<div class="pick-card empty-card" id="ck-picked"><p class="muted small" style="margin:0">Tap a word to see what it means. Pick up to ${MAX_FEEL}; mixed feelings are normal.</p></div>`;
  let i = ck.feelings.findIndex(f => f.w === ck.focus); if (i < 0) i = ck.feelings.length - 1;
  const f = ck.feelings[i];
  const others = ck.feelings.length > 1 ? `<div class="chips picked-chips" role="group" aria-label="Your picks">${ck.feelings.map((x, k) => `<button class="chip small" data-act="ck-focus" data-w="${esc(x.w)}" aria-pressed="${k === i}"><i class="cdot" style="background:${QCOL[x.q]}" aria-hidden="true"></i>${esc(x.w)}</button>`).join('')}</div>` : '';
  return `<div class="pick-card" id="ck-picked" style="--c:${QCOL[f.q]}">
    <div class="row between nowrap"><div><span class="pw">${esc(f.w)}</span>${arSpan(f)}${arOf(f) && f.tr ? `<div class="tr">${esc(f.tr)}</div>` : ''}</div>
      <div class="row nowrap">${arOf(f) ? `<button class="say" data-act="say" data-i="${i}" aria-label="Hear it in Arabic">▸</button>` : ''}<button class="btn quiet" data-act="ck-unpick" data-i="${i}" aria-label="Remove ${esc(f.w)}">Remove</button></div></div>
    <p class="def">${esc(defOf(f.w))}</p>
    <label class="sr" for="int${i}">How strong is ${esc(f.w)}?</label>
    <input class="range" id="int${i}" type="range" min="1" max="5" value="${f.i}" aria-valuetext="${STRENGTH[f.i - 1]}" data-act-input="ck-int" data-i="${i}">
    <div class="range-labels" aria-hidden="true"><span>a little</span><span class="now">${STRENGTH[f.i - 1]}</span><span>very</span></div>
    ${others}</div>`;
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
  const chip = (f, lab) => `<button class="chip" data-act="ck-pick" data-json='${esc(JSON.stringify(f))}' aria-pressed="${isPicked(f.w)}">${esc(lab || f.w)}</button>`;
  const prev = (i + 7) % 8;
  return `<div class="petal-pick"><h3>${pet.id}</h3>
    <div class="chips">${[2, 1, 0].map(l => chip(wheelWord(i, l), pet.words[l][0] + (l === 2 ? ' (mild)' : l === 0 ? ' (strong)' : ''))).join('')}</div>
    <p class="muted xs" style="margin:10px 0 6px">Blends with its neighbours</p>
    <div class="chips">${chip(dyadWord(prev), `${DYADS[prev][0]} (${WHEEL[prev].id} + ${pet.id})`)}${chip(dyadWord(i), `${DYADS[i][0]} (${pet.id} + ${WHEEL[(i + 1) % 8].id})`)}</div></div>`;
}
/* Tap once to pick a word (and read its meaning); tap a picked word again to let it go. */
function addFeeling(f) {
  const at = ck.feelings.findIndex(x => x.w === f.w);
  if (at >= 0) {
    if (ck.focus !== f.w) { ck.focus = f.w; return; }
    ck.feelings.splice(at, 1); ck.focus = (ck.feelings[ck.feelings.length - 1] || {}).w || null; return;
  }
  if (ck.feelings.length >= MAX_FEEL) { toast(`Up to ${MAX_FEEL} feelings. Remove one first.`); return; }
  ck.feelings.push({ ...f, i: 3 }); ck.focus = f.w;
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
function stepDetails() {
  const dom = ck.feelings.slice().sort((a, b) => b.i - a.i)[0];
  const group = (g, label) => `<h3 class="lbl">${label}</h3><div class="chips">${tagsFor(g).map(t => `<button class="chip" data-act="ck-tag" data-t="${esc(t)}" aria-pressed="${ck.tags.includes(t)}">${esc(t)}</button>`).join('')}<button class="chip add" data-act="ck-addtag" data-g="${g}">+ Add</button></div>`;
  const opt = (k, v, l) => `<button class="chip" data-act="ck-opt" data-k="${k}" data-v="${v}" aria-pressed="${ck[k] === v}">${l}</button>`;
  const now = new Date(ck.when || Date.now()); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const names = ck.feelings.map(f => f.w).join(', ');
  return `<h2>Anything else?</h2><p class="muted">All optional${names ? ` for <b>${esc(names)}</b>` : ''}. Tags are what make Patterns useful.</p>
  <h3 class="lbl">Where you feel it</h3>
  <div class="bodywrap">${bodySvg()}<div class="chips">${BODY.map(b => `<button class="chip" data-act="ck-body" data-b="${b[0]}" aria-pressed="${ck.body.includes(b[0])}">${b[1]}</button>`).join('')}</div></div>
  ${group('people', 'Who with')}${group('places', 'Where')}${group('doing', 'Doing')}
  <h3 class="lbl">Sleep last night</h3><div class="chips">${opt('sleep', 'short', 'Short')}${opt('sleep', 'ok', 'OK')}${opt('sleep', 'good', 'Good')}</div>
  <h3 class="lbl">Moved your body today</h3><div class="chips">${opt('moved', 'yes', 'Yes')}${opt('moved', 'no', 'Not yet')}</div>
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
/* What we know about how you feel, for suggestions. */
const feelAsk = e => { const top = e.feelings.slice().sort((a, b) => b.i - a.i)[0]; return { q: top.q, words: e.feelings.map(f => f.w), i: top.i }; };
function afterSave(e) {
  const a = feelAsk(e);
  const ranked = rankKit(a);
  const picks = ranked.filter(x => x.it.type === 'skill').slice(0, 3);
  const hold = ranked.find(x => x.it.type !== 'skill' && x.s > 0);
  ck = null;
  openSheet(`<div class="sheet-in"><div class="sheet-top"><span></span><button class="btn quiet" data-act="close">Done</button></div>
    <h2>Logged.</h2>
    <p>${e.feelings.map(f => `<b>${esc(f.w)}</b>`).join(', ')}${e.body.length ? ` · felt in your ${e.body.map(b => (BODY.find(x => x[0] === b) || [b, b])[1].toLowerCase()).join(', ')}` : ''}.</p>
    <p class="muted">Naming it is already doing something.${picks.length ? ' Want to try something from your toolkit?' : ''}</p>
    ${hold ? quoteCard(hold.it, e.id) : ''}
    ${picks.map(x => kitRow(x.it, e.id, x.why)).join('')}
    <div class="row" style="margin-top:16px"><button class="btn" data-act="quiz" data-id="${esc(e.id)}">Help me choose</button><button class="btn quiet" data-act="close">Not now</button></div>
    ${a.q === 'lu' || a.i >= 4 && unpleasant(a.q) ? crisisLine() : ''}</div>`);
}
const crisisLine = () => `<p class="crisis">If you're in crisis or thinking about hurting yourself, call or text <b>988</b> (US) any time, or text HOME to 741741.</p>`;

/* ---------- Toolkit ---------- */
const TYPE = Object.fromEntries(KIT_TYPES.map(([k, one, many]) => [k, { one, many }]));
const NEED = Object.fromEntries(NEEDS);
function builtIns(all) {
  return TOOLS.filter(t => all || ((state.settings.faith || !t.optional) && !state.hiddenBuiltIns.includes(t.id)))
    .map(t => ({ id: t.id, type: 'skill', title: t.name, body: t.why, steps: t.steps, q: t.q, needs: t.needs, tags: [], min: t.min, anywhere: t.anywhere, kind: t.kind, timer: t.timer, journal: t.journal, builtIn: true }));
}
const kitAll = () => [...state.kit, ...builtIns()];
/* Finds an item even if it's hidden, so old check-ins and stats still have a name. */
const findItem = id => state.kit.find(x => x.id === id) || builtIns(true).find(x => x.id === id);
const itemName = id => (findItem(id) || { title: 'a tool that was deleted' }).title;
function toolStats(id) {
  const u = state.toolUses.filter(x => x.id === id && x.result != null);
  const helped = u.filter(x => x.result > 0).length;
  return { n: u.length, helped, avg: u.length ? u.reduce((s, x) => s + x.result, 0) / u.length : 0 };
}
/* How well an item fits: feelings it's tagged for, its zone, the need, the time you have,
   whether people are around, and whether it has helped before. Your own items come first. */
function scoreItem(it, a) {
  let s = 0; const why = [];
  const tags = (it.tags || []).map(t => t.toLowerCase());
  const hitWords = (a.words || []).filter(w => tags.includes(w.toLowerCase()));
  if (hitWords.length) { s += 5; why.push(`tagged ${hitWords.join(', ')}`); }
  if (a.q) { if ((it.q || []).includes(a.q)) s += 3; else if ((it.q || []).length) s -= 2; }
  if (a.need) { if ((it.needs || []).includes(a.need)) { s += 4; why.push(NEED[a.need].toLowerCase()); } else s -= 1; }
  if (a.time && it.type === 'skill' && (it.min || 5) > a.time) s -= 5;
  if (a.alone === false && it.anywhere === false) s -= 4;
  if (a.i >= 4 && (it.needs || []).includes('think') && !(it.needs || []).some(n => n === 'calm' || n === 'ground')) s -= 2;
  if (a.i >= 4 && (it.needs || []).some(n => n === 'calm' || n === 'ground')) s += 1;
  if (!it.builtIn) { s += 2; why.unshift('yours'); }
  if (it.fav) s += 1;
  const st = toolStats(it.id);
  if (st.n) { s += 3 * st.helped / st.n - 1; why.push(`helped ${st.helped} of ${st.n}`); }
  return { it, s, why };
}
const rankKit = a => kitAll().map(it => scoreItem(it, a)).filter(x => x.s > 0).sort((x, y) => y.s - x.s || (x.it.min || 0) - (y.it.min || 0));
function kitRow(it, entryId, why) {
  if (it.type !== 'skill') return quoteCard(it, entryId, why);
  const s = toolStats(it.id);
  const sub = why && why.length ? why.join(' · ') : `${it.builtIn ? it.kind : TYPE.skill.one}${it.min ? ` · about ${it.min} min` : ''}${!it.builtIn && it.tags && it.tags.length ? ' · ' + it.tags.join(', ') : ''}`;
  return `<button class="tool" data-act="run-tool" data-id="${esc(it.id)}" ${entryId ? `data-entry="${esc(entryId)}"` : ''}>
    <span><span class="n">${it.fav ? '<span aria-label="Favorite">★ </span>' : ''}${esc(it.title)}</span><span class="qdots" aria-hidden="true">${(it.q || []).map(q => `<i style="background:${QCOL[q]}"></i>`).join('')}</span>
    <span class="k" style="display:block">${esc(sub)}</span></span>
    <span class="h">${s.n && !(why && why.length) ? `helped ${s.helped} of ${s.n}` : ''}</span></button>`;
}
function quoteCard(it, entryId, why) {
  const sub = why && why.length ? why.join(' · ') : [TYPE[it.type].one, it.source].filter(Boolean).join(' · ');
  return `<button class="kit-quote ${it.type}" data-act="run-tool" data-id="${esc(it.id)}" ${entryId ? `data-entry="${esc(entryId)}"` : ''}>
    <span class="t">${esc(it.title)}</span>${it.type === 'note' && it.body ? `<span class="b">${esc(it.body)}</span>` : ''}<span class="k">${esc(sub)}</span></button>`;
}
let kitType = 'all', kitSearch = '';
function renderToolkit() {
  const s = kitSearch.trim().toLowerCase();
  const match = it => (kitType === 'all' || it.type === kitType) && (!s || JSON.stringify([it.title, it.body, it.steps, it.tags, it.source]).toLowerCase().includes(s));
  const mine = state.kit.filter(match).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (b.at || '').localeCompare(a.at || ''));
  const built = builtIns().filter(match);
  const tried = built.filter(t => toolStats(t.id).n).sort((a, b) => toolStats(b.id).avg - toolStats(a.id).avg);
  const rest = built.filter(t => !toolStats(t.id).n);
  const hidden = state.hiddenBuiltIns.length;
  view.innerHTML = `<section class="hero kit-hero">
    <p style="margin:0 0 12px">Your skills, affirmations and notes from therapy, in one place. Tag them with the feelings they help with, and <b>Help me choose</b> will find them when you need them.</p>
    <button class="btn primary block" data-act="quiz" id="k-quiz">Help me choose</button>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="kit-add" style="flex:1">Add your own</button><button class="btn" data-act="kit-starters" style="flex:1">Starter ideas</button></div>
  </section>
  <label class="sr" for="ksearch">Search your toolkit</label><input id="ksearch" type="search" placeholder="Search your toolkit" value="${esc(kitSearch)}" data-act-input="k-search">
  <div class="chips" role="group" aria-label="Show" style="margin:12px 0">${[['all', 'All'], ...KIT_TYPES.map(([k, , many]) => [k, many])].map(([k, l]) => `<button class="chip" data-act="kit-type" data-f="${k}" aria-pressed="${kitType === k}">${l}</button>`).join('')}</div>
  <h2>Yours</h2>
  ${mine.length ? mine.map(it => kitRow(it)).join('') : state.kit.length ? `<p class="muted">Nothing of yours matches.</p>` : `<div class="empty">Nothing of yours yet. Add a skill, affirmation or note from therapy, or start from the starter ideas.</div>`}
  ${built.length ? `<h2>Built in</h2>${tried.map(t => kitRow(t)).join('')}${rest.map(t => kitRow(t)).join('')}` : ''}
  ${hidden && (kitType === 'all' || kitType === 'skill') && !s ? `<button class="btn quiet" data-act="kit-unhide" style="margin-top:8px">Show ${hidden} hidden built-in skill${hidden === 1 ? '' : 's'}</button>` : ''}
  ${crisisLine()}`;
}
let runner = null;
function runTool(id, entryId) {
  const t = findItem(id);
  if (!t) return;
  runner = { t, entryId, result: null, journal: '' };
  drawRunner();
}
function drawRunner() {
  const { t } = runner;
  const res = [[-1, 'Worse'], [0, 'About the same'], [1, 'A bit better'], [2, 'Better']];
  const quote = t.type === 'affirmation' || t.type === 'reminder';
  const st = toolStats(t.id);
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">${esc(t.builtIn ? t.kind : TYPE[t.type].one)}</span>${t.builtIn ? '' : `<button class="btn quiet" data-act="kit-edit" data-id="${esc(t.id)}">Edit</button>`}</div>
    <h2 class="${quote ? 'say-big' : ''}">${esc(t.title)}</h2>
    ${quote ? `<p class="muted">Read it slowly. Out loud, if you can.</p>` : ''}
    ${t.body ? `<p class="${t.type === 'note' ? 'entry-note' : 'muted'}">${esc(t.body)}</p>` : ''}
    ${t.timer === 'box' ? `<div class="breather"><div class="ring" id="ring"></div><div class="lbl2" id="phase">Ready</div></div><div style="text-align:center"><button class="btn" data-act="breath">Start</button></div>` : ''}
    ${t.steps && t.steps.length ? `<ol class="steps">${t.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${!t.builtIn && (t.tags || []).length + (t.needs || []).length ? `<p class="muted small">${[...(t.needs || []).map(n => NEED[n]), ...(t.tags || [])].map(esc).join(' · ')}</p>` : ''}
    ${t.source ? `<p class="muted small">From: ${esc(t.source)}</p>` : ''}
    ${t.journal ? `<label class="lbl" for="tj">Write it here (optional, saved to your journal)</label><textarea id="tj" data-act-input="tool-journal">${esc(runner.journal)}</textarea>` : ''}
    <h3>${quote || t.type === 'note' ? 'Did it help?' : 'Compared to before, you feel…'}</h3>
    <div class="chips">${res.map(([v, l]) => `<button class="chip" data-act="tool-res" data-v="${v}" aria-pressed="${runner.result === v}">${l}</button>`).join('')}</div>
    ${st.n ? `<p class="muted xs" style="margin-top:8px">Helped ${st.helped} of ${st.n} times so far.</p>` : ''}
    ${t.builtIn ? `<div style="margin-top:28px"><button class="btn quiet" data-act="kit-hide" data-id="${esc(t.id)}">Hide from my toolkit</button></div>` : ''}
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
    if (note) { e.note = (e.note ? e.note + '\n\n' : '') + `${t.title}: ${note}`; savedNote = true; }
  } else if (note) {
    // Opened from the Toolkit: keep the writing as its own journal entry.
    state.entries.push({ id: uid(), at, feelings: [], body: [], tags: [], note, toolOnly: true, toolName: t.title, tool: { id: t.id, result } });
    savedNote = true;
  }
  state.toolUses.push({ id: t.id, at, entryId: e ? e.id : null, result });
  save(); stopBreath(); runner = null;
  closeSheet();
  const how = result > 0 ? 'Glad it helped.' : 'Good to know what doesn\'t help, too.';
  toast(savedNote ? `${how} Your note is in the Journal.` : `${how} Saved.`);
}

/* ---------- adding and editing your own items ---------- */
let kd = null;
const kdFields = k => JSON.stringify([k.type, k.title.trim(), k.body.trim(), k.steps.trim(), k.q, k.needs, k.tags.trim(), k.min, k.anywhere, k.source.trim(), k.fav]);
function editKit(id, from) {
  const it = id && state.kit.find(x => x.id === id);
  const src = it || from || {};
  runner = null;
  kd = { id: it ? it.id : null, type: src.type || 'skill', title: src.title || '', body: src.body || '', steps: (src.steps || []).join('\n'),
    q: [...(src.q || [])], needs: [...(src.needs || [])], tags: (src.tags || []).join(', '), min: src.min || 5,
    anywhere: src.anywhere !== false, source: src.source || '', fav: !!src.fav };
  kd.orig = it ? kdFields(kd) : kdFields({ ...kd, title: '', body: '', steps: '', q: [], needs: [], tags: '', source: '' });
  drawKitEdit();
}
function drawKitEdit(keep) {
  const k = kd, skill = k.type === 'skill';
  const titleL = { skill: 'Name', affirmation: 'Affirmation', reminder: 'Reminder', note: 'Title' }[k.type];
  const titleP = { skill: 'e.g. TIPP, Wise mind, Call my sister', affirmation: 'e.g. I am safe right now.', reminder: 'e.g. Feelings pass.', note: 'e.g. What Sarah said about boundaries' }[k.type];
  const bodyL = { skill: 'What it is, or why it helps (optional)', affirmation: 'When to use it (optional)', reminder: 'More detail (optional)', note: 'Note' }[k.type];
  const big = k.type === 'affirmation' || k.type === 'reminder';
  const chip = (act, v, label, on) => `<button class="chip" data-act="${act}" data-v="${v}" aria-pressed="${on}">${label}</button>`;
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Cancel</button><span class="step">${k.id ? 'Edit' : 'New'}</span><span></span></div>
  <h2>${k.id ? 'Edit' : 'Add to your toolkit'}</h2>
  <div class="seg wrap" role="group" aria-label="Kind">${KIT_TYPES.map(([v, l]) => `<button data-act="kd-type" data-v="${v}" aria-pressed="${k.type === v}">${l}</button>`).join('')}</div>
  <label class="lbl" for="kd-title">${titleL}</label>
  ${big ? `<textarea id="kd-title" class="short" placeholder="${esc(titleP)}" data-act-input="kd" data-k="title">${esc(k.title)}</textarea>` : `<input id="kd-title" type="text" placeholder="${esc(titleP)}" value="${esc(k.title)}" data-act-input="kd" data-k="title">`}
  <label class="lbl" for="kd-body">${bodyL}</label>
  <textarea id="kd-body" class="${k.type === 'note' ? '' : 'short'}" data-act-input="kd" data-k="body">${esc(k.body)}</textarea>
  ${skill ? `<label class="lbl" for="kd-steps">Steps, one per line (optional)</label><textarea id="kd-steps" placeholder="What you do, in order" data-act-input="kd" data-k="steps">${esc(k.steps)}</textarea>` : ''}
  <h3 class="lbl">Good when I'm feeling</h3>
  <div class="chips">${QORDER.map(q => chip('kd-q', q, `<i class="cdot" style="background:${QCOL[q]}" aria-hidden="true"></i>${QUADS[q].short}`, k.q.includes(q))).join('')}</div>
  <label class="lbl" for="kd-tags">Feelings and tags</label>
  <input id="kd-tags" type="text" placeholder="e.g. anxious, panic, angry, work, DBT" value="${esc(k.tags)}" aria-describedby="kd-tags-d" data-act-input="kd" data-k="tags">
  <p class="muted xs" id="kd-tags-d" style="margin-top:6px">Separate with commas. Feeling words here (like anxious or lonely) are how Help me choose finds it after you log that feeling.</p>
  <h3 class="lbl">It helps me</h3>
  <div class="chips">${NEEDS.map(([v, l]) => chip('kd-need', v, l, k.needs.includes(v))).join('')}</div>
  ${skill ? `<h3 class="lbl">Takes about</h3><div class="chips">${[[1, '1 minute'], [5, '5 minutes'], [15, '15 minutes or more']].map(([v, l]) => chip('kd-min', v, l, k.min === v)).join('')}</div>
  <h3 class="lbl">Can I do it with people around?</h3><div class="chips">${chip('kd-any', 'yes', 'Yes', k.anywhere)}${chip('kd-any', 'no', 'Better alone', !k.anywhere)}</div>` : ''}
  <label class="lbl" for="kd-source">From (optional)</label>
  <input id="kd-source" type="text" placeholder="e.g. therapy, DBT group, a book" value="${esc(k.source)}" data-act-input="kd" data-k="source">
  <div style="margin-top:16px">${chip('kd-fav', 'fav', '★ Favorite', k.fav)}</div>
  ${k.id ? `<div style="margin-top:28px"><button class="btn danger" data-act="kd-del" data-id="${esc(k.id)}">Delete</button></div>` : ''}
  </div><div class="sheet-foot"><div class="in"><button class="btn primary" data-act="kd-save">Save</button></div></div>`, keep);
}
function saveKit() {
  const k = kd;
  if (!k.title.trim()) { toast(k.type === 'skill' ? 'Give it a name.' : 'Write the words first.'); const t = $('#kd-title'); if (t) t.focus(); return; }
  const item = { id: k.id || 'k-' + uid(), type: k.type, title: k.title.trim().slice(0, 300), body: k.body.trim(),
    steps: k.type === 'skill' ? k.steps.split('\n').map(s => s.trim()).filter(Boolean) : [],
    q: k.q, needs: k.needs, tags: [...new Set(k.tags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    min: k.type === 'skill' ? k.min : 1, anywhere: k.type === 'skill' ? k.anywhere : true, source: k.source.trim(), fav: k.fav };
  const at = state.kit.findIndex(x => x.id === item.id);
  if (at >= 0) state.kit[at] = { ...state.kit[at], ...item }; else state.kit.push({ ...item, at: new Date().toISOString() });
  save(); kd = null; closeSheet(); toast(at >= 0 ? 'Saved.' : `Added to your toolkit.`);
}
function startersSheet() {
  const have = new Set(state.kit.map(x => x.title.toLowerCase()));
  const groups = KIT_TYPES.filter(([k]) => STARTERS.some(s => s.type === k));
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">Starter ideas</span><span></span></div>
  <h2>Starter ideas</h2>
  <p class="muted">Common skills from therapy, described in plain words, and a few affirmations. Add any that fit, then edit them to match how your therapist taught them. Your own words always work better than these.</p>
  ${groups.map(([k, , many]) => `<h3>${many}</h3>${STARTERS.map((s, i) => [s, i]).filter(([s]) => s.type === k).map(([s, i]) => {
    const added = have.has(s.title.toLowerCase());
    return `<div class="starter"><div><b>${esc(s.title)}</b>${s.body ? `<span class="d">${esc(s.body)}</span>` : ''}${s.source ? `<span class="d xs">${esc(s.source)}</span>` : ''}</div>
      <button class="btn ${added ? 'quiet' : ''}" data-act="starter-add" data-i="${i}" ${added ? 'disabled' : ''} aria-label="${added ? 'Added' : 'Add'}: ${esc(s.title)}">${added ? 'Added' : 'Add'}</button></div>`;
  }).join('')}`).join('')}
  </div>`, true);
}

/* ---------- Help me choose ---------- */
let quiz = null;
const QUIZ_STEPS = ['feel', 'strength', 'need', 'time', 'who'];
function startQuiz(entryId) {
  runner = null; kd = null;
  quiz = { step: 0, q: null, words: [], i: null, need: null, time: null, alone: null, entryId: entryId || null };
  const e = entryId ? state.entries.find(x => x.id === entryId) : null;
  if (e && isCheckin(e)) { Object.assign(quiz, feelAsk(e)); quiz.from = e; quiz.locked = true; quiz.step = 2; }
  drawQuiz();
}
function drawQuiz() {
  const z = quiz, step = QUIZ_STEPS[z.step];
  const opt = (act, v, label, d, on) => `<button class="opt" data-act="${act}" data-v="${esc(v)}" aria-pressed="${!!on}">${label}${d ? `<span class="d">${d}</span>` : ''}</button>`;
  let h = '', body = '';
  if (step === 'feel') {
    const recent = state.entries.filter(e => isCheckin(e) && daysSince(e.at) < 3 / 24).sort((a, b) => b.at.localeCompare(a.at))[0];
    h = 'What are you feeling?';
    body = `${recent ? `<div class="quiz-opts">${opt('qz-recent', recent.id, `Same as my last check-in`, esc(recent.feelings.map(f => f.w).join(', ')) + ' · ' + fmtTime(recent.at))}</div><p class="muted small" style="margin:16px 0 8px">Or pick one:</p>` : ''}
      <div class="quiz-opts two">${QORDER.map(q => `<button class="opt quad-opt" data-act="qz-q" data-v="${q}" aria-pressed="${z.q === q}" style="--c:${QCOL[q]}"><b>${QUADS[q].short}</b><span class="d">${QUADS[q].name}</span></button>`).join('')}</div>
      ${usualWords(6).length ? `<p class="muted small" style="margin:16px 0 8px">Or a word you use a lot:</p><div class="chips">${usualWords(6).map(f => `<button class="chip" data-act="qz-word" data-v="${esc(f.w)}" data-q="${f.q}"><i class="cdot" style="background:${QCOL[f.q]}" aria-hidden="true"></i>${esc(f.w)}</button>`).join('')}</div>` : ''}`;
  } else if (step === 'strength') {
    h = 'How strong is it?';
    body = `<div class="quiz-opts">${STRENGTH.map((s, i) => opt('qz-i', i + 1, s[0].toUpperCase() + s.slice(1), '', z.i === i + 1)).join('')}</div>`;
  } else if (step === 'need') {
    h = 'What would help most?';
    const order = unpleasant(z.q) ? ['calm', 'ground', 'comfort', 'connect', 'think', 'lift', 'rest', 'energy', 'savor'] : ['savor', 'energy', 'connect', 'rest', 'calm', 'lift', 'think', 'ground', 'comfort'];
    body = `${z.from ? `<p class="muted">For <b>${esc(z.words.join(', '))}</b>, ${STRENGTH[z.i - 1]}.</p>` : ''}<div class="quiz-opts">${order.map(n => opt('qz-need', n, NEED[n], '', z.need === n)).join('')}${opt('qz-need', '', 'Not sure', '', false)}</div>`;
  } else if (step === 'time') {
    h = 'How much time do you have?';
    body = `<div class="quiz-opts">${opt('qz-time', 1, 'About a minute', '', z.time === 1)}${opt('qz-time', 5, 'A few minutes', '', z.time === 5)}${opt('qz-time', 60, 'Fifteen minutes or more', '', z.time === 60)}</div>`;
  } else if (step === 'who') {
    h = 'Who\'s around?';
    body = `<div class="quiz-opts">${opt('qz-who', 'alone', 'Just me', '', z.alone === true)}${opt('qz-who', 'people', 'Other people', 'Things you can do quietly, without anyone noticing', z.alone === false)}</div>`;
  } else return drawQuizResults();
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="${z.step && !(z.locked && z.step === 2) ? 'qz-back' : 'close'}">${z.step && !(z.locked && z.step === 2) ? 'Back' : 'Cancel'}</button>
    <div class="progress" aria-hidden="true">${QUIZ_STEPS.map((_, i) => `<i class="${i <= z.step ? 'on' : ''}"></i>`).join('')}</div><span class="step">Help me choose</span></div>
    <h2>${h}</h2>${body}</div>`);
}
function drawQuizResults() {
  const z = quiz;
  const ranked = rankKit(z);
  const skills = ranked.filter(x => x.it.type === 'skill');
  const words = ranked.filter(x => x.it.type !== 'skill');
  const mineCount = state.kit.length;
  const feelLine = z.words.length ? z.words.join(', ') : QUADS[z.q].short.toLowerCase();
  openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="qz-back">Back</button><span class="step">Help me choose</span><button class="btn quiet" data-act="close">Done</button></div>
    <h2>Try one of these</h2>
    <p class="muted">For ${esc(feelLine)}, ${STRENGTH[(z.i || 3) - 1]}${z.need ? `, to ${NEED[z.need].toLowerCase()}` : ''}${z.time ? `, ${z.time === 1 ? 'in a minute' : z.time === 5 ? 'in a few minutes' : 'with some time'}` : ''}${z.alone === false ? ', with people around' : ''}.</p>
    ${skills.length ? skills.slice(0, 3).map(x => kitRow(x.it, z.entryId, x.why)).join('') : `<p class="muted">Nothing fits all of that. Try a different need or more time.</p>`}
    ${words.length ? `<h3>Something to hold on to</h3>${words.slice(0, 2).map(x => quoteCard(x.it, z.entryId, x.why)).join('')}` : ''}
    ${skills.length > 3 ? `<details class="more"><summary>More ideas (${Math.min(skills.length - 3, 6)})</summary>${skills.slice(3, 9).map(x => kitRow(x.it, z.entryId, x.why)).join('')}</details>` : ''}
    ${mineCount < 3 ? `<p class="muted small" style="margin-top:16px">Your own skills from therapy show up first once you add them and tag them with feelings. <button class="btn quiet" data-act="kit-add">Add one</button></p>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn" data-act="quiz">Start over</button></div>
    ${unpleasant(z.q) && (z.i || 0) >= 4 ? crisisLine() : ''}</div>`);
}

/* ---------- Journal ---------- */
let jFilter = 'all', jSearch = '', jView = 'entries';
const jSeg = () => `<div class="seg jseg" role="group" aria-label="Show">${[['entries', 'Entries'], ['patterns', 'Patterns']].map(([v, l]) => `<button data-act="j-view" data-v="${v}" aria-pressed="${jView === v}" ${v === 'patterns' ? 'id="j-patterns"' : ''}>${l}</button>`).join('')}</div>`;
function renderJournal() {
  if (jView === 'patterns') return renderPatterns();
  let list = state.entries.slice().sort((a, b) => b.at.localeCompare(a.at));
  if (jFilter !== 'all') list = list.filter(e => e.feelings.some(f => f.q === jFilter));
  if (jSearch) { const s = jSearch.toLowerCase(); list = list.filter(e => JSON.stringify([e.feelings.map(f => f.w), e.tags, e.note, e.body]).toLowerCase().includes(s)); }
  let html = `${jSeg()}<div class="chips" style="margin-bottom:12px"><button class="chip" data-act="j-filter" data-f="all" aria-pressed="${jFilter === 'all'}">All</button>${QORDER.map(q => `<button class="chip" data-act="j-filter" data-f="${q}" aria-pressed="${jFilter === q}">${QUADS[q].short}</button>`).join('')}</div>
  <label class="sr" for="jsearch">Search</label><input id="jsearch" type="text" placeholder="Search words, tags and notes" value="${esc(jSearch)}" data-act-input="j-search">`;
  if (!state.entries.length) html += `<div class="empty" style="margin-top:16px">Your check-ins will show up here, newest first.</div>`;
  else if (!list.length) html += `<p class="muted" style="margin-top:16px">Nothing matches.</p>`;
  let last = '';
  list.forEach(e => { const k = dayKey(e.at); if (k !== last) { html += `<div class="dayhead">${isToday(e.at) ? 'Today' : fmtDay(e.at)}</div>`; last = k; } html += entryRow(e); });
  view.innerHTML = html;
}
function openEntry(id) {
  const e = state.entries.find(x => x.id === id); if (!e) return;
  const tool = e.tool && findItem(e.tool.id);
  const resL = { '-1': 'worse', '0': 'about the same', '1': 'a bit better', '2': 'better' };
  const sl = { short: 'Short sleep', ok: 'OK sleep', good: 'Good sleep' };
  const eid = esc(e.id);
  const when = `${fmtDay(e.at)}, ${fmtTime(e.at)}`;
  if (!isCheckin(e)) {
    // A note written in a tool: only the note can change.
    openSheet(`<div class="sheet-in"><div class="sheet-top"><button class="btn quiet" data-act="close">Close</button><span class="step">${when}</span></div>
      <h2>Note from ${esc(e.toolName || (tool && tool.title) || 'a tool')}</h2>
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
    ${tool ? `<p class="muted">Tried ${esc(tool.title)}: felt ${resL[e.tool.result] || ''} after.</p>` : ''}
    <h3>Note</h3>${e.note ? `<p class="entry-note">${esc(e.note)}</p>` : `<p class="muted">No note. Tap Edit to add one.</p>`}
    <div class="row" style="margin-top:12px"><button class="btn" data-act="run-tool-pick" data-id="${eid}">Help me choose a skill</button></div>
    <div style="margin-top:28px"><button class="btn danger" data-act="en-del" data-id="${eid}">Delete check-in</button></div></div>`);
}

/* ---------- Patterns ---------- */
let pRange = 30;
function renderPatterns() {
  const since = pRange ? Date.now() - pRange * 864e5 : 0;
  const es = state.entries.filter(e => isCheckin(e) && new Date(e.at) >= since);
  const rangeSeg = `<div class="seg" role="group" aria-label="Range">${[[7, '7 days'], [30, '30 days'], [0, 'All']].map(([v, l]) => `<button data-act="p-range" data-v="${v}" aria-pressed="${pRange === v}">${l}</button>`).join('')}</div>`;
  if (es.length < 5) {
    view.innerHTML = `${jSeg()}${rangeSeg}<div class="empty" style="margin-top:16px">Patterns show up after about 5 check-ins in this range. You have ${es.length}.<br><br>Tags, sleep and movement make them sharper.</div>`;
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
  const nm = itemName;
  view.innerHTML = `${jSeg()}${rangeSeg}
  <h2>The mix</h2><p class="muted small">${tot} check-ins. ${pct(U)}% leaned unpleasant, ${100 - pct(U)}% pleasant.</p>
  <div class="mixbar">${mix}</div><div class="legend">${QORDER.map(q => `<span><i style="background:${QCOL[q]}"></i>${QUADS[q].short} ${counts[q]}</span>`).join('')}</div>
  <h2>Every feeling, placed</h2><p class="muted small">Up is more energy, right is more pleasant. Bigger dots were stronger.</p>${scatter}
  <h2>By time of day</h2>${todHtml}
  <h2>What stands out</h2>${F.length ? F.map(f => `<div class="finding"><b>${esc(f[0])}</b><span class="muted">${esc(f[1])}</span></div>`).join('') : `<p class="muted">Nothing stands out yet. Tags, sleep and movement give Patterns more to compare.</p>`}
  <h2>Words you used most</h2><p>${wTop.map(([w, n]) => `${esc(w)} <span class="muted small">×${n}</span>`).join(' · ')}</p>
  ${tTop.length ? `<h2>Skills that helped</h2>${tTop.map(([id, s]) => `<div class="finding"><b>${esc(nm(id))}</b><span class="muted">Helped ${s.h} of ${s.n} ${s.n === 1 ? 'try' : 'tries'}.</span></div>`).join('')}` : ''}
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
  ${row('mode', 'Check-in starts with', 'You can switch during any check-in', [['field', 'Words'], ['wheel', 'Wheel']])}
  ${row('arabic', 'Arabic words', 'Show Arabic on the feeling words, with a button to hear them', [['off', 'Off'], ['sh', 'Shami'], ['fu', 'Fusha'], ['both', 'Both']])}
  ${row('faith', 'Faith skills', 'Prayer and scripture in the Toolkit', [[true, 'Show'], [false, 'Hide']].map(([v, l]) => [String(v), l]))}
  <h2>Tags</h2><p class="muted small">Tap a tag to hide it. Add new ones during a check-in.</p>
  ${Object.keys(TAG_GROUPS).map(g => `<div class="chips" style="margin-bottom:10px">${[...TAG_GROUPS[g], ...state.customTags[g]].map(t => `<button class="chip" data-act="tag-hide" data-k="${g}:${esc(t)}" aria-pressed="${!state.hiddenTags.includes(g + ':' + t)}">${esc(t)}</button>`).join('')}</div>`).join('')}
  <h2>Reminders</h2>
  <p class="muted small">Undertow doesn't nag. If you'd like a nudge, add check-in times to your calendar.</p>
  <div class="row" id="rem">${s.reminders.map((t, i) => `<input type="time" value="${t}" aria-label="Reminder ${i + 1} time" data-act-input="rem" data-i="${i}" style="width:auto">`).join('')}<button class="btn quiet" data-act="rem-add">+ Time</button>${s.reminders.length ? `<button class="btn quiet" data-act="rem-del">− Time</button>` : ''}</div>
  <div style="margin-top:10px"><button class="btn" data-act="ics" ${s.reminders.length ? '' : 'disabled'}>Add to calendar</button></div>
  <h2>Your data</h2>
  <p class="muted small">Everything stays on this phone. Save a backup now and then; it's the only copy.${isInstalled() ? '' : ' Adding Undertow to your Home Screen also stops the browser from clearing it.'}</p>
  <button class="linkrow" data-act="backup">Save a backup<span class="d">${state.entries.length} entries, ${state.kit.length} toolkit item${state.kit.length === 1 ? '' : 's'} · last backup ${state.lastBackupAt ? fmtDay(state.lastBackupAt) : 'never'}</span></button>
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
/* Accept only well-formed toolkit items from a backup file. */
function cleanKit(t) {
  if (!t || typeof t.id !== 'string' || !t.id || typeof t.title !== 'string' || !t.title.trim() || !TYPE[t.type]) return null;
  const strs = a => Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  return { id: t.id, type: t.type, title: t.title.slice(0, 300), body: typeof t.body === 'string' ? t.body : '', steps: strs(t.steps),
    q: strs(t.q).filter(q => QUADS[q]), needs: strs(t.needs).filter(n => NEED[n]), tags: strs(t.tags).slice(0, 20), min: Math.max(1, Math.min(60, +t.min || 5)),
    anywhere: t.anywhere !== false, source: typeof t.source === 'string' ? t.source : '', fav: !!t.fav, at: isNaN(Date.parse(t.at)) ? new Date().toISOString() : t.at };
}
function restore(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.entries)) throw new Error('not a backup');
      migrate(d);
      const have = new Set(state.entries.map(e => e.id));
      const clean = d.entries.map(cleanEntry);
      const skipped = clean.filter(e => !e).length;
      const add = clean.filter(e => e && !have.has(e.id));
      state.entries.push(...add);
      const uh = new Set(state.toolUses.map(u => u.at + u.id));
      state.toolUses.push(...(Array.isArray(d.toolUses) ? d.toolUses : []).filter(u => u && typeof u.id === 'string' && !isNaN(Date.parse(u.at)) && !uh.has(u.at + u.id)));
      const kh = new Set(state.kit.map(t => t.id));
      const kitIn = [...(Array.isArray(d.kit) ? d.kit : []).map(cleanKit), ...(Array.isArray(d.customTools) ? d.customTools : []).filter(validCustom).map(customToKit)];
      const kitAdd = kitIn.filter(t => t && !kh.has(t.id) && kh.add(t.id));
      state.kit.push(...kitAdd);
      if (Array.isArray(d.hiddenBuiltIns)) state.hiddenBuiltIns = [...new Set([...state.hiddenBuiltIns, ...d.hiddenBuiltIns.filter(x => typeof x === 'string')])];
      for (const g of Object.keys(TAG_GROUPS)) state.customTags[g] = [...new Set([...state.customTags[g], ...(((d.customTags || {})[g]) || []).filter(t => typeof t === 'string')])];
      readOk = true; save(); render();
      const msg = `Restored ${add.length} entr${add.length === 1 ? 'y' : 'ies'}${kitAdd.length ? ` and ${kitAdd.length} toolkit item${kitAdd.length === 1 ? '' : 's'}` : ''}${skipped ? `, skipped ${skipped} that couldn't be read` : ''}.`;
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
  <p>Check in whenever something shifts. Pick up to three feelings and how strong each is, then save. Where you feel it and what's going on are optional. After a check-in, your toolkit suggests something to try, and you say whether it helped.</p>
  <h3>Words and wheel</h3>
  <p>The <b>words</b> are a field of 144 feelings you can drag around in. Up is more energy, right is more pleasant, the mildest feelings sit in the middle and the strongest in the corners. Tap a word to see what it means. The four buttons above jump to each area, and search finds a word by name or by what it means. The word list, definitions and layout are Undertow's own.</p>
  <p>The <b>wheel</b> is drawn from Robert Plutchik's 1980 model of emotion: eight basic emotions, each at three strengths, with blends between neighbours (joy and trust make love). The strongest sit at the center. The drawing and colors here are Undertow's own.</p>
  <h3>Toolkit</h3>
  <p>Keep the skills, affirmations, reminders and notes from therapy in your own words. Tag each with the feelings it helps with (like anxious or lonely), what it helps you do, and how long it takes. <b>Help me choose</b> asks what you're feeling, how strong it is, what you need, how much time you have and who's around, then suggests your own items first, ranked by how often they've helped.</p>
  <h3>Arabic</h3>
  <p>Arabic is off unless you turn it on in More. Field words can show Shami (Levantine), Fusha or both. Wheel words show the Fusha noun. The ▸ button reads a word aloud if your phone has an Arabic voice. These translations are a first draft; check them with a speaker.</p>
  <h3>Patterns</h3>
  <p>After about five check-ins, Patterns compares your feelings across times of day, weekdays, tags, sleep and movement, and shows which skills have helped. It lives in Journal. They're patterns in what you logged, not diagnoses.</p>
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
  { sel: '#t-checkin', tab: 'today', h: 'Check in', b: 'Drag around the field of feeling words, tap one to see what it means, and save. Details are optional. About 10 seconds.' },
  { sel: '#t-week', tab: 'today', h: 'Your week', b: 'Each day takes the color of the feeling you logged most. No streaks: a blank day is just a blank day.' },
  { sel: '[data-tab="journal"]', tab: 'today', h: 'Journal', b: 'Every check-in, newest first. Switch to Patterns to see what times, days, people and places come with harder or easier feelings.' },
  { sel: '[data-tab="toolkit"]', tab: 'today', h: 'Toolkit', b: 'Your skills, affirmations and notes from therapy, tagged with what they help. Help me choose asks a few questions and suggests one.' },
  { sel: '[data-tab="more"]', tab: 'today', h: 'More', b: 'Arabic words, faith skills, tags, calendar reminders and backups.' },
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
const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
function quizNext() { quiz.step++; drawQuiz(); }
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
    case 'ck-zone': return placeField(d.q, !matchMedia('(prefers-reduced-motion: reduce)').matches);
    case 'ck-fword': addFeeling(fieldFeeling(d.w)); return drawCheckin(true);
    case 'ck-wheel': { const p = +d.p, l = +d.l; ck.petal = p; addFeeling(wheelWord(p, l)); return drawCheckin(true); }
    case 'ck-pick': {
      const fromSearch = b.classList.contains('res');
      addFeeling(JSON.parse(d.json));
      if (fromSearch && isPicked(JSON.parse(d.json).w)) ck.search = '';
      drawCheckin(true);
      if (fromSearch) { const c = $('#ck-picked'); if (c) c.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    case 'ck-focus': ck.focus = d.w; return drawCheckin(true);
    case 'ck-unpick': ck.feelings.splice(+d.i, 1); ck.focus = (ck.feelings[ck.feelings.length - 1] || {}).w || null; return drawCheckin(true);
    case 'say': { const f = ck.feelings[+d.i]; return say(f.src === 'wheel' ? f.fu : (state.settings.arabic === 'fu' ? f.fu : f.sh)); }
    case 'ck-next': if (!ck.feelings.length) return; ck.step = 1; return drawCheckin();
    case 'ck-back': ck.step = 0; return drawCheckin();
    case 'ck-body': toggle(ck.body, d.b); return drawCheckin(true);
    case 'ck-tag': toggle(ck.tags, d.t); return drawCheckin(true);
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
    case 'run-tool-pick': return startQuiz(d.id);
    case 'run-tool': return runTool(d.id, d.entry);
    case 'breath': b.textContent = breathT ? 'Start' : 'Pause'; return breath();
    case 'tool-res': runner.result = +d.v; { const j = $('#tj'); if (j) runner.journal = j.value; } return drawRunner();
    case 'tool-save': return saveTool();
    /* Toolkit */
    case 'kit-type': kitType = d.f; return render();
    case 'kit-add': return editKit(null);
    case 'kit-edit': return editKit(d.id);
    case 'kit-starters': runner = null; return startersSheet();
    case 'starter-add': {
      const s = STARTERS[+d.i];
      state.kit.push({ id: 'k-' + uid(), type: s.type, title: s.title, body: s.body || '', steps: [...(s.steps || [])], q: [...(s.q || [])], needs: [...(s.needs || [])], tags: [], min: s.min || 1, anywhere: s.anywhere !== false, source: s.source || '', fav: false, at: new Date().toISOString() });
      save(); startersSheet(); return toast('Added. Edit it any time to make it yours.');
    }
    case 'kit-hide': state.hiddenBuiltIns.push(d.id); save(); runner = null; closeSheet(); return toast('Hidden. You can bring it back at the bottom of the Toolkit.');
    case 'kit-unhide': state.hiddenBuiltIns = []; save(); return render();
    case 'kd-type': kd.type = d.v; return drawKitEdit(true);
    case 'kd-q': toggle(kd.q, d.v); return drawKitEdit(true);
    case 'kd-need': toggle(kd.needs, d.v); return drawKitEdit(true);
    case 'kd-min': kd.min = +d.v; return drawKitEdit(true);
    case 'kd-any': kd.anywhere = d.v === 'yes'; return drawKitEdit(true);
    case 'kd-fav': kd.fav = !kd.fav; return drawKitEdit(true);
    case 'kd-save': return saveKit();
    case 'kd-del': {
      if (delArmed !== d.id) { delArmed = d.id; b.textContent = 'Tap again to delete'; setTimeout(() => { delArmed = null; }, 4000); return; }
      const i = state.kit.findIndex(x => x.id === d.id); if (i < 0) return;
      const [gone] = state.kit.splice(i, 1); save(); kd = null; closeSheet();
      return toast('Deleted.', 'Undo', () => { state.kit.push(gone); save(); render(); });
    }
    /* Help me choose */
    case 'quiz': return startQuiz(d.id);
    case 'qz-back': quiz.step--; if (quiz.step < 2 && quiz.from) { quiz.from = null; quiz.step = 0; } return drawQuiz();
    case 'qz-recent': { const e = state.entries.find(x => x.id === d.v); Object.assign(quiz, feelAsk(e)); quiz.from = e; quiz.entryId = e.id; quiz.step = 2; return drawQuiz(); }
    case 'qz-q': quiz.q = d.v; quiz.words = []; quiz.from = null; return quizNext();
    case 'qz-word': quiz.q = d.q; quiz.words = [d.v]; quiz.from = null; return quizNext();
    case 'qz-i': quiz.i = +d.v; return quizNext();
    case 'qz-need': quiz.need = d.v || null; return quizNext();
    case 'qz-time': quiz.time = +d.v; return quizNext();
    case 'qz-who': quiz.alone = d.v === 'alone'; return quizNext();
    /* Journal and the rest */
    case 'j-view': jView = d.v; return render();
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
    const items = [...box.querySelectorAll('button:not([disabled]), [href], input, textarea, select, summary, [tabindex="0"]')].filter(x => !x.closest('[inert]') && x.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { ev.preventDefault(); first.focus(); }
  }
});
document.addEventListener('input', ev => {
  const el = ev.target, a = el.dataset.actInput; if (!a) return;
  if (a === 'ck-int') { ck.feelings[+el.dataset.i].i = +el.value; const word = STRENGTH[el.value - 1]; el.setAttribute('aria-valuetext', word); el.nextElementSibling.querySelector('.now').textContent = word; }
  if (a === 'ck-search') {
    // Update the results in place so the keyboard stays up.
    ck.search = el.value;
    $('#ck-results').innerHTML = searchResults();
    $('#ck-browse').hidden = !!ck.search.trim();
    if (!ck.search.trim()) placeField();
  }
  if (a === 'ck-note') ck.note = el.value;
  if (a === 'ck-when') ck.when = el.value || null;
  if (a === 'tool-journal') runner.journal = el.value;
  if (a === 'kd') kd[el.dataset.k] = el.value;
  if (a === 'j-search') { jSearch = el.value; const pos = el.selectionStart; renderJournal(); const n = $('#jsearch'); n.focus(); n.setSelectionRange(pos, pos); }
  if (a === 'k-search') { kitSearch = el.value; const pos = el.selectionStart; renderToolkit(); const n = $('#ksearch'); n.focus(); n.setSelectionRange(pos, pos); }
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
