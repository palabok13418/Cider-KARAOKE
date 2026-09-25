# Cider KARAOKE 🎤

Cider Immersive Mode karaoke plugin.

This plugin uses the Apple Music account/session already active inside Cider. It does not add a separate sign-in flow.

## Build the plugin

This ZIP is deliberately **Git-free**. It does not require `@ciderapp/pluginkit` from a GitHub URL. The small PluginKit v4 adapter used by this plugin is included locally under `src/vendor/`.

```bash
npm install
npm run build
```

The generated plugin files are written to `dist/`, including `plugin.js` and `plugin.yml`.

## Development

```bash
npm run dev
```

The development server uses Cider's plugin development port **3058**. Cider's normal RPC/WebView interface remains **10767**.

## Cider shell

The plugin adds a new Immersive Mode layout named **Karaoke**, with a dedicated karaoke queue, four-digit host code, karaoke lyrics, artwork/Canvas visual fallbacks, microphone session transport, and the lightweight WebNN/WebGPU vocal-removal runtime selector.

### Apple Music library
The karaoke browser now reads the signed-in Apple Music library exposed by Cider's host-backed v3 API. Search is performed against the user's library, and selecting a library song adds it to the karaoke queue. Queue playback goes through Cider's Apple Music store instead of using a separate catalog player.

The existing Spotify Canvas plugin is kept independent. Cider KARAOKE only calls its `window.CiderSpotifyCanvas.getCurrentCanvas()` integration hook when available.

## Prototype limitations

Local translation, pronunciation, vocal separation, WebRTC signaling, and the Spotify Canvas integration are still prototype-level pieces. No proprietary vocal-removal model weights are included in this package.

The Karaoke surface deliberately leaves the upper-left area transparent and non-interactive so Cider's own Immersive Mode controls, including the layout selector, remain clickable.
