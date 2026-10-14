# AstraTime

Aplicación web progresiva (PWA) de temporizador Pomodoro con registro de horas de estudio, etiquetas, planificación por bloques, tareas, estadísticas, calendario de actividad editable e hitos personales. Funciona íntegramente en el cliente, sin servidor propio, y es instalable y utilizable sin conexión.

## Propósito y alcance

AstraTime se desarrolló para uso personal: llevar un registro transparente y fiable de las horas de estudio y organizar el tiempo de trabajo. El código se publica de forma abierta para que cualquier persona pueda usarlo, adaptarlo o alojarlo por su cuenta.

No hay cuentas de usuario, servidor ni telemetría. Los datos permanecen en el navegador salvo que el usuario exporte una copia o active de forma expresa la sincronización con Google Drive.

## Funcionalidades

**Temporizador**
- Duraciones configurables de enfoque, pausa corta y pausa larga, y número de sesiones hasta la pausa larga.
- Inicio automático opcional de la siguiente fase y hora estimada de finalización.
- Tiempo restante en el título de la pestaña (por ejemplo, `24:59 - AstraTime`) y favicon dinámico que cambia de color según el estado: enfoque, descanso o pausa.
- Pantalla activa durante el temporizador mediante la Screen Wake Lock API (opcional).
- Modo inmersivo: oculta la interfaz y deja únicamente el temporizador y la etiqueta actual.
- Acciones rápidas: repetir la última sesión, cambiar de etiqueta e iniciar un preset con un solo clic.

**Registro, planificación y tareas**
- Etiquetas definidas por el usuario, asignadas a cada sesión de enfoque.
- Planes por bloques de objetivos globales (por ejemplo, 60 min de una materia seguidos de 30 min de otra). Si un bloque no se completa, se ofrece una sesión extra vinculada a la misma etiqueta. Los planes pueden guardarse como presets.
- Tareas con tiempo estimado frente a tiempo real. Las tareas pendientes se recuperan automáticamente al iniciar una sesión con la etiqueta correspondiente.
- Cierre inteligente de sesión (opcional): pregunta si la tarea se completó y si se desea descansar, continuar o detenerse.

**Estadísticas y progreso**
- Totales por día, semana, mes y año; objetivo diario; gráfico de los últimos siete días; desglose por etiqueta.
- Calendario de actividad con vista mensual (cuadrícula amplia) y anual (cuadrícula semanal compacta), navegación por mes y año y filtro por etiqueta. La fecha y el tiempo de cada día aparecen al pasar el cursor o al mantenerlo pulsado en pantallas táctiles; un toque breve abre el resumen del día.
- Edición del historial: se puede corregir la etiqueta, la duración y la fecha de una sesión, añadir sesiones manuales y eliminarlas. Las métricas se recalculan a partir de las sesiones.
- Contador de rachas desactivable.
- Hitos personales no competitivos (sesiones completadas, horas acumuladas, etiquetas distintas, constancia semanal, entre otros).
- Composición visual de progreso: cada sesión completada añade una estrella a un cielo; cada siete estrellas se cierra una constelación.

**Interfaz y accesibilidad**
- Círculo de progreso con el color del tema: el arco se llena con el acento elegido y un nodo orbital (el mismo motivo que el logotipo) marca el avance.
- Animaciones ambientales: lluvia de estrellas lenta de fondo, resplandor y órbita giratoria alrededor del círculo durante el enfoque, ondas en el botón de pausa, destello con partículas y onda expansiva al completar una sesión, y estrella fugaz ocasional. Se desactivan con *Reducir animaciones*.
- Modo claro, oscuro o automático; color de acento seleccionable o personalizado, persistente en `localStorage`.
- Las animaciones están activas por defecto en escritorio y móvil, sin restricciones por tamaño de pantalla. Solo dos cosas las desactivan: el conmutador *Reducir animaciones* de Ajustes y la preferencia `prefers-reduced-motion` del sistema. En ese modo, el arco, el nodo del círculo y el resto de estados visuales se mantienen fijos, sin brillos ni ondas ni destellos. El alto contraste no modifica las animaciones.
- Navegación por teclado, etiquetas ARIA, diálogos nativos `<dialog>`, regiones `aria-live` y enlace de salto al contenido.

**Otros**
- Reproductor embebido de YouTube y YouTube Music (URL de vídeo o lista), controlado con la IFrame Player API. Minimizar la ventana mantiene la reproducción (queda en miniatura con pausa, anterior y siguiente); cerrarla o pausarlo la detiene. La última URL se conserva localmente.
- Exportación e importación de copias en JSON y copia de seguridad opcional en Google Drive.

## Arquitectura

Aplicación estática de HTML5, CSS3 y JavaScript con módulos ES nativos. No hay dependencias en tiempo de ejecución ni paso de compilación.

```
index.html              Estructura semántica y logotipo SVG en línea
manifest.json           Metadatos de instalación PWA
sw.js                   Service worker (precarga y estrategia cache-first)
css/styles.css          Tokens de diseño, componentes, vistas y modos de accesibilidad
fonts/                  Space Grotesk (variable, latin) y licencia OFL
icons/                  Logotipo e iconos de la aplicación
js/
  boot.js               Aplicación temprana de tema y preferencias (evita parpadeos)
  main.js               Arranque, navegación, atajos de teclado, modo inmersivo e instalación
  data.js               Modelo de datos, persistencia y fusión de copias
  stats.js              Agregación de tiempos (unión de intervalos), rachas y totales
  timer.js              Motor del temporizador y registro de segmentos
  timer-ui.js           Representación del temporizador, título y favicon
  plans.js              Planes por bloques y presets
  tasks.js              Tareas con tiempo estimado y real
  closing.js            Cierre inteligente de sesión
  panel.js              Panel de estadísticas y desglose por etiqueta
  calendar.js           Calendario compacto, fecha al pasar el cursor, resumen diario y edición del historial
  fx.js                 Efectos ambientales (estrellas, destello, estrella fugaz)
  badges.js             Hitos y composición de estrellas
  theme.js              Tema, contraste, logotipo y favicon dinámico
  audio.js              Tonos generados con Web Audio API
  wake.js               Screen Wake Lock API
  music.js              Ventana flotante de YouTube
  drive.js              Copia de seguridad en Google Drive
  backup.js             Exportación e importación JSON
  settings.js           Enlace de los controles de ajustes
  dialogs.js            Diálogos, popovers, avisos y anuncios accesibles
  bus.js, storage.js, util.js, icons.js
```

Los módulos se comunican mediante un bus de eventos mínimo (`bus.js`): los cambios de datos emiten eventos `change:*` y la interfaz se actualiza de forma agrupada. El temporizador calcula el tiempo restante a partir de una hora de finalización absoluta, por lo que la ralentización de pestañas en segundo plano no genera deriva.

El service worker precarga todos los recursos propios y los sirve desde caché; las peticiones a otros orígenes (Google, YouTube) no se interceptan. Al modificar cualquier archivo estático conviene incrementar la constante `CACHE` de `sw.js` para que los clientes actualicen la caché.

## Modelo de datos y coherencia

Todo se guarda en `localStorage` con el prefijo `astratime.` (`ses`, `cfg`, `tasks`, `presets`, `plan`, `badges`, `epoch`, `cal`, `yt`, `gcid`, `gon`). Las claves del prefijo anterior (`pomo.*`) se copian automáticamente la primera vez que se abre la aplicación.

Cada sesión es una tupla `[id, inicio, fin, etiqueta, completada, tarea, bloque, actualización, borrada]`, con inicio y fin en segundos Unix y la actualización en milisegundos. Los totales no se almacenan: se calculan siempre a partir de las sesiones, de modo que editar o borrar una sesión mantiene coherentes todas las métricas.

Para combinar dispositivos sin duplicar ni perder información:
- **Identidad:** las sesiones se fusionan por `id`, de modo que importar o sincronizar varias veces no las repite.
- **Solapes:** si dos sesiones coinciden en el tiempo (por ejemplo, registradas desde el móvil y el ordenador), el tramo coincidente se contabiliza una sola vez.
- **Ediciones:** prevalece la versión con la marca de actualización más reciente. Esto presupone relojes de dispositivo razonablemente sincronizados.
- **Borrados:** las sesiones eliminadas se conservan como marca de borrado para propagar el cambio. El borrado total incrementa una época (`epoch`); la época más reciente prevalece al sincronizar.

## Audio y recursos de terceros

- **Sonidos:** todos los avisos se sintetizan en el dispositivo con la Web Audio API (`OscillatorNode` y `GainNode`) a partir de frecuencias, ondas y envolventes definidas en `js/audio.js`. El proyecto no incluye ni descarga archivos de audio, por lo que no hay material de terceros sujeto a derechos.
- **Tipografía:** Space Grotesk, autoalojada (`fonts/`), con licencia SIL Open Font License 1.1 (texto en `fonts/OFL-Space-Grotesk.txt`).
- **Logotipo e iconos:** diseño propio en SVG; los iconos de interfaz son trazos definidos en `js/icons.js`.
- **Servicios externos bajo demanda:** Google Identity Services y la API de Drive solo se cargan al conectar Drive; el reproductor de YouTube solo carga contenido de `youtube-nocookie.com` cuando el usuario lo abre.

## Instalación y uso

Los módulos ES, el service worker y el inicio de sesión de Google requieren HTTPS o `localhost`; no funcionan al abrir `index.html` directamente desde el sistema de archivos.

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

**Publicación en GitHub Pages**

```bash
git init -b main
git add .
git commit -m "AstraTime: versión inicial"
git remote add origin https://github.com/<usuario>/<repositorio>.git
git push -u origin main
```

Después, en el repositorio: *Settings > Pages > Build and deployment*, origen *Deploy from a branch*, rama `main` y carpeta `/ (root)`. La aplicación quedará disponible en `https://<usuario>.github.io/<repositorio>/`. Todas las rutas son relativas, por lo que funciona bajo ese subdirectorio.

**Instalación como aplicación:** Chrome y Edge (icono de instalación en la barra de direcciones o botón en Ajustes), Android (menú > *Instalar aplicación*), iOS (Safari > *Compartir* > *Añadir a pantalla de inicio*). Una vez instalada, funciona sin conexión.

## Copia de seguridad

**Exportar e importar.** *Ajustes > Copia del historial* genera y lee un archivo JSON con sesiones, tareas, presets y configuración. La importación añade contenido y no sustituye el existente.

**Google Drive.** La sincronización usa Google Identity Services (flujo de token en el navegador) y la API de Drive v3 con el ámbito `https://www.googleapis.com/auth/drive.appdata`, que limita el acceso a una carpeta oculta de la aplicación (`appDataFolder`). El archivo `astratime-backup.json` no aparece en el Drive del usuario y la aplicación no puede leer ningún otro archivo.

Configuración (una sola vez):

1. Crear un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
2. Habilitar **Google Drive API** en *APIs y servicios > Biblioteca*.
3. Configurar la *Pantalla de consentimiento de OAuth* (usuario *Externo*), añadir el ámbito `.../auth/drive.appdata` y, mientras esté en modo *Testing*, la cuenta propia como usuario de prueba.
4. Crear un *ID de cliente de OAuth* de tipo *Aplicación web* con el dominio de la aplicación como origen de JavaScript autorizado (por ejemplo `https://<usuario>.github.io` o `http://localhost:8000`). No se requiere URI de redireccionamiento.
5. Pegar el ID de cliente en *Ajustes > Copia de seguridad en Google Drive* y pulsar *Conectar y sincronizar*.

El token de acceso dura aproximadamente una hora; mientras esté activo, la sincronización se repite tras cada cambio. Después basta con pulsar de nuevo *Sincronizar ahora*. El ID de cliente no es un secreto, pero se guarda solo en el navegador del usuario.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `Espacio` | Iniciar o pausar |
| `S` | Saltar fase |
| `R` | Reiniciar fase |
| `M` | Modo inmersivo (`Esc` para salir) |
| `T` | Siguiente etiqueta |
| `1`–`4` | Cambiar de vista |

## Privacidad

- No existe backend ni analítica.
- Sin Google Drive ni YouTube, ningún dato sale del navegador.
- Con Google Drive, los datos se envían únicamente a la carpeta `appDataFolder` de la cuenta del propio usuario.
- El reproductor de YouTube transmite a YouTube las peticiones propias del contenido incrustado.

## Metodología de desarrollo

La idea, los requisitos funcionales y de diseño, y la dirección del proyecto son de la autora. El código fuente ha sido generado con la asistencia de inteligencia artificial (Claude, de Anthropic), a partir de especificaciones y revisiones iterativas definidas por la autora.

La verificación se realizó con pruebas automatizadas de extremo a extremo en Chromium sin interfaz (temporizador, planes, tareas, calendario y edición, sincronización simulada con Drive, modo sin conexión), que no se incluyen en el repositorio. Se recomienda revisar el código antes de confiarle datos que no se puedan reponer.

## Limitaciones conocidas

- Los navegadores pueden ralentizar los temporizadores de pestañas en segundo plano; el cómputo del tiempo es correcto, pero el aviso puede retrasarse. Las notificaciones con la aplicación cerrada no están soportadas.
- La Screen Wake Lock API y las notificaciones dependen de la compatibilidad del navegador.
- Algunos vídeos de YouTube no permiten la reproducción incrustada. Los anuncios que YouTube sirve dentro del reproductor incrustado no pueden eliminarse desde la aplicación.
- El token de Google Drive no se renueva en silencio (limitación del flujo de token sin servidor).
- Las etiquetas eliminadas en un dispositivo no se eliminan en los demás.
- Borrar los datos del navegador elimina el historial local si no existe una copia exportada o en Drive.

## Licencia

MIT. Debe añadirse al repositorio un archivo `LICENSE` con el texto de la licencia y el titular de los derechos.
