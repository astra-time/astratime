/**
 * Calendario de actividad (vistas mensual y anual), resumen por día y edición del historial.
 * Las ediciones modifican las sesiones de origen, por lo que todas las métricas se recalculan.
 */
import { db, F, liveSessions, addSession, updateSession, removeSession } from './data.js';
import { compute, level } from './stats.js';
import { load, save } from './storage.js';
import { $, h, dayKey, fmtDur, fmtDate, fmtTime, pad, nowSec, clamp } from './util.js';
import { icon } from './icons.js';
import { confirmDialog, toast } from './dialogs.js';
import { tagColor } from './panel.js';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const LONG_PRESS_MS = 450;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const prefs = { mode: 'month', tag: '', ...load('cal', {}) };
if (!['month', 'year'].includes(prefs.mode)) prefs.mode = 'month';
const view = { y: new Date().getFullYear(), m: new Date().getMonth() };
let cd = { days: {}, pomos: {} };
let openKey = null;

const minutesOf = (key) => {
  const d = cd.days[key];
  return d ? Math.round((prefs.tag ? d.t[prefs.tag] || 0 : d.s) / 60) : 0;
};

function dayButton(key, text = null) {
  const min = minutesOf(key);
  const label = `${fmtDate(new Date(`${key}T12:00:00`), { day: 'numeric', month: 'long', year: 'numeric' })}: ${min} min`;
  return h('button', {
    class: `cd l${level(min)}${key === dayKey(new Date()) ? ' today' : ''}`,
    type: 'button', 'data-day': key, 'aria-label': label, text,
  });
}

const blank = () => h('span', { class: 'cd empty', 'aria-hidden': 'true' });

function renderMonth(body) {
  const limit = startOfDay(new Date());
  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const count = new Date(view.y, view.m + 1, 0).getDate();
  body.className = 'calbody month';
  body.replaceChildren(
    ...WEEKDAYS.map((d) => h('span', { class: 'wd', 'aria-hidden': 'true', text: d })),
    ...Array.from({ length: offset }, blank),
    ...Array.from({ length: count }, (_, i) => {
      const date = new Date(view.y, view.m, i + 1);
      return date > limit
        ? h('span', { class: 'cd future', 'aria-hidden': 'true', text: String(i + 1) })
        : dayButton(dayKey(date), String(i + 1));
    }),
  );
}

function renderYear(body) {
  const limit = startOfDay(new Date());
  const jan1 = new Date(view.y, 0, 1);
  const cursor = new Date(jan1);
  cursor.setDate(1 - ((jan1.getDay() + 6) % 7));
  const end = view.y === limit.getFullYear() ? limit : new Date(view.y, 11, 31);
  const cells = [];
  while (cursor <= end || (cursor.getDay() + 6) % 7 !== 0) {
    cells.push(cursor.getFullYear() === view.y && cursor <= limit ? dayButton(dayKey(cursor)) : blank());
    cursor.setDate(cursor.getDate() + 1);
  }
  body.className = 'calbody year';
  body.replaceChildren(...cells);
  const wrap = body.parentElement;
  wrap.scrollLeft = view.y === limit.getFullYear() ? wrap.scrollWidth : 0;
}

function firstYear() {
  const starts = liveSessions().map((r) => r[F.START]);
  return starts.length ? new Date(Math.min(...starts) * 1000).getFullYear() : new Date().getFullYear();
}

function fillControls() {
  const now = new Date();
  const y0 = Math.min(firstYear(), view.y);
  $('#cal-month').replaceChildren(...Array.from({ length: 12 }, (_, i) => h('option', {
    value: i, text: capitalize(fmtDate(new Date(2000, i, 1), { month: 'long' })), selected: i === view.m,
  })));
  $('#cal-year').replaceChildren(...Array.from({ length: now.getFullYear() - y0 + 1 }, (_, i) => h('option', {
    value: y0 + i, text: y0 + i, selected: y0 + i === view.y,
  })));
  $('#cal-month').hidden = prefs.mode === 'year';
  const tags = new Set([...db.cfg.tags, ...liveSessions().map((r) => r[F.TAG])]);
  if (prefs.tag && !tags.has(prefs.tag)) prefs.tag = '';
  $('#cal-tag').replaceChildren(h('option', { value: '', text: 'Todas' }),
    ...[...tags].map((t) => h('option', { value: t, text: t, selected: t === prefs.tag })));
  const atEnd = prefs.mode === 'month' ? view.y === now.getFullYear() && view.m >= now.getMonth() : view.y >= now.getFullYear();
  const atStart = view.y <= y0 && (prefs.mode === 'year' || view.m === 0);
  $('#cal-next').disabled = atEnd;
  $('#cal-prev').disabled = atStart;
  document.querySelectorAll('#cal-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.mode)));
}

/** Resumen del periodo mostrado: tiempo total, días activos y sesiones. */
function summarize() {
  const limit = startOfDay(new Date());
  const start = prefs.mode === 'month' ? new Date(view.y, view.m, 1) : new Date(view.y, 0, 1);
  const end = prefs.mode === 'month' ? new Date(view.y, view.m + 1, 0) : new Date(view.y, 11, 31);
  let seconds = 0;
  let active = 0;
  let sessions = 0;
  for (const d = new Date(start); d <= end && d <= limit; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const day = cd.days[key];
    if (!day) continue;
    const s = prefs.tag ? day.t[prefs.tag] || 0 : day.s;
    seconds += s;
    if (s >= 60) active++;
    sessions += cd.pomos[key] || 0;
  }
  const title = prefs.mode === 'month' ? capitalize(fmtDate(start, { month: 'long', year: 'numeric' })) : String(view.y);
  const parts = [fmtDur(seconds), `${active} ${active === 1 ? 'día activo' : 'días activos'}`];
  if (!prefs.tag) parts.push(`${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}`);
  return `${title}: ${parts.join(' · ')}`;
}

export function renderCalendar() {
  cd = compute();
  fillControls();
  const body = $('#cal-body');
  if (prefs.mode === 'month') renderMonth(body); else renderYear(body);
  $('#cal-sum').textContent = summarize();
}

function shift(delta) {
  if (prefs.mode === 'month') {
    const d = new Date(view.y, view.m + delta, 1);
    view.y = d.getFullYear();
    view.m = d.getMonth();
  } else {
    view.y += delta;
  }
  renderCalendar();
}

/* ---------- Fecha al pasar el cursor o mantener pulsado ---------- */

function showTip(cell) {
  const tip = $('#tip');
  const key = cell.dataset.day;
  const entry = cd.days[key];
  const seconds = entry ? (prefs.tag ? entry.t[prefs.tag] || 0 : entry.s) : 0;
  const date = fmtDate(new Date(`${key}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  tip.textContent = `${date} · ${seconds ? fmtDur(seconds) : 'sin actividad'}`;
  const r = cell.getBoundingClientRect();
  const below = r.top < 56;
  tip.classList.toggle('below', below);
  tip.style.left = `${clamp(r.left + r.width / 2, 90, innerWidth - 90)}px`;
  tip.style.top = `${below ? r.bottom + 8 : r.top - 8}px`;
  tip.classList.add('show');
}

const hideTip = () => $('#tip').classList.remove('show');

function bindTooltip(body) {
  const cellOf = (e) => e.target.closest?.('[data-day]');
  let timer = null;
  let origin = null;
  let pressed = false;

  // Ratón: la fecha aparece al pasar por encima.
  body.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse' && cellOf(e)) showTip(cellOf(e)); });
  body.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse') hideTip(); });
  // Teclado: la fecha aparece al enfocar.
  body.addEventListener('focusin', (e) => { if (cellOf(e)) showTip(cellOf(e)); });
  body.addEventListener('focusout', hideTip);

  // Táctil: pulsación larga para ver la fecha; un toque breve abre el día.
  body.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !cellOf(e)) return;
    const cell = cellOf(e);
    origin = { x: e.clientX, y: e.clientY };
    pressed = false;
    clearTimeout(timer);
    timer = setTimeout(() => { pressed = true; showTip(cell); navigator.vibrate?.(8); }, LONG_PRESS_MS);
  });
  body.addEventListener('pointermove', (e) => {
    if (timer && origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) { clearTimeout(timer); timer = null; }
  });
  body.addEventListener('pointerup', () => {
    clearTimeout(timer);
    timer = null;
    if (pressed) setTimeout(hideTip, 1500);
  });
  body.addEventListener('pointercancel', () => { clearTimeout(timer); timer = null; pressed = false; hideTip(); });
  body.addEventListener('contextmenu', (e) => { if (cellOf(e)) e.preventDefault(); });
  body.addEventListener('click', (e) => {
    const cell = cellOf(e);
    if (!cell) return;
    if (pressed) { pressed = false; return; }
    openDay(cell.dataset.day);
  });
}

/* ---------- Resumen del día ---------- */

function dayBounds(key) {
  const d = new Date(`${key}T12:00:00`);
  return [new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() / 1000];
}

function renderDay() {
  const [from, to] = dayBounds(openKey);
  const date = new Date(`${openKey}T12:00:00`);
  const list = liveSessions().filter((r) => r[F.START] < to && r[F.END] > from).sort((a, b) => a[F.START] - b[F.START]);
  cd = compute();
  const day = cd.days[openKey] ?? { s: 0, t: {} };
  const pomos = cd.pomos[openKey] || 0;
  const raw = list.reduce((a, r) => a + Math.min(r[F.END], to) - Math.max(r[F.START], from), 0);

  const title = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#dd-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
  $('#dd-sum').replaceChildren(
    h('p', { class: 'dd-total' }, h('b', { text: fmtDur(day.s) }), h('span', { class: 'sub', text: ` · ${pomos} ${pomos === 1 ? 'sesión completada' : 'sesiones completadas'}` })),
    h('div', { class: 'chips left' }, Object.entries(day.t).sort((a, b) => b[1] - a[1]).map(([tag, s]) => h('span', { class: 'chip' },
      h('i', { class: 'dot', style: `background:${tagColor(tag)}` }), `${tag} · ${fmtDur(s)}`))),
    ...(raw - day.s > 60 ? [h('p', { class: 'sub', text: 'Parte del tiempo coincide entre sesiones y se cuenta una sola vez.' })] : []),
  );
  $('#dd-list').replaceChildren(...(list.length ? list.map((r) => {
    const edit = h('button', { class: 'ib sm', type: 'button', 'aria-label': 'Editar sesión', onclick: () => openEditor(r) });
    const del = h('button', { class: 'ib sm', type: 'button', 'aria-label': 'Eliminar sesión', onclick: () => removeWithConfirm(r) });
    edit.innerHTML = icon('edit', 16);
    del.innerHTML = icon('trash', 16);
    return h('li', { class: 'srow' },
      h('span', { class: 'sr-main' },
        h('b', { text: `${fmtTime(r[F.START])} – ${fmtTime(r[F.END])}` }),
        h('span', { class: 'sub' }, h('i', { class: 'dot', style: `background:${tagColor(r[F.TAG])}` }), ` ${r[F.TAG]} · ${Math.max(1, Math.round((r[F.END] - r[F.START]) / 60))} min${r[F.DONE] ? ' · completada' : ''}`)),
      edit, del);
  }) : [h('li', { class: 'sub', text: 'No hay sesiones registradas este día.' })]));
}

export function openDay(key) {
  openKey = key;
  renderDay();
  const dlg = $('#dlg-day');
  if (!dlg.open) dlg.showModal();
}

async function removeWithConfirm(r) {
  const ok = await confirmDialog({ title: 'Eliminar sesión', text: `Se eliminará la sesión de ${r[F.TAG]} (${fmtTime(r[F.START])}). Las métricas se recalcularán.`, ok: 'Eliminar' });
  if (ok) removeSession(r[F.ID]);
}

/* ---------- Edición ---------- */

export function openEditor(session = null) {
  const dlg = $('#dlg-edit');
  const start = session ? new Date(session[F.START] * 1000) : null;
  const tags = [...new Set([...db.cfg.tags, ...(session ? [session[F.TAG]] : [])])];
  dlg.dataset.id = session ? session[F.ID] : '';
  $('#ed-title').textContent = session ? 'Editar sesión' : 'Añadir sesión manual';
  $('#ed-date').value = start ? dayKey(start) : openKey;
  $('#ed-time').value = start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : '09:00';
  $('#ed-min').value = session ? Math.max(1, Math.round((session[F.END] - session[F.START]) / 60)) : 25;
  $('#ed-tag').replaceChildren(...tags.map((t) => h('option', { value: t, text: t, selected: t === (session ? session[F.TAG] : db.cfg.tag) })));
  $('#ed-done').checked = session ? !!session[F.DONE] : true;
  $('#ed-error').textContent = '';
  dlg.showModal();
}

function submitEditor(e) {
  if (e.submitter?.value !== 'save') return;
  const dlg = $('#dlg-edit');
  const fail = (text) => { e.preventDefault(); $('#ed-error').textContent = text; };
  const start = Math.floor(new Date(`${$('#ed-date').value}T${$('#ed-time').value}`).getTime() / 1000);
  const minutes = Math.round(Number($('#ed-min').value));
  if (!Number.isFinite(start)) return fail('Indica una fecha y una hora de inicio válidas.');
  if (!(minutes >= 1 && minutes <= 1440)) return fail('La duración debe estar entre 1 y 1440 minutos.');
  const end = start + minutes * 60;
  if (end > nowSec() + 60) return fail('La sesión no puede terminar en el futuro.');

  const id = dlg.dataset.id;
  const overlaps = liveSessions().some((r) => r[F.ID] !== id && r[F.START] < end && r[F.END] > start);
  const data = { start, end, tag: $('#ed-tag').value, done: $('#ed-done').checked };
  if (id) updateSession(id, data); else addSession({ ...data, done: data.done ? 1 : 0 });
  const key = dayKey(new Date(start * 1000));
  if (key !== openKey) toast(`La sesión se ha movido al ${fmtDate(new Date(start * 1000), { day: 'numeric', month: 'long' })}.`);
  else if (overlaps) toast('Parte del tiempo coincide con otras sesiones y se contará una sola vez.');
}

export function refreshOpenDay() {
  if ($('#dlg-day').open) renderDay();
}

export function initCalendar() {
  bindTooltip($('#cal-body'));
  $('#cal-prev').addEventListener('click', () => shift(-1));
  $('#cal-next').addEventListener('click', () => shift(1));
  $('#cal-month').addEventListener('change', (e) => { view.m = Number(e.target.value); renderCalendar(); });
  $('#cal-year').addEventListener('change', (e) => { view.y = Number(e.target.value); renderCalendar(); });
  $('#cal-tag').addEventListener('change', (e) => { prefs.tag = e.target.value; save('cal', prefs); renderCalendar(); });
  $('#cal-view').addEventListener('click', (e) => {
    const mode = e.target.dataset.v;
    if (mode) { prefs.mode = mode; save('cal', prefs); renderCalendar(); }
  });
  $('#dd-add').addEventListener('click', () => openEditor(null));
  $('#ed-form').addEventListener('submit', submitEditor);
}
