/** Representación del temporizador: anillo, tiempo, controles, etiqueta y estado de la pestaña. */
import { db } from './data.js';
import { st } from './timer.js';
import * as tasks from './tasks.js';
import { $, $$, h, fmtClock, fmtTime } from './util.js';
import { icon } from './icons.js';
import { setFaviconState } from './theme.js';

const NAMES = { focus: 'Enfoque', short: 'Pausa corta', long: 'Pausa larga' };
const CIRCUMFERENCE = 628.32;

function faviconState() {
  if (st.mode !== 'focus' && st.running) return 'break';
  if (st.running) return 'focus';
  return st.rem < st.total ? 'paused' : 'idle';
}

export function renderTimer() {
  const { mode, running, rem, total } = st;
  const clock = fmtClock(rem);
  $('#time').textContent = clock;
  $('#label').textContent = NAMES[mode];
  $('#arc').style.strokeDashoffset = CIRCUMFERENCE * (total ? rem / total : 1);
  $('#orb').style.transform = `rotate(${(total ? 1 - rem / total : 0) * 360}deg)`;
  document.body.classList.toggle('running', running);
  $('#go').innerHTML = icon(running ? 'pause' : 'play', 30);
  $('#go').setAttribute('aria-label', running ? 'Pausar' : 'Iniciar');
  $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === mode)));

  const started = running || rem < total;
  document.title = started ? `${clock} - AstraTime${mode === 'focus' ? '' : ' · descanso'}${running ? '' : ' (en pausa)'}` : 'AstraTime';
  setFaviconState(faviconState());

  const n = st.done % db.cfg.every;
  $('#dots').replaceChildren(...Array.from({ length: db.cfg.every }, (_, i) => h('i', {
    class: i < n || (mode === 'long' && st.done > 0 && n === 0) ? 'f' : '',
  })));
  $('#ends').textContent = `${running ? 'Termina' : 'Si empiezas ahora, termina'} a las ${fmtTime(Date.now() / 1000 + rem)}`;

  const task = tasks.active();
  $('#taskn').textContent = db.cfg.tag;
  $('#tasks-sub').textContent = task ? `Tarea: ${task.title}` : 'Etiqueta de la sesión';
}

export function renderTagPicker(onPick) {
  $('#tagpick').replaceChildren(...db.cfg.tags.map((t) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(t === db.cfg.tag), text: t, onclick: () => onPick(t),
  })));
}
