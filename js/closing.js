/** Cierre inteligente de sesión: tarea completada, objetivo del bloque y siguiente paso. */
import { db, F, saveCfg } from './data.js';
import { on } from './bus.js';
import { $ } from './util.js';
import * as timer from './timer.js';
import * as tasks from './tasks.js';
import * as plans from './plans.js';

function handle(e) {
  if (!db.cfg.smartClose || !e.session) {
    timer.afterFocus(e.completed && db.cfg.auto ? 'break' : 'stop');
    return;
  }
  const dlg = $('#dlg-close');
  const minutes = Math.max(1, Math.round((e.session[F.END] - e.session[F.START]) / 60));
  const task = tasks.byId(e.session[F.TASK]);
  const askTask = !!task && !task.done;
  let message = '';
  let again = 'Otra sesión de enfoque';

  if (e.block) {
    const missing = e.block.min - e.block.doneMin;
    if (e.adv.finished) message = 'Plan completado.';
    else if (e.adv.moved) {
      const next = plans.current();
      message = `Bloque completado. Siguiente: ${next.block.min} min de ${next.block.tag}.`;
      again = 'Empezar el siguiente bloque';
    } else {
      const extra = Math.min(missing, db.cfg.focus);
      message = `Objetivo del bloque: ${e.block.doneMin} de ${e.block.min} min (faltan ${missing} min).`;
      again = `Sesión extra de ${extra} min en ${e.block.tag}`;
    }
  }

  $('#cl-title').textContent = e.completed ? 'Sesión completada' : 'Sesión finalizada';
  $('#cl-sum').textContent = `${minutes} min · ${e.session[F.TAG]}`;
  $('#cl-task').hidden = !askTask;
  if (askTask) {
    $('#cl-task-name').textContent = task.title;
    $('#cl-task-no').checked = true;
  }
  $('#cl-block').textContent = message;
  $('#cl-block').hidden = !message;
  $('#cl-again').textContent = again;
  dlg.returnValue = '';
  dlg.addEventListener('close', () => {
    if (askTask && $('#cl-task-yes').checked) tasks.setDone(task.id, true);
    saveCfg();
    timer.afterFocus(dlg.returnValue || 'stop');
  }, { once: true });
  dlg.showModal();
}

export function initClosing() {
  on('focus:end', handle);
}
