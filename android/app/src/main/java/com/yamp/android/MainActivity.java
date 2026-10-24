package com.yamp.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebResourceError;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import org.json.JSONObject;
import org.json.JSONTokener;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;


/**
 * Android shell for YAMP. Playback and sign-in stay in YouTube Music's own
 * mobile web player; no cookies or media URLs are extracted by this app.
 */
public final class MainActivity extends Activity {
    private static final String MUSIC = "https://music.youtube.com/";
    private static final int GREEN = Color.rgb(181, 242, 115);
    private WebView music;
    private TextView status;
    private EditText search;
    private TextView trackTitle, artist, time, play;
    private SeekBar seek;
    private ProgressBar loading;
    private double duration;
    private boolean dragging;
    private String playlistSkin = "";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable update = new Runnable() {
        @Override public void run() { refreshPlayer(); handler.postDelayed(this, 1000); }
    };

    @Override @SuppressLint("SetJavaScriptEnabled")
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try (java.io.InputStream input = getAssets().open("playlist.css")) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            playlistSkin = bytes.toString("UTF-8");
        } catch (java.io.IOException error) {
            Toast.makeText(this, "No se pudo cargar el estilo de la lista", Toast.LENGTH_SHORT).show();
        }
        getWindow().setStatusBarColor(Color.rgb(7, 14, 11));
        getWindow().setNavigationBarColor(Color.rgb(7, 14, 11));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(8), dp(6), dp(8), dp(8));
        root.setBackgroundColor(Color.rgb(48, 49, 62));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            root.setPadding(dp(8) + insets.getSystemWindowInsetLeft(), dp(6) + insets.getSystemWindowInsetTop(),
                    dp(8) + insets.getSystemWindowInsetRight(), dp(8) + insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });

        root.addView(titleBar());
        root.addView(readout());
        root.addView(searchBar());
        root.addView(actions());
        loading = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loading.setProgressTintList(android.content.res.ColorStateList.valueOf(GREEN));
        root.addView(loading, new LinearLayout.LayoutParams(-1, dp(3)));
        TextView playlistHeader = label("≡  PLAYLIST EDITOR  ≡", 11, Color.rgb(208, 212, 223));
        playlistHeader.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        playlistHeader.setGravity(Gravity.CENTER);
        playlistHeader.setBackgroundResource(R.drawable.yamp_button);
        root.addView(playlistHeader, new LinearLayout.LayoutParams(-1, dp(28)));

        music = new WebView(this);
        music.setBackgroundColor(Color.rgb(7, 14, 11));
        music.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        configureWebView();
        root.addView(music);
        root.addView(footer());
        setContentView(root);

        if (savedInstanceState != null) music.restoreState(savedInstanceState);
        else music.loadUrl(MUSIC);
    }

    private View titleBar() {
        LinearLayout row = row();
        TextView logo = label("ϟ", 25, Color.rgb(232, 189, 100));
        row.addView(logo);
        TextView title = label("YAMP  ·  YOUTUBE MUSIC", 12, Color.WHITE);
        title.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        row.addView(title, new LinearLayout.LayoutParams(0, dp(36), 1));
        TextView version = button("↻");
        version.setContentDescription("Recargar página");
        version.setOnClickListener(v -> music.reload());
        version.setMinWidth(dp(48));
        version.setMinHeight(dp(48));
        row.addView(version);
        return row;
    }

    private View readout() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundResource(com.yamp.android.R.drawable.panel);
        box.setPadding(dp(10), dp(7), dp(10), dp(7));
        trackTitle = label("TU MÚSICA, A TU MANERA", 18, GREEN);
        trackTitle.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        trackTitle.setSingleLine(true);
        trackTitle.setEllipsize(android.text.TextUtils.TruncateAt.MARQUEE);
        trackTitle.setSelected(true);
        box.addView(trackTitle);
        artist = label("Elige una canción en YouTube Music", 12, Color.rgb(149, 174, 130));
        artist.setMaxLines(1);
        artist.setEllipsize(android.text.TextUtils.TruncateAt.END);
        box.addView(artist);
        time = label("00:00 / 00:00", 12, GREEN);
        time.setTypeface(Typeface.MONOSPACE);
        box.addView(time);
        seek = new SeekBar(this);
        seek.setMax(1000);
        seek.setEnabled(false);
        seek.setContentDescription("Posición de reproducción");
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int value, boolean user) {}
            public void onStartTrackingTouch(SeekBar bar) { dragging = true; }
            public void onStopTrackingTouch(SeekBar bar) {
                if (isMusic()) music.evaluateJavascript("(()=>{const v=document.querySelector('video,audio');if(v)v.currentTime=" + (duration * bar.getProgress() / 1000) + "})()", null);
                dragging = false;
            }
        });
        box.addView(seek, new LinearLayout.LayoutParams(-1, dp(32)));
        LinearLayout transport = row();
        String[] controls = {"◀◀", "▶ / Ⅱ", "▶▶"};
        String[] descriptions = {"Canción anterior", "Reproducir o pausar", "Canción siguiente"};
        for (int i = 0; i < controls.length; i++) {
            final String action = controls[i];
            TextView control = button(action);
            control.setTextColor(GREEN);
            control.setTextSize(19);
            control.setContentDescription(descriptions[i]);
            control.setOnClickListener(v -> command(action));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1);
            p.setMargins(dp(2), dp(4), dp(2), dp(4));
            transport.addView(control, p);
            if (i == 1) play = control;
        }
        box.addView(transport);
        status = label("CONECTANDO CON TU SESIÓN…", 10, Color.rgb(126, 166, 92));
        box.addView(status);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, dp(6));
        box.setLayoutParams(params);
        return box;
    }

    private View searchBar() {
        LinearLayout row = row();
        search = new EditText(this);
        search.setSingleLine(true);
        search.setHint("Buscar en YouTube Music…");
        search.setHintTextColor(Color.rgb(119, 132, 106));
        search.setTextColor(GREEN);
        search.setTextSize(13);
        search.setTypeface(Typeface.MONOSPACE);
        search.setBackgroundColor(Color.rgb(10, 18, 12));
        search.setPadding(dp(9), 0, dp(6), 0);
        search.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        search.setOnEditorActionListener((v, actionId, event) -> { runSearch(); return true; });
        row.addView(search, new LinearLayout.LayoutParams(0, dp(48), 1));
        TextView button = button("⌕");
        button.setTextSize(24);
        button.setContentDescription("Buscar música");
        button.setOnClickListener(v -> runSearch());
        row.addView(button, new LinearLayout.LayoutParams(dp(48), dp(48)));
        return row;
    }

    private View actions() {
        LinearLayout row = row();
        String[] names = {"INICIO", "BIBLIOTECA", "EXPLORAR"};
        for (String name : names) {
            TextView item = button(name);
            item.setOnClickListener(v -> command(name));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1);
            p.setMargins(0, dp(5), dp(4), dp(5));
            row.addView(item, p);
        }
        return row;
    }

    private View footer() {
        LinearLayout row = row();
        TextView account = button("CUENTA ↗");
        account.setOnClickListener(v -> {
            music.loadUrl(MUSIC);
            Toast.makeText(this, "Inicia sesión con el icono de cuenta de YouTube Music.", Toast.LENGTH_LONG).show();
        });
        row.addView(account, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)));
        TextView notice = label("  SESIÓN LOCAL · WEB OFICIAL", 9, Color.LTGRAY);
        notice.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        row.addView(notice, new LinearLayout.LayoutParams(0, dp(35), 1));
        return row;
    }

    @SuppressLint("SetJavaScriptEnabled") private void configureWebView() {
        WebSettings settings = music.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(false);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(music, true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        music.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int progress) {
                loading.setProgress(progress);
                loading.setVisibility(progress < 100 ? View.VISIBLE : View.INVISIBLE);
                if (progress < 100) status.setText("CARGANDO… " + progress + "%");
            }
        });
        music.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String host = url.getHost() == null ? "" : url.getHost();
                if ("https".equals(url.getScheme()) && (host.equals("youtube.com") || host.endsWith(".youtube.com") || host.equals("google.com") || host.endsWith(".google.com"))) return false;
                return true; // Do not turn arbitrary links into app navigation.
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    status.setText("SIN CONEXIÓN · PULSA ↻ PARA REINTENTAR");
                    loading.setVisibility(View.INVISIBLE);
                }
            }
            @Override public void onPageFinished(WebView view, String url) {
                status.setText("READY · " + (url.contains("music.youtube.com") ? "YOUTUBE MUSIC" : "INICIAR SESIÓN"));
                // Request the dark site theme without reading page content or credentials.
                view.evaluateJavascript("document.documentElement.style.colorScheme='dark'", null);
                applyPlaylistSkin();
            }
        });
    }

    private void runSearch() {
        String query = search.getText().toString().trim();
        if (query.isEmpty()) return;
        ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(search.getWindowToken(), 0);
        search.clearFocus();
        music.loadUrl("https://music.youtube.com/search?q=" + Uri.encode(query));
        status.setText("BUSCANDO: " + query.toUpperCase());
    }

    private void command(String action) {
        switch (action) {
            case "INICIO": music.loadUrl(MUSIC); return;
            case "BIBLIOTECA": music.loadUrl("https://music.youtube.com/library"); return;
            case "◀◀": clickPlayer(".previous-button"); return;
            case "▶ / Ⅱ": clickPlayer(".play-pause-button"); return;
            case "▶▶": clickPlayer(".next-button"); return;
            case "EXPLORAR": music.loadUrl("https://music.youtube.com/explore");
        }
    }

    private void clickPlayer(String selector) {
        if (!isMusic()) return;
        music.evaluateJavascript("(function(){var e=document.querySelector('ytmusic-player-bar " + selector + "')||document.querySelector('" + selector + "');if(e){e.click();return 'ok'}return 'missing'})()", result -> {
            if (result.contains("missing")) Toast.makeText(this, "Abre una canción primero.", Toast.LENGTH_SHORT).show();
        });
    }

    private boolean isMusic() {
        return music != null && "music.youtube.com".equals(Uri.parse(music.getUrl() == null ? "" : music.getUrl()).getHost());
    }

    private void refreshPlayer() {
        if (!isMusic()) return;
        applyPlaylistSkin();
        music.evaluateJavascript("(()=>{const v=document.querySelector('video,audio');const m=navigator.mediaSession?.metadata;const b=document.querySelector('ytmusic-player-bar');return JSON.stringify({title:m?.title||b?.querySelector('.title')?.textContent?.trim()||'',artist:m?.artist||b?.querySelector('.byline')?.textContent?.trim()||'',time:v?.currentTime||0,duration:Number.isFinite(v?.duration)?v.duration:0,playing:!!v&&!v.paused&&!v.ended})})()", result -> {
            try {
                Object decoded = new JSONTokener(result).nextValue();
                if (!(decoded instanceof String)) return;
                JSONObject state = new JSONObject((String) decoded);
                String title = state.optString("title");
                trackTitle.setText(title.isEmpty() ? "TU MÚSICA, A TU MANERA" : title);
                artist.setText(title.isEmpty() ? "Elige una canción en YouTube Music" : state.optString("artist"));
                double position = state.optDouble("time", 0);
                duration = state.optDouble("duration", 0);
                time.setText(clock(position) + " / " + clock(duration));
                seek.setEnabled(duration > 0);
                if (!dragging) seek.setProgress(duration > 0 ? (int) (1000 * position / duration) : 0);
                play.setText(state.optBoolean("playing") ? "Ⅱ" : "▶");
            } catch (Exception ignored) { /* The remote document may be navigating. */ }
        });
    }

    private void applyPlaylistSkin() {
        if (!isMusic() || playlistSkin.isEmpty()) return;
        music.evaluateJavascript("(()=>{if(location.hostname!=='music.youtube.com'||document.getElementById('yamp-playlist-skin'))return;const s=document.createElement('style');s.id='yamp-playlist-skin';s.textContent="
                + JSONObject.quote(playlistSkin) + ";(document.head||document.documentElement).appendChild(s)})()", null);
    }

    private String clock(double seconds) {
        int n = (int) Math.max(0, seconds);
        return String.format(java.util.Locale.ROOT, "%02d:%02d", n / 60, n % 60);
    }

    private LinearLayout row() { LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL); return row; }
    private TextView label(String text, int size, int color) { TextView v = new TextView(this); v.setText(text); v.setTextSize(size); v.setTextColor(color); v.setGravity(Gravity.CENTER_VERTICAL); return v; }
    private TextView button(String text) { TextView v = label(text, 11, Color.rgb(235, 238, 245)); v.setTypeface(Typeface.DEFAULT_BOLD); v.setGravity(Gravity.CENTER); v.setBackgroundResource(com.yamp.android.R.drawable.yamp_button); v.setClickable(true); v.setFocusable(true); return v; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override protected void onSaveInstanceState(Bundle state) { music.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onResume() { super.onResume(); handler.post(update); }
    @Override protected void onPause() { handler.removeCallbacks(update); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onDestroy() { handler.removeCallbacks(update); music.destroy(); super.onDestroy(); }
    @Override public void onBackPressed() { if (music.canGoBack()) music.goBack(); else super.onBackPressed(); }
}
