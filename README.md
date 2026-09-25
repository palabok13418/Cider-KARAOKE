# Cider KARAOKE 🎤

A two-shell karaoke platform for Cider.

## Cider shell
The plugin adds a new Immersive Mode layout named Karaoke. It shows a karaoke browser, a dedicated queue, large lyrics, a 4-digit host code, visual fallbacks, and a lightweight local vocal-removal runtime.

The Cider shell does not add a Cider-account sign-in screen because it already runs inside Cider.

## Web shell
The standalone site has a host shell and a microphone shell. A web host must authenticate with a Cider account before hosting. Microphone guests only enter the four-digit code and grant microphone permission.

## Prototype
The first prototype includes:
- Shared Cider and web karaoke presentation logic.
- Apple Music Sing-style search/category browser using live Cider RPC when available, plus a demo catalog.
- Dedicated karaoke queue.
- Four-digit host code.
- WebSocket signaling server plus WebRTC microphone transport.
- Browser microphone permission and live input meter.
- Apple Music source-lyrics model with local translation/pronunciation adapters.
- Korean, Japanese, and Chinese pronunciation rows, including Pinyin for Traditional and Simplified Chinese.
- Animated artwork first, then Spotify Canvas provider hook, then static artwork.
- WebNN -> WebGPU -> lightweight fallback selection for vocal removal.

## Run
pnpm install
pnpm dev:web
pnpm dev:plugin
pnpm signaling
pnpm build:web
pnpm build:plugin

Web routes:
- /?mode=host
- /?mode=join

For real phone-to-host pairing, expose the signaling endpoint and set VITE_SIGNALING_URL for the web shell. The Cider shell can read window.CIDER_KARAOKE_SIGNALING_URL.

The host code is a room join code, not an authentication mechanism.

## Authentication
The web host login is deliberately an adapter. Configure VITE_CIDER_AUTH_URL with the supported Cider authorization endpoint when the real Cider OAuth contract is available. The prototype has an explicitly labeled local demo host entry instead of collecting a Cider password.

## Cider RPC
The prototype targets the documented local Cider RPC at http://localhost:10767 and sends an apptoken header only when window.__CIDER_KARAOKE_RPC_TOKEN__ is supplied.

## Spotify Canvas
The visual adapter checks window.CiderSpotifyCanvas.getCurrentCanvas() and listens for a cider-karaoke-canvas event with detail { url }. This keeps the existing Spotify Canvas plugin independent while giving it a clean integration point.

## Vocal remover
The runtime selection is WebNN -> WebGPU -> low-cost fallback. A production lightweight ONNX separation model can be wired at /models/karaoke-vocal-remover.onnx. The prototype does not include proprietary model weights.
