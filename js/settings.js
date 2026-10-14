/** Enlace entre los controles de la vista Ajustes y la configuración. */
import { db, saveCfg, wipeHistory } from './data.js';
import { $, $$, h } from './util.js';
import { SOUNDS, play } from './audio.js';
import { confirmDialog, toast } from './dialogs.js';
import * as timer from './timer.js';
import { applyTheme } from './theme.js';
import { renderPresetSettings } from './plans.js';

const NUMBERS = ['focus', 'short', 'long', 'every', 'goal'];
const TOGGLES = { 'c-auto': 'auto', 'c-wake': 'wake', 'c-smart': 'smartClose', 'c-streaks': 'streaks', 'c-sndon': 'soundOn', 'c-motion': 'reduceMotion', 'c-contrast': 'highContrast' };

function soundSummary() {
  $('#sndh').textContent = db.cfg.soundOn ? SOUNDS[db.cfg.sound]?.name ?? '' : 'Desactivado';
  $('#sndset').classList.toggle('off', !db.cfg.soundOn);
  $('#c-sound').disabled = $('#c-vol').disabled = !db.cfg.soundOn;
}

export function renderTags() {
  const { tags, tag } = db.cfg;
  $('#tagh').textContent = `${tags.length} ${tags.length === 1 ? 'etiqueta' : 'etiquetas'}`;
  $('#taglist').replaceChildren(...tags.map((t) => h('span', { class: 'chip' }, t, h('button', {
    class: 'x', type: 'button', 'aria-label': `Quitar etiqueta ${t}`, disabled: tags.length < 2,
    onclick: () => {
      db.cfg.tags = tags.filter((x) => x !== t);
      if (tag === t) timer.setTag(db.cfg.tags[0]); else saveCfg();
    },
  }, '×'))));
}

export function applySettings() {
  const { cfg } = db;
  NUMBERS.forEach((k) => { $(`#c-${k}`).value = cfg[k]; });
  for (const [id, key] of Object.entries(TOGGLES)) $(`#${id}`).checked = !!cfg[key];
  $('#c-notify').checked = cfg.notify;
  $('#c-sound').value = cfg.sound;
  $('#c-vol').value = cfg.vol;
  $('#c-vol-out').textContent = `${Math.round(cfg.vol * 100)}%`;
  soundSummary();
  renderTags();
  renderPresetSettings();
}

export function initSettings() {
  $('#c-sound').replaceChildren(...Object.entries(SOUNDS).map(([id, s]) => h('option', { value: id, text: s.name })));

  for (const key of NUMBERS) {
    const input = $(`#c-${key}`);
    input.addEventListener('change', () => {
      const value = Math.max(1, Math.round(Number(input.value)) || db.cfg[key]);
      db.cfg[key] = value;
      input.value = value;
      saveCfg();
      if (!timer.st.running) timer.restart();
    });
  }

  for (const [id, key] of Object.entries(TOGGLES)) {
    $(`#${id}`).addEventListener('change', (e) => {
      db.cfg[key] = e.target.checked;
      saveCfg();
      if (key === 'reduceMotion' || key === 'highContrast') applyTheme();
      if (key === 'soundOn') { soundSummary(); if (db.cfg.soundOn) play(db.cfg.sound, db.cfg.vol); }
    });
  }

  $('#c-notify').addEventListener('change', async (e) => {
    db.cfg.notify = e.target.checked;
    if (db.cfg.notify && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* sin permiso */ }
    }
    const granted = 'Notification' in window && Notification.permission === 'granted';
    $('#nmsg').textContent = db.cfg.notify && !granted ? 'El navegador no permite notificaciones; se usarán el sonido y la vibración.' : '';
    saveCfg();
  });

  $('#c-sound').addEventListener('change', (e) => { db.cfg.sound = e.target.value; saveCfg(); soundSummary(); play(db.cfg.sound, db.cfg.vol); });
  $('#c-vol').addEventListener('input', (e) => { db.cfg.vol = Number(e.target.value); $('#c-vol-out').textContent = `${Math.round(db.cfg.vol * 100)}%`; });
  $('#c-vol').addEventListener('change', () => { saveCfg(); play(db.cfg.sound, db.cfg.vol); });
  $('#test').addEventListener('click', () => play(db.cfg.sound, db.cfg.vol));

  const addTag = () => {
    const name = $('#newtag').value.trim().slice(0, 24);
    if (!name) return;
    $('#newtag').value = '';
    timer.setTag(name);
  };
  $('#addtag').addEventListener('click', addTag);
  $('#newtag').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

  $('#wipe').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Borrar historial',
      text: 'Se eliminarán todas las sesiones registradas y, si usas Google Drive, también en la copia remota al sincronizar. Esta acción no se puede deshacer.',
      ok: 'Borrar todo',
    });
    if (!ok) return;
    wipeHistory();
    timer.afterWipe();
    toast('Historial borrado.');
  });
}
