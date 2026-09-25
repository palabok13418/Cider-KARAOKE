<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  ciderNowPlaying, ciderPlay, ciderSearch, ciderLibrarySongs, demoLyrics, enhanceLyrics,
  hostCode, signalUrl, Transport, visualFor, vocalRuntime, clientId,
  type QueueSong, type Signal, type Song
} from "../karaoke";
import { openPlayerControls, closePlayerControls } from "../player-window";

const props = defineProps<{ hostMode: "cider" | "web" }>();
const current = ref<Song | null>(null);
const queue = ref<QueueSong[]>([]);
const lines = ref<Awaited<ReturnType<typeof enhanceLyrics>>>([]);
const visual = ref<{kind:"animated"|"canvas"|"static";url:string}|null>(null);
const query = ref("");
const results = ref<Song[]>([]);
const selectedSong = ref<Song | null>(null);
const karaokeStarted = ref(false);
const playing = ref(false);
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

function addToQueue(song: Song) {
  queue.value.push({...song,queueId:Math.random().toString(36).slice(2)});
  selectedSong.value = song;
  status.value = "Selected " + song.title + ". Press Start when you are ready.";
}

async function stageSong(song: Song) {
  current.value = song;
  lines.value = await enhanceLyrics(demoLyrics[song.id] || [{id:"fallback",original:"Ready to sing",language:"en",translation:"Ready to sing"}]);
  visual.value = await visualFor(song);
  activeIndex.value = 0;
}

type PlayerControls = Awaited<ReturnType<typeof openPlayerControls>>;
let playerControls: PlayerControls | null = null;

async function syncPlayerControls() {
  if (!playerControls || !current.value) return;
  playerControls.update({
    title: current.value.title,
    artist: current.value.artist,
    artwork: current.value.artwork,
    playing: playing.value,
  });
}

async function handlePlayerCommand(type: "ready" | "toggle" | "previous" | "next") {
  const store = (window as any).__PLUGINSYS__?.Stores?.appleMusicStore;
  if (type === "ready") {
    await syncPlayerControls();
    return;
  }

  if (type === "toggle") {
    if (!store) return;
    try {
      if (store.isPlaying) await store.pause();
      else await store.play();
      playing.value = Boolean(store.isPlaying);
    } catch {}
    await syncPlayerControls();
    return;
  }

  if (type === "previous") {
    try {
      if (store?.skipToPrevious) await store.skipToPrevious();
      playing.value = true;
    } catch {}
    setTimeout(async () => {
      const now = await ciderNowPlaying();
      if (now) {
        await stageSong(now);
        await syncPlayerControls();
      }
    }, 300);
    return;
  }

  if (type === "next") {
    const nextQueued = queue.value[0];
    if (nextQueued) {
      await playSelected(nextQueued, true);
      return;
    }
    try {
      if (store?.skipToNext) await store.skipToNext();
      playing.value = true;
    } catch {}
    setTimeout(async () => {
      const now = await ciderNowPlaying();
      if (now) {
        await stageSong(now);
        await syncPlayerControls();
      }
    }, 300);
  }
}

async function startKaraoke() {
  const target = selectedSong.value || queue.value[0] || current.value;
  if (!target) {
    status.value = "Choose a song first.";
    return;
  }

  await stageSong(target);

  try {
    playerControls = await openPlayerControls(
      {
        title: target.title,
        artist: target.artist,
        artwork: target.artwork,
        playing: false,
      },
      handlePlayerCommand,
    );
  } catch {
    status.value = "The separate player window could not be opened.";
    return;
  }

  karaokeStarted.value = true;
  const queued = queue.value.some((item) => item.id === target.id);
  await playSelected(target, queued);
  selectedSong.value = null;
}

async function playSelected(song: Song, remove = false) {
  await stageSong(song);
  status.value = "Now singing: " + song.title;
  if (props.hostMode === "cider") {
    try {
      await ciderPlay(song);
      playing.value = true;
    } catch {
      playing.value = false;
      status.value = "Previewing " + song.title + ". Cider playback adapter needs access.";
    }
  }
  if (remove) {
    const index = queue.value.findIndex((item) => item.id === song.id);
    if (index >= 0) queue.value.splice(index,1);
  }
  await syncPlayerControls();
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
  if (now) await stageSong(now);
  else if (results.value[0]) await stageSong(results.value[0]);
});

onBeforeUnmount(() => {
  transport.value?.close();
  peers.forEach((peer) => peer.close());
  micAudio?.remove();
  closePlayerControls();
});
</script>

<template>
  <main class="host-shell">
    <div v-if="!karaokeStarted" class="host-body pre-karaoke">
      <section class="main-stage">
        <section class="browser-drawer">
          <div class="browser-header">
            <div><span class="eyebrow">APPLE MUSIC LIBRARY</span><h2>Choose a Song</h2></div>
            <button class="catalog-pill library-refresh" type="button" @click="loadLibrary">{{ libraryBusy ? "Loading…" : "Refresh" }}</button>
          </div>
          <div class="search-row">
            <input v-model="query" class="search" placeholder="Search your library…" @keyup.enter="search" />
            <button class="primary-btn" @click="search">{{ searchBusy ? "Searching…" : "Search" }}</button>
          </div>
          <div class="category-row"><span class="library-message">{{ libraryMessage }}</span></div>
          <div class="song-list">
            <button v-for="song in results" :key="song.id" class="song-card" @click="addToQueue(song)">
              <img :src="song.artwork" :alt="song.title" />
              <span class="song-copy"><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span>
              <span class="add-icon">＋</span>
            </button>
          </div>
        </section>
      </section>

      <aside class="queue-panel">
        <div class="host-code-mini">
          <span class="eyebrow">HOST CODE</span>
          <strong>{{ code }}</strong>
          <small>{{ micCount }} connected mic{{ micCount === 1 ? "" : "s" }}</small>
        </div>
        <div class="queue-title">
          <div><span class="eyebrow">UP NEXT</span><h3>Karaoke Queue</h3></div>
          <div class="queue-actions">
            <button class="start-btn" type="button" :disabled="!selectedSong && !queue.length && !current" @click="startKaraoke">Start</button>
            <span class="queue-count">{{ queue.length }}</span>
          </div>
        </div>
        <div class="queue-list">
          <button v-for="song in queue" :key="song.queueId" class="queue-item" :class="{selected:selectedSong?.id === song.id}" @click="selectedSong = song; status = 'Selected ' + song.title + '. Press Start when you are ready.'">
            <img :src="song.artwork" :alt="song.title" />
            <span class="queue-copy"><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span>
            <span class="remove" @click.stop="removeQueue(song.queueId)">×</span>
          </button>
          <div v-if="!queue.length" class="queue-empty">Add songs from the library, select one, then press Start.</div>
        </div>
      </aside>
    </div>

    <div v-else class="karaoke-live-stage">
      <section class="karaoke-visual-panel">
        <video
          v-if="visual && visual.kind !== 'static'"
          class="karaoke-visual-video"
          :src="visual.url"
          autoplay
          muted
          loop
          playsinline
        ></video>
        <img
          v-else-if="visual"
          class="karaoke-visual-image"
          :src="visual.url"
          :alt="current?.title || 'Album artwork'"
        />
        <div v-else class="karaoke-visual-empty">No artwork available</div>
        <div class="karaoke-song-meta" v-if="current">
          <strong>{{ current.title }}</strong>
          <span>{{ current.artist }}</span>
        </div>
      </section>

      <section class="karaoke-lyrics-panel">
        <div class="karaoke-lyrics-top">
          <span class="eyebrow">KARAOKE</span>
          <div class="live-code">{{ code }}</div>
        </div>
        <div class="karaoke-lyrics">
          <article v-for="(line,index) in lines" :key="line.id" class="lyric-line-live" :class="{active:index===activeIndex,past:index<activeIndex}">
            <div class="original">{{ line.original }}</div>
            <div v-if="line.pronunciation" class="pronunciation">{{ line.pronunciation }}</div>
            <div v-if="line.translation && line.language !== 'en'" class="translation">{{ line.translation }}</div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>