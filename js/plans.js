/**
 * Planificación por objetivos globales: un plan es una secuencia de bloques (etiqueta + minutos).
 * El avance de cada bloque se deriva de las sesiones vinculadas, no de un contador aparte.
 */
import { db, F, persist, saveCfg, liveSessions } from './data.js';
import { emit } from './bus.js';
import { $, h, uid } from './util.js';
import { icon } from './icons.js';
import { toast } from './dialogs.js';

const blockSec = (key) => liveSessions().filter((r) => r[F.BLOCK] === key).reduce((a, r) => a + r[F.END] - r[F.START], 0);
export const doneMin = (key) => Math.round(blockSec(key) / 60);

/** Bloque en curso del plan activo, con su progreso. */
export function current() {
  const plan = db.plan;
  if (!plan || plan.idx >= plan.blocks.length) return null;
  const block = plan.blocks[plan.idx];
  const key = `${plan.run}:${plan.idx}`;
  const doneSec = blockSec(key);
  // Margen de 30 s: las sesiones pueden durar algo menos que lo previsto por pausas o redondeo de segundos.
  const left = block.min * 60 - doneSec;
  return { plan, block, key, idx: plan.idx, doneSec, remainSec: left < 30 ? 0 : left };
}

/** Avanza los bloques cumplidos. Devuelve si hubo cambio de bloque o si el plan terminó. */
export function advanceIfDone() {
  let moved = false;
  while (current() && current().remainSec <= 0) { db.plan.idx++; moved = true; }
  let finished = false;
  if (db.plan && db.plan.idx >= db.plan.blocks.length) {
    finished = true;
    const name = db.plan.name;
    db.plan = null;
    db.cfg.plansDone++;
    saveCfg();
    persist('plan');
    emit('plan:done', name);
  } else if (moved) {
    db.cfg.tag = db.plan.blocks[db.plan.idx].tag;
    saveCfg();
    persist('plan');
  }
  return { moved, finished };
}

export function begin(blocks, name = '') {
  db.plan = { run: uid(), name, idx: 0, blocks: blocks.map((b) => ({ id: uid(), tag: b.tag, min: b.min })) };
  db.cfg.tag = db.plan.blocks[0].tag;
  saveCfg();
  persist('plan');
  emit('plan:begin');
}

export function cancel() {
  db.plan = null;
  persist('plan');
  toast('Plan cancelado. Las sesiones registradas se conservan.');
}

export const presets = () => db.presets.filter((p) => !p.del);

export function savePreset(name, blocks, id = null) {
  const now = Date.now();
  const own = id && db.presets.find((p) => p.id === id);
  if (own) Object.assign(own, { name, blocks, u: now });
  else db.presets.push({ id: uid(), name, blocks, u: now, del: 0 });
  persist('presets');
}

export function deletePreset(id) {
  const p = db.presets.find((x) => x.id === id);
  if (p) { p.del = 1; p.u = Date.now(); persist('presets'); }
}

const describe = (blocks) => blocks.map((b) => `${b.min} min ${b.tag}`).join(' + ');

/* ---------- Interfaz ---------- */

export function renderStrip() {
  const el = $('#plan-strip');
  const c = current();
  el.hidden = !c;
  if (!c) return;
  const pct = Math.min(100, (c.doneSec / (c.block.min * 60)) * 100);
  el.replaceChildren(
    h('div', { class: 'ps-top' },
      h('span', { class: 'ps-name', text: `${c.plan.name || 'Plan'} · bloque ${c.idx + 1} de ${c.plan.blocks.length}` }),
      h('button', { class: 'link', type: 'button', text: 'Cancelar', onclick: () => { cancel(); renderStrip(); } })),
    h('div', { class: 'ps-line', text: `${c.block.tag}: ${Math.round(c.doneSec / 60)} de ${c.block.min} min` }),
    h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
  );
}

export function renderPresetMenu() {
  const menu = $('#preset-menu');
  const items = presets();
  menu.replaceChildren(
    ...items.map((p) => h('button', {
      class: 'pm-item', type: 'button', 'data-id': p.id,
    }, h('b', { text: p.name }), h('small', { text: describe(p.blocks) }))),
    ...(items.length ? [] : [h('p', { class: 'sub', text: 'Todavía no hay presets guardados.' })]),
    h('button', { class: 'pm-new', type: 'button', 'data-new': '1', text: 'Nuevo plan' }),
  );
}

export function renderPresetSettings() {
  const ul = $('#preset-list');
  const items = presets();
  ul.replaceChildren(...(items.length
    ? items.map((p) => {
      const del = h('button', { class: 'ib sm', type: 'button', 'aria-label': `Eliminar preset ${p.name}`, onclick: () => deletePreset(p.id) });
      del.innerHTML = icon('trash', 16);
      return h('li', { class: 'pr-row' }, h('span', {}, h('b', { text: p.name }), h('small', { class: 'sub', text: describe(p.blocks) })), del);
    })
    : [h('li', { class: 'sub', text: 'Sin presets. Se crean desde el constructor de planes.' })]));
}

let rows = [];
let editing = null;

function drawRows() {
  const list = $('#pl-rows');
  const options = db.cfg.tags;
  list.replaceChildren(...rows.map((row, i) => {
    const select = h('select', { 'aria-label': `Etiqueta del bloque ${i + 1}`, onchange: (e) => { row.tag = e.target.value; } },
      options.map((t) => h('option', { value: t, text: t, selected: t === row.tag })));
    const minutes = h('input', {
      type: 'number', min: '1', max: '600', value: row.min, inputmode: 'numeric', 'aria-label': `Minutos del bloque ${i + 1}`,
      oninput: (e) => { row.min = Number(e.target.value); totalText(); },
    });
    const del = h('button', { class: 'ib sm', type: 'button', 'aria-label': `Quitar bloque ${i + 1}`, disabled: rows.length < 2, onclick: () => { rows.splice(i, 1); drawRows(); } });
    del.innerHTML = icon('x', 16);
    return h('li', { class: 'plrow' }, h('span', { class: 'sub', text: `${i + 1}.` }), select, minutes, h('span', { class: 'sub', text: 'min' }), del);
  }));
  totalText();
}

const totalText = () => { $('#pl-total').textContent = `Duración total: ${rows.reduce((a, r) => a + (r.min || 0), 0)} min`; };

export function openBuilder(prefill = null) {
  editing = prefill?.id ?? null;
  rows = (prefill?.blocks ?? [{ tag: db.cfg.tag, min: 60 }, { tag: db.cfg.tags[1] ?? db.cfg.tag, min: 30 }]).map((b) => ({ ...b }));
  $('#pl-name').value = prefill?.name ?? '';
  $('#pl-error').textContent = '';
  drawRows();
  $('#dlg-plan').showModal();
}

export function initPlans() {
  const dlg = $('#dlg-plan');
  $('#pl-add').addEventListener('click', () => { rows.push({ tag: db.cfg.tag, min: 30 }); drawRows(); });
  $('#pl-form').addEventListener('submit', (e) => {
    const action = e.submitter?.value;
    if (action === 'cancel') return;
    const name = $('#pl-name').value.trim().slice(0, 40);
    const valid = rows.length && rows.every((r) => Number.isFinite(r.min) && r.min >= 1 && r.min <= 600);
    if (!valid) { e.preventDefault(); $('#pl-error').textContent = 'Cada bloque necesita entre 1 y 600 minutos.'; return; }
    if (action === 'save' && !name) { e.preventDefault(); $('#pl-error').textContent = 'Indica un nombre para guardar el preset.'; return; }
    if (action === 'save') savePreset(name, rows.map((r) => ({ ...r })), editing);
  });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'start') begin(rows, $('#pl-name').value.trim().slice(0, 40));
    else if (dlg.returnValue === 'save') toast('Preset guardado.');
  });
}
