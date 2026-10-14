/**
 * Hitos personales y composición visual de progreso.
 * Los hitos se derivan de los datos registrados; no existen comparaciones con terceros.
 */
import { db, F, persist, liveSessions } from './data.js';
import { compute, weekStart } from './stats.js';
import { $, h, dayKey, fmtDate } from './util.js';
import { icon } from './icons.js';

const DEFS = [
  { id: 'first', name: 'Primer paso', desc: 'Completa tu primera sesión', goal: 1, icon: 'check', value: (m) => m.completed },
  { id: 's10', name: 'Diez sesiones', desc: 'Completa 10 sesiones', goal: 10, icon: 'timer', value: (m) => m.completed },
  { id: 's50', name: 'Cincuenta sesiones', desc: 'Completa 50 sesiones', goal: 50, icon: 'timer', value: (m) => m.completed },
  { id: 's100', name: 'Cien sesiones', desc: 'Completa 100 sesiones', goal: 100, icon: 'timer', value: (m) => m.completed },
  { id: 'h10', name: 'Diez horas', desc: 'Acumula 10 horas de enfoque', goal: 10, icon: 'star', value: (m) => m.hours },
  { id: 'h50', name: 'Cincuenta horas', desc: 'Acumula 50 horas de enfoque', goal: 50, icon: 'star', value: (m) => m.hours },
  { id: 'h100', name: 'Cien horas', desc: 'Acumula 100 horas de enfoque', goal: 100, icon: 'star', value: (m) => m.hours },
  { id: 'tags5', name: 'Explorador', desc: 'Usa 5 etiquetas distintas', goal: 5, icon: 'tag', value: (m) => m.tags },
  { id: 'week4', name: 'Constancia semanal', desc: 'Estudia 4 días distintos en una misma semana', goal: 4, icon: 'cal', value: (m) => m.weekDays },
  { id: 'deep', name: 'Foco profundo', desc: 'Completa una sesión de 50 minutos o más', goal: 50, icon: 'timer', value: (m) => m.longest },
  { id: 'goal', name: 'Objetivo diario', desc: 'Alcanza tu objetivo diario', goal: 1, icon: 'trophy', value: (m) => m.goalDays },
  { id: 'plan', name: 'Plan cumplido', desc: 'Completa un plan por bloques', goal: 1, icon: 'list', value: (m) => m.plans },
];

function metrics() {
  const cd = compute();
  const live = liveSessions();
  const done = live.filter((r) => r[F.DONE]);
  const weeks = {};
  let goalDays = 0;
  let seconds = 0;
  for (const [key, day] of Object.entries(cd.days)) {
    seconds += day.s;
    if (day.s >= db.cfg.goal * 60) goalDays++;
    if (day.s >= 60) {
      const w = dayKey(weekStart(new Date(`${key}T12:00:00`)));
      weeks[w] = (weeks[w] || 0) + 1;
    }
  }
  return {
    completed: done.length,
    hours: seconds / 3600,
    tags: new Set(live.filter((r) => r[F.END] - r[F.START] >= 60).map((r) => r[F.TAG])).size,
    weekDays: Math.max(0, ...Object.values(weeks)),
    longest: Math.max(0, ...done.map((r) => Math.round((r[F.END] - r[F.START]) / 60))),
    goalDays,
    plans: db.cfg.plansDone,
  };
}

/** Registra los hitos alcanzados. La primera ejecución los incorpora sin notificar. */
export function checkBadges() {
  const m = metrics();
  const firstRun = !('_init' in db.badges);
  const unlocked = [];
  for (const def of DEFS) {
    if (!db.badges[def.id] && def.value(m) >= def.goal) {
      db.badges[def.id] = Math.floor(Date.now() / 1000);
      if (!firstRun) unlocked.push(def);
    }
  }
  if (firstRun) db.badges._init = 1;
  if (unlocked.length || firstRun) persist('badges');
  return unlocked;
}

export function renderBadges() {
  const m = metrics();
  const earned = DEFS.filter((d) => db.badges[d.id]).length;
  $('#badges-sum').textContent = `${earned} de ${DEFS.length} hitos`;
  $('#badges').replaceChildren(...DEFS.map((d) => {
    const got = !!db.badges[d.id];
    const value = Math.min(d.value(m), d.goal);
    const art = h('span', { class: 'bd-ico' });
    art.innerHTML = icon(d.icon, 22);
    return h('li', { class: `badge${got ? ' on' : ''}` }, art,
      h('span', { class: 'bd-txt' },
        h('b', { text: d.name }),
        h('small', { text: got ? `Conseguido el ${fmtDate(new Date(db.badges[d.id] * 1000), { day: 'numeric', month: 'short', year: 'numeric' })}` : d.desc }),
        got ? null : h('span', { class: 'bar' }, h('i', { style: `width:${(value / d.goal) * 100}%` })),
        got ? null : h('small', { class: 'bd-prog', text: `${Math.floor(value)} / ${d.goal}` })));
  }));
}

/* ---------- Cielo: cada sesión completada añade una estrella ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP = 7;
const MAX_GROUPS = 34;
const GOLDEN_ANGLE = 2.399963;

const svgEl = (tag, attrs = {}, title = null) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (title) { const t = document.createElementNS(SVG_NS, 'title'); t.textContent = title; el.append(t); }
  return el;
};

/** Pseudoaleatorio determinista en [0, 1) a partir de un entero, para que la composición sea estable. */
const noise = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

/**
 * Cada sesión completada añade una estrella. Cada GROUP estrellas consecutivas forman una
 * constelación; los centros de las constelaciones se reparten en espiral áurea.
 */
export function renderSky() {
  const done = liveSessions().filter((r) => r[F.DONE]).sort((a, b) => a[F.START] - b[F.START]);
  const groups = Math.ceil(done.length / GROUP);
  const first = Math.max(0, groups - MAX_GROUPS);
  const shown = done.slice(first * GROUP);
  const spread = Math.min(26, 104 / Math.sqrt(Math.max(groups - first, 3)));
  const complete = Math.floor(done.length / GROUP);
  const pts = shown.map((r, i) => {
    const g = Math.floor(i / GROUP);
    const n = first * GROUP + i;
    const dist = spread * Math.sqrt(g + 0.5);
    const cx = 210 + dist * Math.cos(g * GOLDEN_ANGLE) * 1.7;
    const cy = 120 + dist * Math.sin(g * GOLDEN_ANGLE);
    const angle = (i % GROUP) * ((2 * Math.PI) / GROUP) + (noise(n) - 0.5) * 1.1 + g;
    const radius = spread * 0.5 * (0.5 + noise(n + 99) * 0.7);
    return { x: cx + radius * Math.cos(angle) * 1.3, y: cy + radius * Math.sin(angle), r, group: first + g };
  });
  const lines = svgEl('g');
  const stars = svgEl('g');
  pts.forEach((p, i) => {
    if (i > 0 && pts[i - 1].group === p.group) {
      lines.append(svgEl('line', { x1: pts[i - 1].x.toFixed(1), y1: pts[i - 1].y.toFixed(1), x2: p.x.toFixed(1), y2: p.y.toFixed(1), class: p.group < complete ? 'full' : 'part' }));
    }
    const minutes = Math.round((p.r[F.END] - p.r[F.START]) / 60);
    stars.append(svgEl('circle', {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: (1.5 + Math.min(2.2, (minutes / 30) * 1.5)).toFixed(1), class: i === pts.length - 1 ? 'star latest' : 'star',
    }, `${fmtDate(new Date(p.r[F.START] * 1000), { day: 'numeric', month: 'short' })} · ${p.r[F.TAG]} · ${minutes} min`));
  });
  const svg = $('#sky');
  svg.replaceChildren(svgEl('title'), lines, stars);
  svg.firstChild.textContent = `Cielo con ${done.length} estrellas y ${complete} constelaciones completas`;
  $('#sky-sum').textContent = done.length
    ? `${done.length} ${done.length === 1 ? 'estrella' : 'estrellas'} · ${complete} ${complete === 1 ? 'constelación completa' : 'constelaciones completas'}`
    : 'Cada sesión completada añade una estrella.';
  const missing = GROUP - (done.length % GROUP || GROUP);
  $('#sky-next').textContent = done.length && missing ? `Faltan ${missing} ${missing === 1 ? 'sesión' : 'sesiones'} para cerrar la constelación en curso.` : '';
}
