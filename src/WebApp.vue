<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import KaraokeHost from "./components/KaraokeHost.vue";

const mode = ref<"landing" | "host" | "join">("landing");
const roomCode = ref("");
const joinBusy = ref(false);
const joinStatus = ref("");
const remoteConnected = ref(false);

let ws: WebSocket | null = null;
let peer: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let hostId = "";

function signalingUrl() {
  const configured = String((import.meta as any).env?.VITE_SIGNALING_URL || (window as any).CIDER_KARAOKE_SIGNALING_URL || "").trim();
  if (configured) return configured;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return proto + "//" + window.location.host + "/peer";
}

function send(message: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

async function cleanupJoin() {
  try { peer?.close(); } catch {}
  peer = null;
  try { localStream?.getTracks().forEach((track) => track.stop()); } catch {}
  localStream = null;
  try { ws?.close(); } catch {}
  ws = null;
  remoteConnected.value = false;
  hostId = "";
}

async function joinRoom() {
  const code = roomCode.value.trim();
  if (!/^\d{4}$/.test(code)) {
    joinStatus.value = "Enter the 4-digit host code.";
    return;
  }

  joinBusy.value = true;
  joinStatus.value = "Requesting microphone access…";
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    const pc = new RTCPeerConnection();
    peer = pc;
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream!));

    const url = signalingUrl();
    ws = new WebSocket(url);
    ws.onopen = () => {
      send({ type: "hello", role: "mic", clientId: Math.random().toString(36).slice(2, 10) });
      send({ type: "join-room", code });
      joinStatus.value = "Joining karaoke room…";
    };

    ws.onmessage = async (event) => {
      let message: any;
      try { message = JSON.parse(event.data); } catch { return; }

      if (message.type === "join-accepted") {
        hostId = String(message.hostId || "");
        joinStatus.value = "Connected to host. Preparing microphone…";
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "webrtc-offer", peerId: hostId, sdp: offer });
        return;
      }

      if (message.type === "webrtc-answer") {
        await pc.setRemoteDescription(message.sdp);
        return;
      }

      if (message.type === "webrtc-ice" && message.candidate) {
        try { await pc.addIceCandidate(message.candidate); } catch {}
        return;
      }

      if (message.type === "peer-left" || message.type === "room-error") {
        remoteConnected.value = false;
        joinStatus.value = message.type === "room-error" ? String(message.message || "Room error") : "Host disconnected.";
      }
    };

    ws.onerror = () => {
      joinStatus.value = "The peer server could not be reached. Set VITE_SIGNALING_URL for the deployed server.";
    };

    ws.onclose = () => {
      if (!remoteConnected.value) joinStatus.value = "Peer connection closed.";
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && hostId) {
        send({ type: "webrtc-ice", peerId: hostId, candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      remoteConnected.value = pc.connectionState === "connected";
      if (pc.connectionState === "connected") joinStatus.value = "Microphone connected.";
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        joinStatus.value = "Microphone connection ended.";
      }
    };
  } catch (error) {
    joinStatus.value = error instanceof Error ? error.message : "Could not join the karaoke room.";
    await cleanupJoin();
  } finally {
    joinBusy.value = false;
  }
}

function host() {
  void cleanupJoin();
  mode.value = "host";
}

function backHome() {
  void cleanupJoin();
  mode.value = "landing";
  roomCode.value = "";
  joinStatus.value = "";
}
</script>

<template>
  <main class="karaoke-web-root">
    <section v-if="mode === 'landing'" class="karaoke-web-landing">
      <div class="karaoke-web-hero">
        <span class="eyebrow">CIDER KARAOKE</span>
        <h1>Karaoke, now on the web.</h1>
        <p>Host a room with Apple Music, or join from a phone as the microphone client.</p>
        <div class="karaoke-web-actions">
          <button class="primary-btn big" type="button" @click="host">Host a Session</button>
          <button class="ghost-btn big" type="button" @click="mode = 'join'">Join a Session</button>
        </div>
      </div>
      <div class="karaoke-web-cards">
        <article><span class="mi">library_music</span><strong>Apple Music</strong><small>MusicKit login, library search, subscriber playback.</small></article>
        <article><span class="mi">mic</span><strong>Phone Microphone</strong><small>WebRTC audio sent directly to the host through the peer server.</small></article>
        <article><span class="mi">lyrics</span><strong>Live Lyrics</strong><small>Apple Music Sing lyrics and synchronized visuals.</small></article>
      </div>
    </section>

    <section v-else-if="mode === 'join'" class="karaoke-web-join">
      <button class="ghost-btn" type="button" @click="backHome">← Back</button>
      <div class="join-card">
        <span class="eyebrow">JOIN ROOM</span>
        <h2>Enter the host code</h2>
        <p>Allow microphone access. Your microphone audio is sent to the karaoke host over WebRTC.</p>
        <input v-model="roomCode" inputmode="numeric" maxlength="4" placeholder="1234" @keyup.enter="joinRoom" />
        <button class="primary-btn big" type="button" :disabled="joinBusy" @click="joinRoom">{{ joinBusy ? "Connecting…" : "Join" }}</button>
        <div class="join-status" :class="{ok: remoteConnected}">{{ joinStatus || "Waiting to connect." }}</div>
      </div>
    </section>

    <section v-else class="karaoke-web-host">
      <button class="web-back-button ghost-btn" type="button" @click="backHome">← Website Home</button>
      <KaraokeHost hostMode="web" />
    </section>
  </main>
</template>

<style>
.karaoke-web-root{min-height:100vh;width:100%;background:#090a0f;color:#f8f8fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.karaoke-web-landing{min-height:100vh;display:grid;place-items:center;gap:34px;padding:64px 24px;position:relative;overflow:hidden;background:radial-gradient(circle at 25% 15%,rgba(56,189,248,.14),transparent 28%),radial-gradient(circle at 78% 70%,rgba(167,139,250,.14),transparent 34%),#090a0f}
.karaoke-web-hero{width:min(860px,100%);text-align:center}
.karaoke-web-hero h1{font-size:clamp(48px,8vw,94px);line-height:.94;letter-spacing:-.055em;margin:12px 0 20px}
.karaoke-web-hero p{max-width:680px;margin:0 auto 28px;color:rgba(245,247,252,.66);font-size:17px;line-height:1.6}
.karaoke-web-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.karaoke-web-cards{width:min(980px,100%);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.karaoke-web-cards article{padding:18px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.045);display:grid;gap:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.karaoke-web-cards .mi{font-size:22px;color:#c4b5fd}.karaoke-web-cards strong{font-size:14px}.karaoke-web-cards small{color:rgba(245,247,252,.55);line-height:1.5}
.karaoke-web-join{min-height:100vh;display:grid;place-items:center;padding:30px}
.join-card{width:min(520px,100%);padding:28px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(10,11,15,.86);box-shadow:0 30px 100px rgba(0,0,0,.4);display:grid;gap:13px}
.join-card h2{margin:0;font-size:34px;letter-spacing:-.04em}.join-card p{margin:0;color:rgba(245,247,252,.62);line-height:1.55}.join-card input{height:56px;padding:0 15px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.055);color:#fff;font-size:28px;letter-spacing:.2em;text-align:center;outline:0}.join-card input:focus{border-color:rgba(167,139,250,.7);box-shadow:0 0 0 3px rgba(167,139,250,.14)}.join-status{padding:11px 13px;border-radius:12px;background:rgba(255,255,255,.045);color:rgba(245,247,252,.58);font-size:12px}.join-status.ok{color:#d8ffd9;background:rgba(96,219,120,.08)}
.karaoke-web-host{min-height:100vh;position:relative}.web-back-button{position:fixed;left:16px;top:16px;z-index:100}
@media(max-width:760px){.karaoke-web-cards{grid-template-columns:1fr}.karaoke-web-landing{padding:44px 18px}.karaoke-web-hero{text-align:left}.karaoke-web-actions{justify-content:flex-start}}
</style>
