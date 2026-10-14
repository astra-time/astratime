/** Cálculo de totales a partir de las sesiones. */
import { F, liveSessions } from './data.js';
import { dayKey } from './util.js';

/**
 * Agrega el tiempo por día y etiqueta. Los tramos que coinciden en el tiempo entre sesiones
 * (por ejemplo, registradas desde dos dispositivos) se contabilizan una sola vez.
 */
export function compute(list = liveSessions()) {
  const days = {};
  const pomos = {};
  let covered = 0;
  const ordered = [...list].sort((a, b) => a[F.START] - b[F.START] || (a[F.ID] < b[F.ID] ? -1 : 1));
  for (const r of ordered) {
    let from = Math.max(r[F.START], covered);
    const to = r[F.END];
    if (to <= from) continue;
    covered = to;
    if (r[F.DONE]) {
      const k = dayKey(new Date(to * 1000));
      pomos[k] = (pomos[k] || 0) + 1;
    }
    while (from < to) {
      const d = new Date(from * 1000);
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() / 1000;
      const upto = Math.min(to, midnight);
      const day = days[dayKey(d)] ?? (days[dayKey(d)] = { s: 0, t: {} });
      day.s += upto - from;
      day.t[r[F.TAG]] = (day.t[r[F.TAG]] || 0) + (upto - from);
      from = upto;
    }
  }
  return { days, pomos };
}

/** Nivel de intensidad (0-4) para la escala de color. */
export const level = (min) => (min === 0 ? 0 : min < 30 ? 1 : min < 60 ? 2 : min < 120 ? 3 : 4);

export function weekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Totales por periodo y rachas (un día cuenta a partir de un minuto de enfoque). */
export function summarize(cd, now = new Date()) {
  const today = dayKey(now);
  const week = dayKey(weekStart(now));
  const out = { day: 0, week: 0, month: 0, year: 0, total: 0, streak: 0, best: 0, pomos: 0 };
  let run = 0;
  let prev = null;
  for (const k of Object.keys(cd.days).sort()) {
    const s = cd.days[k].s;
    out.total += s;
    if (k === today) out.day = s;
    if (k >= week && k <= today) out.week += s;
    if (k.slice(0, 7) === today.slice(0, 7)) out.month += s;
    if (k.slice(0, 4) === today.slice(0, 4)) out.year += s;
    if (s >= 60) {
      const d = new Date(`${k}T12:00:00`);
      run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1;
      prev = d;
      out.best = Math.max(out.best, run);
    }
  }
  out.pomos = Object.values(cd.pomos).reduce((a, b) => a + b, 0);
  const cursor = new Date(now);
  if (!((cd.days[today]?.s ?? 0) >= 60)) cursor.setDate(cursor.getDate() - 1);
  while ((cd.days[dayKey(cursor)]?.s ?? 0) >= 60) {
    out.streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  out.best = Math.max(out.best, out.streak);
  return out;
}

/** Totales por etiqueta en el intervalo [from, to] de claves de día. */
export function byTag(cd, from, to) {
  const totals = {};
  for (const k of Object.keys(cd.days)) {
    if (k < from || k > to) continue;
    for (const [tag, s] of Object.entries(cd.days[k].t)) totals[tag] = (totals[tag] || 0) + s;
  }
  return totals;
}
