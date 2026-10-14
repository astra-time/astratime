/**
 * Copia de seguridad opcional en Google Drive.
 * Usa Google Identity Services (flujo de token) y la API REST de Drive v3 con el ámbito
 * drive.appdata, que limita el acceso a una carpeta oculta propia de la aplicación.
 */
import { snapshot, mergeSnapshot } from './data.js';
import { on } from './bus.js';
import { load, save } from './storage.js';
import { $, debounce } from './util.js';

const FILE = 'astratime-backup.json';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const GIS = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com';

let token = null;
let expires = 0;
let busy = false;

const clientId = () => String(load('gcid', '')).trim();
const authorized = () => !!token && Date.now() < expires;
const say = (text) => { $('#gmsg').textContent = text; };

function updateUi() {
  $('#gsync').textContent = authorized() ? 'Sincronizar ahora' : 'Conectar y sincronizar';
  $('#gout').hidden = !authorized();
}

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services (¿sin conexión?)'));
    document.head.append(script);
  });
}

async function authorize(prompt) {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: (res) => {
        if (res.error) return reject(new Error(res.error_description || res.error));
        token = res.access_token;
        expires = Date.now() + (Number(res.expires_in || 3600) - 60) * 1000;
        save('gon', 1);
        resolve();
      },
      error_callback: (err) => reject(new Error(err?.type === 'popup_closed' ? 'Ventana de Google cerrada' : 'No se pudo conectar con Google')),
    });
    client.requestAccessToken({ prompt });
  });
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } });
  if (!res.ok) {
    if (res.status === 401) token = null;
    throw new Error(`Drive respondió ${res.status}`);
  }
  return res;
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE}'`);
  const res = await request(`${API}/drive/v3/files?spaces=appDataFolder&fields=files(id)&q=${q}`);
  return (await res.json()).files?.[0] ?? null;
}

async function upload(id, body) {
  const json = JSON.stringify(body);
  if (id) {
    return request(`${API}/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json });
  }
  const boundary = `astratime${Date.now()}`;
  const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'] });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  return request(`${API}/upload/drive/v3/files?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
}

/** Descarga la copia remota, la integra con los datos locales y sube el resultado. */
export async function sync(manual) {
  if (busy) return;
  if (!clientId()) { if (manual) say('Introduce primero tu Client ID de Google (ver README).'); return; }
  busy = true;
  try {
    if (!authorized()) {
      if (!manual) return;
      say('Conectando con Google…');
      await authorize(load('gon', 0) ? '' : 'consent');
    }
    say('Sincronizando…');
    const file = await findFile();
    if (file) mergeSnapshot(await (await request(`${API}/drive/v3/files/${file.id}?alt=media`)).json(), { sync: true });
    await upload(file?.id, snapshot());
    const time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    say(`Sincronizado a las ${time}. Se repite tras cada cambio mientras la conexión siga activa (aprox. una hora).`);
    $('#sync').textContent = `Copia en Drive: ${time}`;
  } catch (err) {
    say(`No se pudo sincronizar: ${err.message}`);
  } finally {
    busy = false;
    updateUi();
  }
}

export function initDrive() {
  $('#gcid').value = clientId();
  $('#gcid').addEventListener('input', (e) => save('gcid', e.target.value.trim()));
  $('#gsync').addEventListener('click', () => sync(true));
  $('#gout').addEventListener('click', () => {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch { /* sin acceso a GIS */ }
    token = null;
    expires = 0;
    save('gon', 0);
    updateUi();
    say('Desconectado. Los datos que ya estén en Drive no se han borrado.');
  });
  const auto = debounce(() => { if (authorized()) sync(false); }, 20000);
  for (const key of ['ses', 'tasks', 'presets']) on(`change:${key}`, auto);
  updateUi();
}
