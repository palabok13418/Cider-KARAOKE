<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { clientId, getSignalUrl, Transport, type Signal } from "../karaoke";

const code = ref("");
const joined = ref(false);
const granted = ref(false);
const status = ref("Enter the four-digit host code.");
const level = ref(0);
const me = clientId();
let transport: Transport | null = null;
let peer: RTCPeerConnection | null = null;
let stream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let frame = 0;

function message(message: Signal) {
  if (message.type === "join-accepted") status.value = "Connected. Allow microphone access to continue.";
  if (message.type === "webrtc-answer" && message.peerId === me && peer) void peer.setRemoteDescription(message.sdp);
  if (message.type === "webrtc-ice" && message.peerId === me && peer) void peer.addIceCandidate(message.candidate);
  if (message.type === "room-error") status.value = message.message;
}

function connect() {
  if (!/^\d{4}$/.test(code.value)) {
    status.value = "Host codes are exactly four digits.";
    return;
  }
  transport = new Transport(message);
  transport.connect();
  transport.send({type:"join-room",code:code.value,clientId:me});
  joined.value = true;
  status.value = getSignalUrl() ? "Joining the karaoke session…" : "Demo transport connected. Use the same browser for a local demo.";
}

async function allowMic() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
      video:false
    });
    granted.value = true;
    status.value = "Microphone live. You're ready to sing.";

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const bytes = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser?.getByteTimeDomainData(bytes);
      let sum = 0;
      for (const value of bytes) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      level.value = Math.min(100,Math.sqrt(sum / bytes.length) * 180);
      frame = requestAnimationFrame(tick);
    };
    tick();

    peer = new RTCPeerConnection();
    for (const track of stream.getTracks()) peer.addTrack(track,stream);
    peer.onicecandidate = (event) => {
      if (event.candidate) transport?.send({type:"webrtc-ice",peerId:me,candidate:event.candidate.toJSON()});
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    transport?.send({type:"webrtc-offer",peerId:me,sdp:offer});
  } catch (error) {
    status.value = error instanceof DOMException && error.name === "NotAllowedError"
      ? "Microphone permission was blocked. Allow it in the browser to continue."
      : "Could not access the microphone.";
  }
}

function leave() {
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach((track) => track.stop());
  peer?.close();
  transport?.close();
  void audioContext?.close();
  stream = null;
  peer = null;
  joined.value = false;
  granted.value = false;
  level.value = 0;
  status.value = "Enter the four-digit host code.";
}

onBeforeUnmount(leave);
</script>

<template>
  <main class="join-shell">
    <div class="join-top"><span class="brand">CIDER KARAOKE</span><span class="join-label">MICROPHONE CLIENT</span></div>
    <section class="join-card">
      <div class="mic-orb" :class="{active:granted}">🎤</div>
      <span class="eyebrow">{{ joined ? "SESSION" : "JOIN A SESSION" }}</span>
      <h1>{{ joined ? "You're in." : "Connect your microphone." }}</h1>
      <p>{{ status }}</p>

      <div v-if="!joined" class="code-input-row">
        <input v-model="code" maxlength="4" inputmode="numeric" class="host-code-input" placeholder="4827" />
        <button class="primary-btn" @click="connect">Connect</button>
      </div>

      <div v-else class="connected-panel">
        <div class="code-chip">HOST {{ code }}</div>
        <div v-if="!granted">
          <button class="primary-btn big" @click="allowMic">Allow microphone</button>
          <small>Microphone access is required before singing.</small>
        </div>
        <div v-else class="meter-wrap">
          <div class="meter"><div class="meter-fill" :style="{width:level+'%'}"></div></div>
          <div class="ready-row"><span><i class="live-dot"></i> MIC LIVE</span><span>{{ Math.round(level) }}%</span></div>
        </div>
        <button class="ghost-btn" @click="leave">Leave session</button>
      </div>
    </section>
  </main>
</template>
