/**
 * Motor del temporizador. Usa una hora de finalización absoluta, de modo que la
 * ralentización de pestañas en segundo plano no acumula deriva.
 */
import { db, F, persist, saveCfg } from './data.js';
import { emit } from './bus.js';
import { nowSec, uid, clamp } from './util.js';
import * as plans from './plans.js';
import * as tasks from './tasks.js';
import { setWake } from './wake.js';
import { unlock } from './audio.js';

export const st = { mode: 'focus', running: false, rem: 0, total: 0, end: 0, done: 0, seg: null, override: null, saved: 0 };

/** Duración (s) de una fase. En enfoque con plan activo se limita al tiempo restante del bloque. */
export function secondsFor(mode) {
  if (mode !== 'focus') return db.cfg[mode] * 60;
  if (st.override) return st.override * 60;
  const current = plans.current();
  const base = db.cfg.focus * 60;
  return current ? Math.max(60, Math.min(base, current.remainSec)) : base;
}

function reset() {
  st.total = st.rem = secondsFor(st.mode);
  emit('timer:state');
}

/* ---------- Segmento de registro ---------- */

function touch() {
  if (!st.seg) return;
  st.seg[F.END] = Math.floor((st.running ? Math.min(Date.now(), st.end) : Date.now()) / 1000);
  st.seg[F.UPD] = Date.now();
}

function openSegment() {
  if (st.mode !== 'focus' || st.seg) return;
  const t = nowSec();
  const block = plans.current();
  st.seg = [uid(), t, t, db.cfg.tag, 0, db.cfg.task, block ? block.key : null, Date.now(), 0];
  db.ses.push(st.seg);
}

/** Cierra el segmento activo; descarta los de menos de 5 s que no se completaron. */
function closeSegment(done) {
  const seg = st.seg;
  if (!seg) return null;
  touch();
  if (done) seg[F.DONE] = 1;
  st.seg = null;
  if (!done && seg[F.END] - seg[F.START] < 5) {
    db.ses.splice(db.ses.indexOf(seg), 1);
    persist('ses');
    return null;
  }
  persist('ses');
  return seg;
}

/** Descarta el segmento si el historial se borra durante una sesión en curso. */
export function afterWipe() {
  st.seg = null;
  if (st.running && st.mode === 'focus') openSegment();
}

/* ---------- Control ---------- */

export function start() {
  if (st.running) return;
  unlock();
  st.running = true;
  st.end = Date.now() + st.rem * 1000;
  if (st.mode === 'focus') { tasks.recover(); openSegment(); }
  setWake(db.cfg.wake);
  emit('timer:state');
}

export function halt() {
  if (st.running) tick();
  closeSegment(false);
  st.running = false;
  setWake(false);
}

export function pause() {
  if (!st.running) return;
  halt();
  emit('timer:state');
}

export const toggle = () => (st.running ? pause() : start());

export function setMode(mode) {
  halt();
  st.mode = mode;
  reset();
}

export function restart() {
  halt();
  reset();
}

export function tick() {
  if (!st.running) return;
  st.rem = Math.max(0, Math.round((st.end - Date.now()) / 1000));
  touch();
  if (st.rem <= 0) { finishPhase(); return; }
  emit('timer:tick');
  if (Date.now() - st.saved > 5000) {
    st.saved = Date.now();
    if (st.seg) persist('ses');
  }
}

function blockInfo(before) {
  return before && { tag: before.block.tag, min: before.block.min, doneMin: plans.doneMin(before.key) };
}

function finishPhase() {
  const ended = st.mode;
  st.running = false;
  setWake(false);
  if (ended === 'focus') {
    const before = plans.current();
    const session = closeSegment(true);
    st.done++;
    const adv = plans.advanceIfDone();
    st.mode = st.done % db.cfg.every === 0 ? 'long' : 'short';
    reset();
    emit('phase:end', { ended });
    emit('focus:end', { session, completed: true, block: blockInfo(before), adv });
  } else {
    st.mode = 'focus';
    reset();
    emit('phase:end', { ended });
    if (db.cfg.auto) start();
  }
}

/** Salta la fase actual. Una sesión de enfoque de al menos un minuto se registra como no completada. */
export function skip() {
  if (st.mode !== 'focus') { setMode('focus'); return; }
  if (st.running) tick();
  const before = plans.current();
  const long = st.seg && st.seg[F.END] - st.seg[F.START] >= 60;
  const session = closeSegment(false);
  st.running = false;
  setWake(false);
  st.mode = 'short';
  reset();
  if (session && long) emit('focus:end', { session, completed: false, block: blockInfo(before), adv: plans.advanceIfDone() });
}

/** Acción elegida tras una sesión: iniciar la pausa ya preparada, otra sesión de enfoque, o detenerse. */
export function afterFocus(choice) {
  if (choice === 'again') { setMode('focus'); start(); }
  else if (choice === 'break') start();
}

export function setTag(tag) {
  const recording = st.running && st.mode === 'focus';
  if (recording) { tick(); closeSegment(false); }
  if (!db.cfg.tags.includes(tag)) db.cfg.tags.push(tag);
  db.cfg.tag = tag;
  if (db.cfg.task && tasks.byId(db.cfg.task)?.tag !== tag) db.cfg.task = null;
  saveCfg();
  if (recording && st.running) openSegment();
  emit('timer:state');
}

export function nextTag() {
  const tags = db.cfg.tags;
  setTag(tags[(tags.indexOf(db.cfg.tag) + 1) % tags.length]);
}

/** Inicia una sesión con la etiqueta, la tarea y la duración de la última registrada. */
export function repeatLast() {
  const last = db.ses.filter((r) => !r[F.DEL] && r !== st.seg).sort((a, b) => b[F.START] - a[F.START])[0];
  if (!last) return false;
  halt();
  const minutes = clamp(Math.round((last[F.END] - last[F.START]) / 60), 1, 180);
  if (!db.cfg.tags.includes(last[F.TAG])) db.cfg.tags.push(last[F.TAG]);
  db.cfg.tag = last[F.TAG];
  db.cfg.task = last[F.TASK] && tasks.byId(last[F.TASK]) ? last[F.TASK] : null;
  saveCfg();
  st.mode = 'focus';
  st.override = minutes;
  reset();
  st.override = null;
  start();
  return true;
}

/** Inicia el plan activo desde su primer bloque pendiente. */
export function startPlanned() {
  halt();
  st.mode = 'focus';
  reset();
  start();
}

export function init() {
  reset();
}
