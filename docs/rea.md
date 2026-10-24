# Investigación y verificación

## Estado actual: 0.2, independiente

La implementación vigente sustituye la reproducción de Chrome por `NativePlayer`
y mpv sin interfaz. El catálogo y la biblioteca se consultan con youtubei.js;
yt-dlp resuelve el audio. Electron carga únicamente `src/index.html` local.
Chrome se abre solo al solicitar autenticación y se cierra al guardar la sesión.
La sesión previamente creada por el usuario en el perfil de YAMP se migró al
backend nativo, sin leer su perfil habitual de Chrome.

Verificación inicial nativa: biblioteca autenticada con 16 entradas y 6 filtros,
20 resultados de búsqueda y audio real reproducido mediante mpv a volumen cero.
Pruebas de UI: una ventana local, catálogo/cola, audio silencioso con mpv real,
seek, controles MPRIS, repetición, aleatorio, modo compacto y validación IPC.
Prueba integral de producción posterior: 16 entradas de biblioteca, 34 canciones
en una playlist y 20 resultados de búsqueda; reproducción de audio real silenciado,
pausa y seek a 9.999979 segundos. Se verificó una sola ventana Electron local y
cero procesos Chrome asociados al perfil de YAMP durante la reproducción.
Las secciones siguientes conservan el historial del análisis y las arquitecturas
anteriores; no describen dependencias de reproducción de la versión 0.2.

## Referencia estática

- Artefacto: `/opt/YouTube Music/resources/app.asar`.
- Identidad del paquete: `youtube-music` 3.12.3, fork `michei69/pear-desktop`, MIT.
- SHA-256: `303b27aa66f1c5141a55d91e5dcc1996a3b4d170d7b1dcd2d1b938939c63fc33`.
- REA aplicación: `ev_2b0fd029ec2c1137659abf78584706281a725bb4c0e33112ec7ec3a524b6db70`.
- Resumen: `ev_e2619d80c80a50e29857c40863b59639649b87b65dc6c0f102132d2b44a60e38`.
- Inventario: `ev_55d50a26cc4e99e07f93266cc900582b0d090747a1d13426e55c3796674aef86`.
- Módulo de controles: `dist/main/song-controls-DE115Yqg.js`, nodo
  `jag_node_8e533514bc074b1d5c18ec13c3e207c1b451ef91be4d12d4b4a3db393699b874`.
- El análisis observó sintaxis Electron, cinco creaciones de ventana y canales IPC.
  Se analizaron 229 archivos JavaScript. Cobertura parcial: expresiones dinámicas,
  límites de relaciones y un cuerpo inline no analizado impiden afirmar exhaustividad.
- Lectura complementaria del ASAR, sin ejecutar: controles `peard:*` en el módulo
  anterior; `dist/main/song-info-Cmxdq1T-.js` recoge videoDetails y estado;
  `dist/renderer/youtube-music.iife.js` conecta controles DOM del player y shuffle-on.
- El bundle completo exportado por REA se conserva en `rea-evidence.json.gz`.

## Decisiones de implementación

YAMP implementa un cliente nuevo Electron con interfaz retro local y una ventana
web aislada para YouTube Music. Conserva la reproducción del servicio en vez de
extraer URLs de audio o replicar servidores. La estética y el protocolo IPC de
YAMP son decisiones propias, no hallazgos de REA.

### Cambio de autenticación posterior

Tras el rechazo de Google al navegador embebido, el backend de producción se
cambió a Google Chrome real. Electron conserva solamente la interfaz local.
Chrome usa el perfil exclusivo `~/.config/yamp/chrome-profile` y un puerto CDP
en loopback para los controles. No se copian cookies entre navegadores.
Las pruebas de Chrome verifican identidad Chrome sin Electron, `navigator.webdriver`
desactivado de forma nativa (sin modificarlo), transporte, reconexión y cierre.
La prueba de Electron usa una página fixture y no realiza el login del usuario.

## Verificación dinámica independiente de REA

Verificación realizada con Playwright/Electron el 23 de octubre de 2026:

- La página real cargó, reprodujo audio (silenciado durante la prueba) y respondió
  al botón de pausa del mini reproductor. Se esperó reproducción fuera de un anuncio.
- Se recuperaron 50 filas reales de cola.
- El evento `yt-navigate` con `searchEndpoint` abrió resultados para Daft Punk.
- El endpoint `FEmusic_library_landing` abrió `/library`.
- Un marcador en `window` y el ID de vídeo permanecieron durante la navegación:
  búsqueda y biblioteca no recargaron el documento ni sustituyeron la canción.
- El inicio de sesión y el contenido privado de biblioteca quedan pendientes de
  la sesión del usuario. No se afirma que estén verificados.
- Prueba automatizada con fixture en Electron: reproducción/pausa, seek, volumen,
  siguiente, selección de cola, shuffle, modo compacto, MPRIS con playerctl,
  rechazo de argumentos IPC inválidos y renderizado de metadatos como texto.
- Las pruebas con fixture no prueban todos los selectores del sitio real. Me gusta,
  aleatorio y repetición requieren comprobarse también con una sesión del usuario.
