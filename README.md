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

The plugin adds a new Immersive Mode layout named **Karaoke**, with a dedicated karaoke queue, four-digit host code, karaoke lyrics, artwork/Canvas visual fallbacks, phone session transport, and the lightweight WebNN/WebGPU vocal-removal runtime selector.

### Apple Music catalog
The karaoke browser searches the full Apple Music catalog through Cider's authenticated host-backed v3 API. There is no separate Apple Music sign-in or developer token in the plugin. Selecting a catalog result adds it to the karaoke queue, and playback goes through Cider's Apple Music store.

The existing Spotify Canvas plugin is kept independent. Cider KARAOKE only calls its `window.CiderSpotifyCanvas.getCurrentCanvas()` integration hook when available.

## Prototype limitations

Local translation, pronunciation, vocal separation, WebRTC signaling, and the Spotify Canvas integration are still prototype-level pieces. No proprietary vocal-removal model weights are included in this package.

The Karaoke surface deliberately leaves the upper-left area transparent and non-interactive so Cider's own Immersive Mode controls, including the layout selector, remain clickable.

Cider sign-in is required before the personalized Apple Music home and playback controls are enabled. KARAOKE does not ask the user to sign in a second time; it uses the Apple Music session already authenticated in Cider.

### Cider Sing lyric renderer
KARAOKE keeps Cider's Apple Music Sing TTML intact and renders it through Cider's exposed `cider-simple-lyric-view` component. The plugin only adds a presentation layer around that renderer: its own translation engine and Korean/Japanese/Chinese pronunciation engine are shown alongside the active Cider-rendered line. This keeps Cider's per-line/per-word timing and Sing behavior as the rendering foundation instead of reimplementing the TTML renderer.


## Live Karaoke display
Press **Start** after selecting a queued song. The karaoke surface becomes a transparent two-column stage over Cider's own Immersive Mode background:
- left: centered album artwork, Apple Music animated artwork, or Spotify Canvas when available;
- right: karaoke lyrics with Korean/Japanese/Chinese pronunciation rows and translations;
- no divider is drawn between the two sides;
- the four-digit host code sits at the top center in a liquid-glass pill.

When karaoke starts, lyrics are fetched in this order: Cider Lyrics Studio user submissions first, then Apple Music lyric TTML through Cider's authenticated API, then the built-in demo fallback. Timed TTML lines are synchronized to Cider's host audio element.

At Start, Cider KARAOKE opens a separate **Player Controls** window for play/pause, previous, and next. It tries to place that window on a secondary display using the browser/Electron Window Placement API when available, with an adjacent-window fallback.


### Apple Music home picker and playback control
Before karaoke starts, the picker uses Cider-native Apple Music media components and personalized Apple Music recommendations from the already-authenticated Cider session, rather than a separate Apple Music login. Catalog search remains available as a fallback.

Starting karaoke takes control of Cider's Apple Music player: the plugin ensures the player exists, selects the requested catalog track through Cider, explicitly resumes playback, and the separate Player Controls window controls Cider's play/pause/next/previous transport. KARAOKE does not create a second audio player or use a local preview stream.
