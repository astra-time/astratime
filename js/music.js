/**
 * Reproductor flotante de YouTube / YouTube Music con cola de reproducción.
 *
 * El reproductor permanece activo mientras la página esté abierta: ocultar o minimizar la ventana solo
 * cambia su aspecto (clases CSS) y no detiene ni destruye el audio. La música se detiene únicamente con
 * los botones de pausa o de detener. Al terminar una canción se reproduce la siguiente de la cola.
 * Se controla con la IFrame Player API; si no puede cargarse, se usa un iframe básico sin cola.
 */
import { load, save } from './storage.js';
import { $, h } from './util.js';
import { icon } from './icons.js';

const HOST = 'https://www.youtube-nocookie.com';
const API = 'https://www.youtube.com/iframe_api';
const ID = /^[\w-]{6,}$/;
const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
const API_TIMEOUT_MS = 8000;

/**
 * Extrae el vídeo y la lista de un enlace de youtube.com, youtu.be o music.youtube.com.
 * @returns {{video: string|null, list: string|null}|null}
 */
export function parseYouTube(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let video = null;
  if (host === 'youtu.be') video = parts[0];
  else if (['youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (url.pathname === '/watch') video = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live'].includes(parts[0])) video = parts[1];
  } else return null;
  const list = url.searchParams.get('list');
  if (video && !ID.test(video)) video = null;
  if (list && !ID.test(list)) return null;
  return video || list ? { video, list } : null;
}

/** URL de incrustación básica, usada cuando la IFrame Player API no está disponible. */
export function embedUrl({ video, list }) {
  if (video && list) return `${HOST}/embed/${video}?list=${list}`;
  if (video) return `${HOST}/embed/${video}`;
  return `${HOST}/embed/videoseries?list=${list}`;
}

const describe = (src) => src.title || (src.video ? `Vídeo ${src.video}` : `Lista ${src.list}`);

let player = null;
let current = null;
let queue = load('ytq', []).filter((q) => q && (q.video || q.list));
let generation = 0;
let apiPromise = null;
let lastState = STATE.UNSTARTED;
let fallback = false;

const frame = () => $('#yt-frame');
const persistQueue = () => save('ytq', queue.map(({ video, list, title }) => ({ video, list, title })));

function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => reject(new Error('timeout')), API_TIMEOUT_MS);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); previous?.(); resolve(); };
    const script = document.createElement('script');
    script.src = API;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); reject(new Error('network')); };
    document.head.append(script);
  }).catch((err) => { apiPromise = null; throw err; });
  return apiPromise;
}

/* ---------- Interfaz ---------- */

function renderState(code) {
  lastState = code;
  const playing = code === STATE.PLAYING || code === STATE.BUFFERING;
  $('#yt-toggle').innerHTML = icon(playing ? 'pause' : 'play', 16);
  $('#yt-toggle').setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  $('#yt-state').textContent = playing ? 'Reproduciendo' : code === STATE.PAUSED ? 'En pausa' : code === STATE.ENDED ? 'Terminado' : current ? 'Listo' : '';
  $('#btn-music').classList.toggle('playing', playing);
  try {
    const title = player?.getVideoData?.().title;
    if (title && current) { current.title = title; $('#yt-title').textContent = title; }
  } catch { /* el título aún no está disponible */ }
}

function renderQueue() {
  $('#yt-qcount').textContent = queue.length ? `${queue.length} en cola` : '';
  const items = queue.map((item, index) => {
    const play = h('button', { class: 'ib sm', type: 'button', 'aria-label': `Reproducir ahora: ${describe(item)}`, onclick: () => playFromQueue(index) });
    const del = h('button', { class: 'ib sm', type: 'button', 'aria-label': `Quitar de la cola: ${describe(item)}`, onclick: () => { queue.splice(index, 1); persistQueue(); renderQueue(); } });
    play.innerHTML = icon('play', 14);
    del.innerHTML = icon('x', 14);
    return h('li', {}, h('span', { class: 'q-label', text: describe(item) }), play, del);
  });
  $('#yt-queue').replaceChildren(...(items.length ? items : [h('li', { class: 'empty', text: 'No hay canciones en la cola.' })]));
  updateControls();
}

function updateControls() {
  const available = !fallback;
  $('#yt-toggle').hidden = $('#yt-stop').hidden = !available;
  $('#yt-prev').hidden = !(available && current?.list);
  $('#yt-next').hidden = !(available && (current?.list || queue.length));
}

/* ---------- Reproducción ---------- */

function destroyPlayer() {
  generation++;
  try { player?.destroy(); } catch { /* ya liberado */ }
  player = null;
  frame().replaceChildren();
}

function useFallback(src, message) {
  fallback = true;
  frame().replaceChildren(h('iframe', {
    src: embedUrl(src), title: 'Reproductor de YouTube', allow: 'autoplay; encrypted-media; picture-in-picture',
    referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: true,
  }));
  $('#yt-title').textContent = 'Reproductor básico';
  $('#yt-state').textContent = 'Usa los controles del vídeo';
  if (message) $('#yt-msg').textContent = message;
  updateControls();
}

async function createPlayer(src, autoplay, token) {
  await loadApi();
  if (token !== generation) return;
  const holder = h('div');
  frame().replaceChildren(holder);
  player = new window.YT.Player(holder, {
    host: HOST,
    width: '100%',
    height: '100%',
    videoId: src.video || undefined,
    playerVars: { playsinline: 1, rel: 0, autoplay: autoplay ? 1 : 0, ...(src.list ? { listType: 'playlist', list: src.list } : {}) },
    events: {
      onReady: () => renderState(lastState),
      onStateChange: (e) => { renderState(e.data); if (e.data === STATE.ENDED) onEnded(); },
      onError: () => { $('#yt-msg').textContent = 'Este contenido no se puede reproducir incrustado.'; },
    },
  });
}

/**
 * Reproduce una fuente. Si ya existe un reproductor se reutiliza (`loadVideoById` / `loadPlaylist`), lo que
 * permite encadenar canciones en segundo plano sin un nuevo gesto del usuario.
 */
async function playSource(src, { autoplay = true, viaQueue = false } = {}) {
  current = { ...src };
  $('#yt-msg').textContent = '';
  $('#yt-title').textContent = describe(current);
  renderState(STATE.UNSTARTED);
  updateControls();
  try {
    if (player && !fallback) {
      if (src.list && !src.video) { player.loadPlaylist({ listType: 'playlist', list: src.list }); return; }
      if (src.video && (!src.list || viaQueue)) { player.loadVideoById(src.video); return; }
    }
    destroyPlayer();
    fallback = false;
    await createPlayer(src, autoplay, generation);
  } catch {
    useFallback(src, 'No se pudo cargar el control del reproductor; se usa el modo básico.');
  }
}

function playNext() {
  const next = queue.shift();
  persistQueue();
  renderQueue();
  if (next) playSource(next, { autoplay: true, viaQueue: true });
  else $('#yt-state').textContent = 'Terminado';
}

function playFromQueue(index) {
  const [item] = queue.splice(index, 1);
  persistQueue();
  renderQueue();
  if (item) playSource(item, { autoplay: true });
}

/** Una lista de reproducción avanza sola; solo se pasa a la cola cuando termina su último elemento. */
function onEnded() {
  if (current?.list) {
    try {
      const ids = player.getPlaylist?.();
      const index = player.getPlaylistIndex?.();
      if (!Array.isArray(ids) || !Number.isInteger(index) || index < ids.length - 1) return;
    } catch { return; }
  }
  playNext();
}

function skipNext() {
  if (current?.list && player) {
    try {
      const ids = player.getPlaylist?.();
      const index = player.getPlaylistIndex?.();
      if (Array.isArray(ids) && index < ids.length - 1) { player.nextVideo(); return; }
    } catch { /* se pasa a la cola */ }
  }
  playNext();
}

const isIdle = () => !current || lastState === STATE.ENDED;

/* ---------- Ventana ---------- */

export function initMusic() {
  const win = $('#yt');
  const button = $('#btn-music');
  const input = $('#yt-url');
  $('#yt-min').innerHTML = icon('minus', 16);
  $('#yt-close').innerHTML = icon('x', 16);
  $('#yt-prev').innerHTML = icon('prev', 16);
  $('#yt-next').innerHTML = icon('next', 16);
  $('#yt-stop').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  renderState(STATE.UNSTARTED);
  renderQueue();

  const hidden = () => win.classList.contains('is-hidden');
  const minimized = () => win.classList.contains('min');
  const refresh = () => {
    const min = minimized();
    $('#yt-min').innerHTML = icon(min ? 'expand' : 'minus', 16);
    $('#yt-min').setAttribute('aria-label', min ? 'Expandir' : 'Minimizar');
    button.setAttribute('aria-expanded', String(!hidden() && !min));
    document.body.classList.toggle('has-player', !hidden());
  };
  const minimize = (min) => { win.classList.toggle('min', min); refresh(); };

  /** Ocultar y mostrar solo cambian clases CSS: el reproductor sigue vivo y sonando. */
  const setHidden = (value) => {
    win.classList.toggle('is-hidden', value);
    win.toggleAttribute('inert', value);
    win.setAttribute('aria-hidden', String(value));
    refresh();
  };

  const open = () => {
    setHidden(false);
    minimize(false);
    const saved = load('yt', '');
    input.value = saved;
    const src = saved && parseYouTube(saved);
    if (src && !current) { current = { ...src }; playSource(src, { autoplay: false }); }
  };

  button.addEventListener('click', () => (hidden() ? open() : setHidden(true)));
  $('#yt-close').addEventListener('click', () => { setHidden(true); button.focus(); });
  $('#yt-min').addEventListener('click', () => minimize(!minimized()));

  $('#yt-toggle').addEventListener('click', () => {
    if (lastState === STATE.PLAYING || lastState === STATE.BUFFERING) player?.pauseVideo(); else player?.playVideo();
  });
  $('#yt-stop').addEventListener('click', () => {
    try { player?.stopVideo(); } catch { /* ya detenido */ }
    $('#yt-state').textContent = 'Detenido';
    $('#btn-music').classList.remove('playing');
    lastState = STATE.UNSTARTED;
  });
  $('#yt-prev').addEventListener('click', () => player?.previousVideo?.());
  $('#yt-next').addEventListener('click', skipNext);

  const read = () => {
    const src = parseYouTube(input.value);
    if (!src) $('#yt-msg').textContent = 'Enlace no válido. Usa una URL de vídeo o lista de YouTube o YouTube Music.';
    return src;
  };
  $('#yt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const src = read();
    if (!src) return;
    save('yt', input.value.trim());
    playSource(src, { autoplay: true });
  });
  $('#yt-enqueue').addEventListener('click', () => {
    if (!input.reportValidity()) return;
    const src = read();
    if (!src) return;
    $('#yt-msg').textContent = '';
    save('yt', input.value.trim());
    queue.push(src);
    persistQueue();
    renderQueue();
    input.value = '';
    if (isIdle()) playNext();
  });
  refresh();
}
