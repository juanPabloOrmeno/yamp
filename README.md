# YAMP 0.2 — reproductor independiente

Mini reproductor inspirado en Winamp. **No necesita Chrome ni la web de YouTube
Music abiertos para buscar, consultar tu biblioteca o reproducir música.**

## Uso

Abre **ϟ YAMP** desde Waybar, busca **YAMP** en aplicaciones o ejecuta `~/.local/bin/yamp`.

- **MUSIC / INICIO**: recomendaciones dentro del panel retro.
- **Buscar**: resultados de canciones de YouTube Music dentro de YAMP. Clic para
  reproducir; **+** añade una canción a la cola existente.
- **BIBLIOTECA**: biblioteca de tu cuenta. Abre una playlist o álbum y selecciona
  una canción. El selector permite filtrar canciones, playlists, álbumes, etc.
- **COLA**: canciones pendientes; seleccionar una empieza a reproducirla.
  Usa **×** para quitar una canción o **LIMPIAR COLA** para vaciarla y detener
  la reproducción. Quitar canciones de la cola no elimina sus archivos locales.
- **HISTORIAL**, después de COLA: las últimas 1000 canciones reproducidas, con
  las más recientes primero y sin duplicados. Clic para reproducir o **+** para
  añadir a la cola. Se conserva en `~/.config/yamp/history.json` al cerrar YAMP.
  **BORRAR HISTORIAL** vacía los registros guardados; conserva la cola, playlists
  y archivos de audio. Las nuevas reproducciones vuelven a registrarse.
- **GUARDAR PLAYLIST** en COLA: guarda todas las canciones en su orden actual
  con el nombre que elijas. **PLAYLISTS** permite cargarlas de nuevo, reemplazando
  la cola actual. Se conservan en `~/.config/yamp/playlists/` al reiniciar YAMP.
  **ELIMINAR** junto a cada playlist borra la lista guardada, conservando la cola
  actual y los archivos de audio locales.
  Al guardar una playlist, las canciones que falten en el disco se descargan en
  segundo plano, sin cambiar la reproducción ni volver a descargar las existentes.
  El progreso aparece en PLAYLISTS y ADMINISTRAR. Mantén YAMP abierto hasta que
  termine; si hay errores, puedes guardar de nuevo la cola para reintentar.
- **LOCAL**: canciones guardadas para escuchar sin conexión. Al reproducir, YAMP
  busca primero el audio local, sin consultar YouTube si ya está guardado.
  Las canciones nuevas se guardan completas en segundo plano mientras suenan;
  aparecen en LOCAL cuando termina la descarga, incluso si cambias de canción.
  Mantén YAMP abierto hasta que termine de guardar. Una descarga interrumpida
  se vuelve a intentar la próxima vez que reproduzcas esa canción con conexión.
  La biblioteca local persiste al reiniciar y no tiene borrado automático.
- **ADMINISTRAR**: abre la pantalla de canciones locales. Selecciona canciones
  individuales o todas para **ELIMINAR DEL DISCO** o **RESPALDAR…**. El respaldo
  permite elegir una carpeta y crea dentro una subcarpeta `YAMP-respaldo-*` con
  el audio y sus metadatos, sin sobrescribir respaldos anteriores. Eliminar una
  canción local no borra sus respaldos; volver a reproducirla desde YouTube la
  guardará nuevamente.
  **RESTAURAR…** permite elegir una carpeta `YAMP-respaldo-*` para recuperar
  canciones sin conexión. Omite las que ya están guardadas y los archivos inválidos.
  **GUARDAR BIBLIOTECAS** recorre tu biblioteca de YouTube Music, sus playlists,
  álbumes y páginas adicionales, y guarda las canciones en segundo plano.
  Requiere sesión y conexión; omite canciones ya locales y muestra el progreso
  y los errores. **DETENER** conserva lo descargado y deja terminar el guardado
  actual. Mantén YAMP abierto; puedes repetir la operación para completar faltantes.
- **MÁS**: carga la siguiente página cuando el servicio tiene más resultados.
- **AGREGAR TODO A LA COLA**: añade las canciones de la lista o búsqueda en orden,
  incluidas sus páginas adicionales, conservando la cola y la reproducción actual.
  También está disponible en LOCAL e HISTORIAL.
- **PL**: alterna entre reproductor compacto y panel de catálogo.
- **SHUF / REP**: aleatorio y repetición (desactivada → toda la cola → una canción).
- **♥**: guarda Me gusta en tu cuenta.
- Posición, volumen, silencio, anterior/siguiente, pausa y detener son controles nativos.
- Espacio: reproducir/pausar fuera de campos, botones y selectores.
- **◆**: solicita modo siempre encima al compositor.
- Waybar: clic abre YAMP; clic derecho pausa; rueda cambia de canción.
- MPRIS: `playerctl --player=yamp play-pause` y teclas multimedia.
- **×**: cierra YAMP y su motor de audio.
- **_**: oculta la ventana y mantiene la reproducción en Waybar. Pulsa **ϟ YAMP**
  en la barra superior para volver a mostrarla.

## Cuenta: Chrome solo para autenticar

1. Pulsa **CUENTA ↗**. Se abre Chrome con el perfil exclusivo de YAMP.
2. Completa el login y vuelve a YAMP.
3. Pulsa **GUARDAR SESIÓN**. YAMP guarda localmente la sesión de YouTube,
   comprueba la biblioteca y cierra ese Chrome.

No se usa tu perfil habitual de Chrome ni se guarda tu contraseña. La sesión
persistente permite arrancar y reproducir sin abrir el navegador. Si caduca,
repite los pasos anteriores. La sesión que ya existía en el perfil de YAMP fue
migrada durante esta actualización.

## Arquitectura

- **Electron** dibuja una sola ventana local; no hay una web remota escondida.
- **youtubei.js** consulta el catálogo, la biblioteca y los favoritos.
- **yt-dlp** obtiene el recurso de audio bajo demanda.
- **mpv**, sin interfaz gráfica, es el motor de audio de YAMP. No es la aplicación
  de YouTube Music ni un navegador; se inicia y termina junto con YAMP.
- **MPRIS** publica canción y controles para Waybar.
- **Chrome** y su puerto de control local solo existen durante la autenticación.

Datos en `~/.config/yamp/`: `native-session.json` y `cookies.txt` contienen la
sesión y tienen permisos **0600**. `chrome-profile/` conserva el perfil de login.
`audio/` contiene el audio y los títulos de las canciones guardadas sin conexión.
Nunca se envían cookies o URLs firmadas al renderer de Electron ni a los logs.

## Alcance

La búsqueda inicial es de canciones. La biblioteca permite abrir playlists y
álbumes; seleccionar un artista busca sus canciones. Seleccionar una canción
añade solo esa canción a la cola y la reproduce, conservando las anteriores.
El botón **+** añade solo esa canción sin cambiar la reproducción.
No hay ecualizador ni edición de playlists en esta versión.
Las APIs no oficiales y la extracción de audio pueden requerir actualizaciones
cuando cambie YouTube; una sesión caducada o contenido no disponible devuelve un
error en el panel. Esto no replica los servidores de YouTube Music.

## Desarrollo

Requiere `mpv` y `yt-dlp`; Chrome solo para autenticar. El runtime de Node incluido
en Electron se usa también como motor JavaScript de yt-dlp.

```sh
cd ~/Proyectos/yamp
npm ci
npm start
npm run check
npm test
```

Las pruebas requieren sesión gráfica y D-Bus con `playerctl`. El test del player
usa audio silencioso local con mpv real y un catálogo fixture; el test del login
usa un perfil temporal de Chrome. Capturas en `test-results/`.

Instalación: `.local/bin/yamp`, `.local/share/applications/yamp.desktop`, módulo
`custom/yamp` de Waybar y regla `yamp-mini` en la configuración Lua de Hyprland.

## Referencia REA

La investigación inicial y su evolución están en [docs/rea.md](docs/rea.md).
Pear Desktop no fue modificado.
