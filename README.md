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
- **MÁS**: carga la siguiente página cuando el servicio tiene más resultados.
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
Nunca se envían cookies o URLs firmadas al renderer de Electron ni a los logs.

## Alcance

La búsqueda inicial es de canciones. La biblioteca permite abrir playlists y
álbumes; seleccionar un artista busca sus canciones. La cola toma las canciones
actualmente cargadas en la lista: usa MÁS para ampliar una playlist antes de
reproducirla. No hay ecualizador, descargas ni edición de playlists en esta versión.
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
