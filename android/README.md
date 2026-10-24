# YAMP para Android

## Versión 0.4

La lista incorpora una apariencia Winamp: encabezado PLAYLIST EDITOR, fondo
negro verdoso, tipografía monoespaciada, numeración y resaltado verde. El estilo
en `app/src/main/assets/playlist.css` se aplica solo a YouTube Music y también
a las filas cargadas posteriormente. Los enlaces y menús siguen perteneciendo
al sitio; cambios en su estructura pueden requerir actualizar los selectores.

## Versión 0.3

Icono adaptativo propio (también temático), panel de canción/artista y tiempo,
barra de posición, controles táctiles de 48 dp, indicador de carga y botón de
recarga. Los metadatos y controles dependen del reproductor web disponible;
esta versión sigue usando WebView, no el motor nativo del escritorio.

Cliente Android de la interfaz YAMP para el reproductor web oficial de YouTube
Music. La sesión se guarda en el almacén de cookies aislado de Android WebView.
No incluye `yt-dlp`, no extrae URLs de audio y no copia cookies a archivos.

## Abrir o compilar

1. Abre la carpeta `android/` en Android Studio (JDK 17, Android SDK 35).
2. Espera a que Gradle sincronice las dependencias.
3. Conecta el teléfono con la depuración USB autorizada y pulsa **Run**; o, si
   tienes Gradle instalado:

   ```sh
   ./gradlew :app:assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

En el primer inicio usa **CUENTA** y entra con el botón de perfil de YouTube
Music. La página oficial administra la autenticación, biblioteca y reproducción.

Los controles INICIO, BIBLIOTECA, búsqueda, anterior, reproducir/pausa y
siguiente operan sobre la página de YouTube Music. Si esta cambia sus selectores
internos, los tres controles de reproducción se siguen pudiendo usar desde el
reproductor oficial visible.
