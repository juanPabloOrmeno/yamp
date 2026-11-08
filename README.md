# YAMP 0.2 — reproductor independiente

Mini reproductor inspirado en Winamp. **No necesita Chrome ni la web de YouTube
Music abiertos para buscar, consultar tu biblioteca o reproducir música.**

## Uso

### Descargas

Los instaladores están en [GitHub Releases](https://github.com/juanPabloOrmeno/yamp/releases).
La publicación de escritorio reúne Windows (EXE), macOS Intel y Apple Silicon
(DMG), y Linux x64 (AppImage, DEB y RPM), junto con `SHA256SUMS.txt`.
Android se publica por separado como APK preliminar de prueba.

En Linux, instala el DEB/RPM con el gestor de paquetes para resolver las
dependencias. Para AppImage, instala primero `mpv` y `yt-dlp`, otorga permiso
de ejecución al archivo y ábrelo.

El workflow **Instaladores y releases** compila en runners de cada plataforma.
Se puede lanzar manualmente desde Actions o publicando una etiqueta `v*`.

### Windows

Ejecuta **`dist/YAMP-0.2.0-windows-x64-setup.exe`** en Windows 10/11 de 64 bits.
El asistente permite elegir idioma y carpeta, y crea accesos en el escritorio
y menú Inicio. Incluye mpv y yt-dlp; no necesitas instalar Node.js ni esos motores.
Google Chrome solo es necesario para conectar la cuenta de YouTube Music.
Spotify abre la autorización en tu navegador predeterminado.

Los datos y librerías se guardan en `%APPDATA%\yamp`. El botón **_** oculta YAMP
en la bandeja del sistema; pulsa su icono para recuperarlo. Desinstalar conserva
los datos locales. Este instalador no tiene firma digital de editor.

### macOS

Abre `dist/YAMP-0.2.0-mac-arm64.dmg` y arrastra **YAMP** a **Aplicaciones**.
La compilación generada en este equipo requiere **Apple Silicon y macOS 26 o
posterior**. Incluye mpv, sus bibliotecas y yt-dlp: no requiere Homebrew para usarla.
Google Chrome se necesita únicamente para iniciar sesión con **CUENTA ↗**.

- **_** o **⌘M** oculta la ventana y su icono del Dock, manteniendo la música.
  YAMP queda en la barra superior: pulsa el rayo y elige **Mostrar YAMP** para
  recuperar la ventana. Ese menú también permite pausar, cambiar de canción y salir.
- El menú **Reproducción**, el menú del Dock y las teclas multimedia controlan el audio.
- **⌘P** pausa/reanuda; **⌘← / ⌘→** cambia de canción; **⌘Q** sale.
- Copiar, pegar y seleccionar todo funcionan con los atajos habituales de macOS.
- La pantalla verde muestra 24 barras fijas, de graves a agudos, que suben y
  bajan según la energía real de cada frecuencia. Bajan al pausar, silenciar o detener;
  funcionan también en modo compacto y con canciones sin conexión.
- Los datos se guardan en `~/Library/Application Support/yamp/`.
  Las referencias a `~/.config/yamp/` de este documento corresponden a Linux.

Este DMG tiene firma local ad-hoc, sin certificado Developer ID ni notarización.
Si macOS bloquea una copia descargada, autoriza YAMP en **Ajustes del Sistema →
Privacidad y seguridad → Abrir igualmente** después de intentar abrirla.

### Linux

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
- El icono de YAMP en la bandeja de Waybar incluye un menú para mostrar la ventana,
  reproducir/pausar, cambiar de canción y salir.
- El visualizador muestra 24 bandas de frecuencia del audio real, también en modo
  compacto y sin conexión. Las barras bajan al pausar, silenciar o detener.

## Cuenta: Chrome solo para autenticar

1. Pulsa **CUENTA ↗**. Se abre Chrome con el perfil exclusivo de YAMP.
2. Completa el login y vuelve a YAMP.
3. Pulsa **GUARDAR SESIÓN**. YAMP guarda localmente la sesión de YouTube,
   comprueba la biblioteca y cierra ese Chrome.

No se usa tu perfil habitual de Chrome ni se guarda tu contraseña. La sesión
persistente permite arrancar y reproducir sin abrir el navegador. Si caduca,
repite los pasos anteriores. La sesión que ya existía en el perfil de YAMP fue
migrada durante esta actualización.

## Librerías locales

Pulsa **LIBRERÍAS** en el encabezado del catálogo para crear tus propias
colecciones, renombrarlas, eliminarlas y quitar canciones seleccionadas.
Estas librerías son independientes de tu cuenta y pueden mezclar canciones
añadidas desde YouTube Music y Spotify.

- **AÑADIR COLA** incorpora las canciones de la cola actual.
- **+ LIB**, junto a cada canción del catálogo, cola, LOCAL o HISTORIAL, abre
  el selector de librería: elige una (o créala) y pulsa **AÑADIR ESTA CANCIÓN**.
- **AÑADIR LISTA VISIBLE** incorpora las canciones del catálogo abierto (incluidas
  sus páginas adicionales), LOCAL o HISTORIAL. Abre primero el álbum, playlist o
  búsqueda que quieras incorporar. Las canciones repetidas se omiten.
- Al añadir canciones, el audio pendiente se guarda en segundo plano. El menú
  muestra cuántas están **sin conexión** y cuántas siguen **pendientes**.
- **GUARDAR AUDIO** reintenta los pendientes; mantén YAMP abierto hasta terminar.
- **CARGAR COLA** reemplaza la cola con la librería; **AÑADIR A COLA** conserva la
  cola actual. Usa los controles habituales para reproducir.

Una canción puede pertenecer a varias librerías y comparte el mismo archivo de
audio. Eliminar una librería o quitar canciones de ella conserva los archivos;
**ADMINISTRAR** permite borrar el audio del disco. Si lo borras, las canciones
siguen en sus librerías como pendientes. Las colecciones se conservan al reiniciar
en `local-libraries.json`, dentro de la carpeta de datos de YAMP.
Las canciones incorporadas desde Spotify siguen usando coincidencias de audio
de YouTube Music, como se explica a continuación.

## Spotify como fuente de datos

El selector junto al buscador permite elegir **YouTube** o **Spotify**. Spotify
aporta búsquedas de canciones, tus favoritas de INICIO y tu BIBLIOTECA (canciones
guardadas, playlists y álbumes), con paginación y **AGREGAR TODO A LA COLA**.

1. Selecciona **Spotify → CUENTA ↗**. La primera vez, abre **Configuración inicial**.
2. Pulsa **ABRIR SPOTIFY DEVELOPERS** y crea una aplicación. Usa **COPIAR REDIRECT
   URI** para registrar exactamente `http://127.0.0.1:43821/callback`.
3. Pega su **Client ID** y pulsa **INICIAR SESIÓN EN SPOTIFY**.
4. YAMP abre el enlace de autorización preparado: inicia sesión y autoriza la cuenta.
   La conexión se completa automáticamente. No necesitas Client Secret.

Después de conectar, el Client ID queda guardado y la configuración se oculta.
Para volver a autorizar, basta con **INICIAR SESIÓN EN SPOTIFY**. La sesión normal
se renueva automáticamente, sin repetir el login en cada inicio.

La aplicación usa OAuth PKCE; renueva la sesión automáticamente y la guarda en
`spotify-session.json` con permisos 0600, sin exponer los tokens a la interfaz.
**DESCONECTAR** elimina los tokens locales. Las aplicaciones en modo desarrollo
están sujetas a los requisitos de cuenta y usuarios autorizados de Spotify.
Spotify puede restringir el acceso al contenido de playlists ajenas.

**El audio sigue viniendo de YouTube Music, no de Spotify.** Al añadir una canción,
YAMP busca una coincidencia por título, artista y duración. Si no encuentra una
coincidencia fiable, muestra un error; busca entonces la canción desde YouTube.
La edición puede variar. La cola muestra los metadatos del audio encontrado y
conserva su funcionamiento habitual: reproducción nativa, playlists y audio local.
**♥** guarda en Spotify las canciones añadidas desde esa fuente. Guardar bibliotecas
usa la fuente seleccionada; no se puede cambiar mientras se está descargando.

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

En macOS, instala `mpv` y `yt-dlp` con `brew install mpv yt-dlp` para desarrollar.
Las pruebas usan Chrome y mpv reales; D-Bus y `playerctl` solo se usan en Linux.

### Generar instalador para Windows

```sh
npm ci
npm run dist:win
```

Se puede generar desde Windows o desde Linux con Wine. El script descarga
versiones fijadas de mpv x64 y yt-dlp, verifica sus SHA-256 y crea un instalador
NSIS en `dist/`. `dist/windows-SHA256SUMS.txt` contiene el hash del instalador.
`build/win-resources/runtime-manifest.json` registra las URLs y hashes de los
componentes incluidos. El motor de Windows y su visualizador se han probado
con Wine; la instalación completa todavía debe validarse en Windows real.

### Generar instalador para macOS

```sh
npm ci
npm run dist:mac
```

Requiere macOS, las herramientas de línea de comandos de Xcode y mpv instalado.
El script `scripts/build-mac.cjs` genera el icono, copia mpv y sus dependencias
transitivas, ajusta las rutas de las bibliotecas y descarga yt-dlp 2026.10.21
verificando su SHA-256. Genera una aplicación `.app` y un instalador `.dmg` en
`dist/`. `build/mac-resources/runtime-manifest.json` registra los componentes y
el macOS mínimo detectado. El paquete usa la arquitectura de la máquina de
compilación; para Intel debe construirse en un Mac Intel con sus dependencias.
Para soportar versiones anteriores de macOS, compila con versiones de mpv y sus
bibliotecas compatibles con esos sistemas. La compilación actual no está
verificada en Intel ni en versiones anteriores de macOS.

Instalación: `.local/bin/yamp`, `.local/share/applications/yamp.desktop`, módulo
`custom/yamp` de Waybar y regla `yamp-mini` en la configuración Lua de Hyprland.

## Referencia REA

La investigación inicial y su evolución están en [docs/rea.md](docs/rea.md).
Pear Desktop no fue modificado.
