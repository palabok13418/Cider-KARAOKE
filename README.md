# Cider KARAOKE Web 🎤

Standalone web shell for the Cider KARAOKE platform.

## Host
Website hosts must authenticate with a Cider account before hosting. The prototype contains a clearly labeled auth adapter and does not collect Cider passwords.

After host authentication:
- Karaoke-only browser UI.
- Apple Music Sing-style search/category browser.
- Dedicated queue.
- Full karaoke lyric presentation.
- Four-digit host code.
- Local translation/pronunciation adapters.
- Animated artwork / Canvas fallback hook.
- WebRTC microphone host transport.

## Microphone client
Open the join mode on a phone or another browser:

    /?mode=join

Enter the host's four-digit code. After joining, the browser requests microphone access.

## Development
The web shell uses port 3058.

    pnpm install
    pnpm dev
    pnpm signaling
    pnpm build
    pnpm preview

For a real multi-device session, set:

    VITE_SIGNALING_URL=wss://your-signaling-host.example

The four-digit code is a room join code, not authentication.

## Production integrations
The Cider login, production Apple Music authorization/catalog access, lyric fetching, local translation model, pronunciation model, and lightweight WebNN vocal-remover model are adapter points in this prototype.

No Cider desktop UI is included in this branch.
