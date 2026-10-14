/** Panel de estadísticas: objetivo diario, últimos siete días, totales y desglose por etiqueta. */
import { db } from './data.js';
import { compute, summarize, byTag, weekStart } from './stats.js';
import { $, $$, h, dayKey, fmtDur, fmtDate } from './util.js';

const TAG_COLORS = ['#00AEEF', '#FFCC00', '#84BB00', '#FF8800', '#9B7BFF', '#2DA882', '#E8694F', '#DCEBFA'];
const RING = 175.93;
let period = 'week';

/** Color estable por etiqueta (función hash del nombre). */
export function tagColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

function weekBars(cd, now) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    return { d, min: Math.round((cd.days[dayKey(d)]?.s ?? 0) / 60) };
  });
  const max = Math.max(30, ...days.map((x) => x.min));
  $('#week').replaceChildren(...days.map(({ d, min }) => h('div', { title: `${min} min` },
    h('i', { style: `height:${Math.round((min / max) * 58)}px` }),
    h('span', { text: fmtDate(d, { weekday: 'short' }) }))));
}

function tagBreakdown(cd, now) {
  const today = dayKey(now);
  const from = {
    day: today,
    week: dayKey(weekStart(now)),
    month: `${today.slice(0, 7)}-01`,
    year: `${today.slice(0, 4)}-01-01`,
    all: '',
  }[period];
  const rows = Object.entries(byTag(cd, from, today)).filter(([, s]) => s >= 30).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, s]) => a + s, 0);
  const box = $('#tagstats');
  $('#tagtot').textContent = rows.length ? `Total: ${fmtDur(total)}` : '';
  if (!rows.length) {
    box.replaceChildren(h('p', { class: 'sub', text: 'Aún no hay tiempo registrado en este periodo.' }));
    return;
  }
  const max = rows[0][1];
  box.replaceChildren(
    h('div', { class: 'stack', role: 'img', 'aria-label': 'Proporción de tiempo por etiqueta' },
      rows.map(([tag, s]) => h('i', { style: `flex:${s};background:${tagColor(tag)}`, title: `${tag}: ${fmtDur(s)}` }))),
    ...rows.map(([tag, s]) => h('div', { class: 'tr' },
      h('span', { class: 'tn' }, h('i', { style: `background:${tagColor(tag)}` }), tag),
      h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((s / max) * 100)}%;background:${tagColor(tag)}` })),
      h('b', { text: `${fmtDur(s)} · ${Math.round((s / total) * 100)}%` }))),
  );
}

export function renderPanel() {
  const now = new Date();
  const cd = compute();
  const s = summarize(cd, now);
  const pct = Math.min(100, (s.day / 60 / db.cfg.goal) * 100);
  $('#gpct').textContent = `${Math.round(pct)}%`;
  $('#gring').style.strokeDashoffset = RING * (1 - pct / 100);
  $('#goalt').textContent = `${Math.round(s.day / 60)} / ${db.cfg.goal} min${pct >= 100 ? ' · cumplido' : ''}`;
  $('#s-day').textContent = fmtDur(s.day);
  $('#s-week').textContent = fmtDur(s.week);
  $('#s-month').textContent = fmtDur(s.month);
  $('#s-year').textContent = fmtDur(s.year);
  $('#s-pomos').textContent = s.pomos;
  $('#s-streak').textContent = `${s.streak} ${s.streak === 1 ? 'día' : 'días'}`;
  $('#s-best').textContent = `${s.best} ${s.best === 1 ? 'día' : 'días'}`;
  $('#st-streak').hidden = $('#st-best').hidden = !db.cfg.streaks;
  weekBars(cd, now);
  tagBreakdown(cd, now);
}

export function initPanel() {
  $('#tp').addEventListener('click', (e) => {
    const p = e.target.dataset.p;
    if (!p) return;
    period = p;
    $$('#tp button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === p)));
    renderPanel();
  });
}
