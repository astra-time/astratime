/** Exportación e importación de la copia local en formato JSON. */
import { snapshot, mergeSnapshot } from './data.js';
import { $, h, dayKey } from './util.js';
import { confirmDialog } from './dialogs.js';

const say = (text) => { $('#msg').textContent = text; };

export function exportData() {
  const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
  const link = h('a', { href: URL.createObjectURL(blob), download: `astratime-${dayKey(new Date())}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  say('Copia guardada.');
}

async function importFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { say('El archivo no es una copia válida de AstraTime.'); return; }
  const count = Array.isArray(data?.ses) ? data.ses.length : 0;
  if (!count) { say('El archivo no contiene sesiones.'); return; }
  const ok = await confirmDialog({
    title: 'Importar historial',
    text: `Se añadirán hasta ${count} sesiones al historial actual. Las que ya existan no se duplican y el tiempo coincidente se cuenta una sola vez.`,
    ok: 'Importar',
  });
  if (!ok) { say('Importación cancelada.'); return; }
  say(`Importadas ${mergeSnapshot(data)} sesiones nuevas.`);
}

export function initBackup() {
  $('#exp').addEventListener('click', exportData);
  $('#imp').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importFile(file);
  });
}
