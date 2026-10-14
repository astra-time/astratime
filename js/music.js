/**
 * Ventana flotante de YouTube / YouTube Music.
 *
 * Se controla mediante la IFrame Player API. Minimizar la ventana mantiene el reproductor activo
 * (queda visible en miniatura con sus controles); cerrarla o pausarlo detiene el audio. Si la API no
 * puede cargarse, se recurre a un iframe básico con los controles nativos de YouTube.
 */
import { load, save } from './storage.js';
import { $, h } from './util.js';
import { icon } from './icons.js';

const HOST = 'https://www.youtube-nocookie.com';
const API = 'https://www.youtube.com/iframe_api';
const ID = /^[\w-]{6,}$/;
const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
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

let player = null;
let current = null;
let generation = 0;
let apiPromise = null;

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

const frame = () => $('#yt-frame');

function renderState(code) {
  const playing = code === STATE.PLAYING || code === STATE.BUFFERING;
  $('#yt-toggle').innerHTML = icon(playing ? 'pause' : 'play', 16);
  $('#yt-toggle').setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
  $('#yt-state').textContent = playing ? 'Reproduciendo' : code === STATE.PAUSED ? 'En pausa' : code === STATE.ENDED ? 'Terminado' : 'Listo';
  try {
    const title = player?.getVideoData?.().title;
    if (title) $('#yt-title').textContent = title;
  } catch { /* el título no está disponible todavía */ }
}

function setControls(available, hasList) {
  $('#yt-toggle').hidden = !available;
  $('#yt-prev').hidden = $('#yt-next').hidden = !(available && hasList);
}

/** Libera el reproductor actual. Destruir el iframe detiene el audio. */
function destroyPlayer() {
  generation++;
  try { player?.destroy(); } catch { /* ya liberado */ }
  player = null;
  frame().replaceChildren();
}

function useFallback(src, message) {
  frame().replaceChildren(h('iframe', {
    src: embedUrl(src), title: 'Reproductor de YouTube', allow: 'autoplay; encrypted-media; picture-in-picture',
    referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: true,
  }));
  setControls(false, false);
  $('#yt-title').textContent = 'Reproductor básico';
  $('#yt-state').textContent = 'Usa los controles del vídeo';
  if (message) $('#yt-msg').textContent = message;
}

async function start(src, autoplay) {
  destroyPlayer();
  const token = generation;
  current = src;
  $('#yt-msg').textContent = '';
  $('#yt-title').textContent = 'Cargando…';
  $('#yt-state').textContent = '';
  setControls(true, !!src.list);
  renderState(-1);
  try {
    await loadApi();
  } catch {
    if (token === generation) useFallback(src, 'No se pudo cargar el control del reproductor; se usa el modo básico.');
    return;
  }
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
      onReady: () => renderState(-1),
      onStateChange: (e) => renderState(e.data),
      onError: () => { $('#yt-msg').textContent = 'Este contenido no se puede reproducir incrustado.'; },
    },
  });
}

export function initMusic() {
  const win = $('#yt');
  const button = $('#btn-music');
  const input = $('#yt-url');
  $('#yt-min').innerHTML = icon('minus', 16);
  $('#yt-close').innerHTML = icon('x', 16);
  $('#yt-prev').innerHTML = icon('prev', 16);
  $('#yt-next').innerHTML = icon('next', 16);
  renderState(-1);

  const minimized = () => win.classList.contains('min');
  const refresh = () => {
    const min = minimized();
    $('#yt-min').innerHTML = icon(min ? 'expand' : 'minus', 16);
    $('#yt-min').setAttribute('aria-label', min ? 'Expandir reproductor' : 'Minimizar (la música sigue sonando)');
    button.setAttribute('aria-expanded', String(!win.hidden && !min));
  };
  const minimize = (min) => { win.classList.toggle('min', min); refresh(); };

  const open = () => {
    win.hidden = false;
    minimize(false);
    const saved = load('yt', '');
    input.value = saved;
    const src = saved && parseYouTube(saved);
    if (src && !player && !frame().firstChild) start(src, false);
  };

  /** Cerrar detiene la reproducción. */
  const close = () => {
    destroyPlayer();
    current = null;
    $('#yt-title').textContent = 'Sin reproducción';
    $('#yt-state').textContent = '';
    win.hidden = true;
    minimize(false);
  };

  // El botón de la cabecera nunca cierra: abre, minimiza o expande, para no cortar la música por error.
  button.addEventListener('click', () => (win.hidden ? open() : minimize(!minimized())));
  $('#yt-min').addEventListener('click', () => minimize(!minimized()));
  $('#yt-close').addEventListener('click', () => { close(); button.focus(); });
  $('#yt-toggle').addEventListener('click', () => {
    const state = player?.getPlayerState?.();
    if (state === STATE.PLAYING || state === STATE.BUFFERING) player.pauseVideo(); else player?.playVideo();
  });
  $('#yt-prev').addEventListener('click', () => player?.previousVideo?.());
  $('#yt-next').addEventListener('click', () => player?.nextVideo?.());
  $('#yt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const src = parseYouTube(input.value);
    if (!src) { $('#yt-msg').textContent = 'Enlace no válido. Usa una URL de vídeo o lista de YouTube o YouTube Music.'; return; }
    save('yt', input.value.trim());
    start(src, true);
  });
  refresh();
}
