/** Tareas vinculadas a las sesiones, con tiempo estimado frente al real. */
import { db, F, persist, saveCfg, liveSessions } from './data.js';
import { emit } from './bus.js';
import { $, h, uid } from './util.js';
import { icon } from './icons.js';

export const list = () => db.tasks.filter((t) => !t.del);
export const byId = (id) => list().find((t) => t.id === id) ?? null;
export const active = () => { const t = byId(db.cfg.task); return t && !t.done ? t : null; };

/** Tiempo real acumulado (s) en las sesiones vinculadas a la tarea. */
export const realSec = (id) => liveSessions().filter((r) => r[F.TASK] === id).reduce((a, r) => a + r[F.END] - r[F.START], 0);

export function add({ title, est, tag }) {
  const clean = title.trim().slice(0, 80);
  if (!clean) return null;
  const now = Date.now();
  const task = { id: uid(), title: clean, tag, est: Math.max(0, Math.round(est) || 0), done: 0, created: now, u: now, del: 0 };
  db.tasks.push(task);
  persist('tasks');
  return task;
}

function touch(task, patch) {
  Object.assign(task, patch, { u: Date.now() });
  persist('tasks');
}

export function setDone(id, done) {
  const t = byId(id);
  if (!t) return;
  touch(t, { done: done ? 1 : 0 });
  if (done && db.cfg.task === id) { db.cfg.task = null; saveCfg(); }
}

export function remove(id) {
  const t = byId(id);
  if (!t) return;
  touch(t, { del: 1 });
  if (db.cfg.task === id) { db.cfg.task = null; saveCfg(); }
}

export function select(id) {
  const t = byId(id);
  db.cfg.task = db.cfg.task === id ? null : id;
  saveCfg();
  if (t && db.cfg.task) emit('task:select', t);
}

/** Recupera la primera tarea pendiente de la etiqueta activa cuando no hay una seleccionada. */
export function recover() {
  if (active()) return;
  const pending = list().find((t) => !t.done && t.tag === db.cfg.tag);
  db.cfg.task = pending ? pending.id : null;
}

export function render() {
  const items = [...list()].sort((a, b) => a.done - b.done || a.created - b.created);
  const pending = items.filter((t) => !t.done).length;
  $('#tasks-h').textContent = pending ? `${pending} pendiente${pending === 1 ? '' : 's'}` : 'Sin pendientes';
  $('#task-list').replaceChildren(...items.map((t) => {
    const real = Math.round(realSec(t.id) / 60);
    const over = t.est && real > t.est;
    return h('li', { class: `task-item${t.done ? ' done' : ''}${t.id === db.cfg.task ? ' sel' : ''}` },
      h('button', {
        class: 'ti-main', type: 'button', 'aria-pressed': String(t.id === db.cfg.task), disabled: !!t.done,
        onclick: () => select(t.id),
      }, h('span', { class: 'ti-title', text: t.title }),
      h('span', { class: `ti-meta${over ? ' over' : ''}`, text: `${t.tag} · ${real}${t.est ? ` / ${t.est}` : ''} min` })),
      h('button', {
        class: 'ib sm', type: 'button', 'aria-label': t.done ? `Reabrir ${t.title}` : `Completar ${t.title}`,
        onclick: () => setDone(t.id, !t.done),
      }),
      h('button', { class: 'ib sm', type: 'button', 'aria-label': `Eliminar ${t.title}`, onclick: () => remove(t.id) }));
  }));
  // Los iconos se inyectan después de crear los botones para mantener `h` libre de HTML.
  [...$('#task-list').children].forEach((li, i) => {
    const [, doneBtn, delBtn] = li.children;
    doneBtn.innerHTML = icon(items[i].done ? 'repeat' : 'check', 16);
    delBtn.innerHTML = icon('trash', 16);
  });
}

export function initTasks() {
  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#task-title');
    const task = add({ title: title.value, est: Number($('#task-est').value), tag: db.cfg.tag });
    if (!task) return;
    title.value = '';
    $('#task-est').value = '';
    title.focus();
  });
}
