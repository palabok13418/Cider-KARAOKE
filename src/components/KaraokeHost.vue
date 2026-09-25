<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  ciderNowPlaying, ciderPlay, ciderSearch, ciderLibrarySongs, demoLyrics, enhanceLyrics,
  hostCode, signalUrl, Transport, visualFor, vocalRuntime, clientId,
  type QueueSong, type Signal, type Song
} from "../karaoke";

const props = defineProps<{ hostMode: "cider" | "web" }>();
const current = ref<Song | null>(null);
const queue = ref<QueueSong[]>([]);
const lines = ref<Awaited<ReturnType<typeof enhanceLyrics>>>([]);
const visual = ref<{kind:"animated"|"canvas"|"static";url:string}|null>(null);
const query = ref("");
const results = ref<Song[]>([]);
const code = ref(hostCode());
const libraryBusy = ref(true);
const libraryMessage = ref("Loading your Apple Music library…");
const status = ref("Host ready. Share the four-digit code.");
const micCount = ref(0);
const vocal = ref({mode:"fallback",message:"Starting local vocal remover…",loaded:false});
const searchBusy = ref(false);
const activeIndex = ref(0);
const transport = ref<Transport | null>(null);
const peers = new Map<string, RTCPeerConnection>();
let micAudio: HTMLAudioElement | null = null;
const me = clientId();

function addToQueue(song: Song) { queue.value.push({...song,queueId:Math.random().toString(36).slice(2)}); status.value = "Added " + song.title + " to the karaoke queue."; }

async function playSelected(song: Song, remove = false) {
  current.value = song;
  lines.value = await enhanceLyrics(demoLyrics[song.id] || [{id:"fallback",original:"Ready to sing",language:"en",translation:"Ready to sing"}]);
  visual.value = await visualFor(song);
  activeIndex.value = 0;
  status.value = "Now singing: " + song.title;
  if (props.hostMode === "cider") {
    try { await ciderPlay(song); } catch { status.value = "Previewing " + song.title + ". Cider playback adapter needs access."; }
  }
  if (remove) {
    const index = queue.value.findIndex((item) => item.id === song.id);
    if (index >= 0) queue.value.splice(index,1);
  }
}

async function search() {
  searchBusy.value = true;
  libraryMessage.value = query.value.trim() ? "Searching your Apple Music library…" : "Loading your Apple Music library…";
  const live = await ciderSearch(query.value);
  results.value = live;
  libraryMessage.value = live.length ? `${live.length} song${live.length === 1 ? "" : "s"} found in your library.` : "No matching songs found in your Apple Music library.";
  searchBusy.value = false;
}

function removeQueue(id: string) { queue.value = queue.value.filter((song) => song.queueId !== id); }

function onMessage(message: Signal) {
  if (message.type === "room-created") { code.value = message.code; status.value = "Host ready. Share the four-digit code."; return; }
  if (message.type === "join-room" && !signalUrl() && message.code === code.value) {
    micCount.value += 1;
    transport.value?.send({type:"join-accepted",hostId:me});
    transport.value?.send({type:"peer-joined",peerId:message.clientId});
    return;
  }
  if (message.type === "peer-joined") { if (peers.has(message.peerId)) return; micCount.value += 1; void preparePeer(message.peerId); return; }
  if (message.type === "peer-left") { micCount.value = Math.max(0,micCount.value-1); peers.get(message.peerId)?.close(); peers.delete(message.peerId); return; }
  if (message.type === "webrtc-offer") { void answerOffer(message.peerId,message.sdp); return; }
  if (message.type === "webrtc-ice") { const peer = peers.get(message.peerId); if (peer) void peer.addIceCandidate(message.candidate); return; }
  if (message.type === "room-error") status.value = message.message;
}

function startTransport() {
  const t = new Transport(onMessage);
  transport.value = t;
  t.connect();
  t.send({type:"hello",role:"host",clientId:me});
  t.send({type:"room-created",code:code.value});
}

async function preparePeer(peerId: string) {
  const peer = new RTCPeerConnection();
  peers.set(peerId,peer);
  peer.ontrack = (event) => {
    if (!micAudio) { micAudio = document.createElement("audio"); micAudio.autoplay = true; micAudio.style.display = "none"; document.body.appendChild(micAudio); }
    micAudio.srcObject = event.streams[0];
  };
  peer.onicecandidate = (event) => { if (event.candidate) transport.value?.send({type:"webrtc-ice",peerId,candidate:event.candidate.toJSON()}); };
}

async function answerOffer(peerId: string, sdp: RTCSessionDescriptionInit) {
  if (!peers.has(peerId)) await preparePeer(peerId);
  const peer = peers.get(peerId)!;
  await peer.setRemoteDescription(sdp);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  transport.value?.send({type:"webrtc-answer",peerId,sdp:answer});
}

async function loadLibrary() {
  libraryBusy.value = true;
  libraryMessage.value = "Loading your Apple Music library…";
  const library = await ciderLibrarySongs(100);
  results.value = library;
  libraryMessage.value = library.length ? `${library.length} library songs loaded.` : "Your Apple Music library could not be loaded in Cider.";
  libraryBusy.value = false;
}

onMounted(async () => {
  startTransport();
  vocal.value = await vocalRuntime();
  await loadLibrary();
  const now = props.hostMode === "cider" ? await ciderNowPlaying() : null;
  if (now) await playSelected(now);
  else if (results.value[0]) await playSelected(results.value[0]);
});

onBeforeUnmount(() => { transport.value?.close(); peers.forEach((peer) => peer.close()); micAudio?.remove(); });
</script>

<template>
  <main class="host-shell">
    <header class="host-header">
      <div class="host-brand"><span class="brand-mark">🎤</span><div><span class="eyebrow">CIDER KARAOKE</span><strong>{{ props.hostMode === "cider" ? "Karaoke" : "Web Host" }}</strong></div></div>
      <div class="host-code"><small>HOST CODE</small><strong>{{ code }}</strong></div>
      <div class="host-status"><span class="signal"><i></i>{{ micCount }} mic{{ micCount === 1 ? "" : "s" }}</span><span>{{ status }}</span></div>
    </header>
    <div class="host-body">
      <section class="main-stage">
        <div v-if="visual" class="visual-backdrop" :style="{backgroundImage:'url('+visual.url+')'}"></div>
        <div class="visual-card">
          <img v-if="visual" :src="visual.url" class="visual-media" :alt="current?.title || 'Karaoke artwork'" />
          <div class="visual-overlay"></div>
          <div class="stage-content">
            <section class="lyrics-stage">
              <div v-if="current" class="song-meta"><span>{{ current.title }}</span><span class="dot">•</span><span>{{ current.artist }}</span></div>
              <div class="lyrics-lines">
                <article v-for="(line,index) in lines" :key="line.id" class="lyric-line" :class="{active:index===activeIndex,past:index<activeIndex}">
                  <div class="original">{{ line.original }}</div>
                  <div v-if="line.pronunciation" class="pronunciation">{{ line.pronunciation }}</div>
                  <div v-if="line.translation && line.language !== 'en'" class="translation">{{ line.translation }}</div>
                </article>
              </div>
            </section>
            <div class="stage-footer">
              <div class="vocal-status"><div><span class="eyebrow">VOCAL REMOVER</span><strong>{{ vocal.mode.toUpperCase() }}</strong></div><span class="status-dot" :class="{live:vocal.loaded}"></span><small>{{ vocal.message }}</small></div>
              <div class="translation-chip">LOCAL TRANSLATION · ON DEVICE</div>
            </div>
          </div>
        </div>
        <section class="browser-drawer">
          <div class="browser-header"><div><span class="eyebrow">APPLE MUSIC LIBRARY</span><h2>Choose a Song</h2></div><button class="catalog-pill library-refresh" type="button" @click="loadLibrary">{{ libraryBusy ? "Loading…" : "Refresh" }}</button></div>
          <div class="search-row"><input v-model="query" class="search" placeholder="Search your library…" @keyup.enter="search" /><button class="primary-btn" @click="search">{{ searchBusy ? "Searching…" : "Search" }}</button></div>
          <div class="category-row"><span class="library-message">{{ libraryMessage }}</span></div>
          <div class="song-list">
            <button v-for="song in results" :key="song.id" class="song-card" @click="addToQueue(song)"><img :src="song.artwork" :alt="song.title" /><span class="song-copy"><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span><span class="add-icon">＋</span></button>
          </div>
        </section>
      </section>
      <aside class="queue-panel">
        <div class="queue-title"><div><span class="eyebrow">UP NEXT</span><h3>Karaoke Queue</h3></div><span class="queue-count">{{ queue.length }}</span></div>
        <div class="queue-list">
          <button v-for="song in queue" :key="song.queueId" class="queue-item" @click="playSelected(song,true)"><img :src="song.artwork" :alt="song.title" /><span class="queue-copy"><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span><span class="remove" @click.stop="removeQueue(song.queueId)">×</span></button>
          <div v-if="!queue.length" class="queue-empty">Add songs from the browser and they will appear here.</div>
        </div>
      </aside>
    </div>
  </main>
</template>
