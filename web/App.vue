<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Transport, clientId, hostCode, parseTTML, type LyricLine, type Song } from "../src/karaoke";

const CIDER_BASE = "http://localhost:10767";
const MUS_API_BASE = String((import.meta as any).env?.VITE_MUS_API_BASE || "https://mus-api.vercel.app").replace(/\/+$/, "");
const mus = (path: string) => MUS_API_BASE + path;
const role = ref<"host"|"mic">("host");
const ciderToken = ref("");
const ciderConnected = ref(false);
const appleConnected = ref(false);
const query = ref("");
const results = ref<Song[]>([]);
const queue = ref<Song[]>([]);
const room = ref("");
const joinCode = ref("");
const status = ref("Connect Cider or Apple Music to begin.");
const current = ref<Song | null>(null);
const lyrics = ref<LyricLine[]>([]);
const activeLyric = ref(0);
let transport: Transport | null = null;
let music: any = null;

function normalize(row: any): Song {
  const a = row?.attributes || row || {};
  const id = String(row?.id || a?.playParams?.id || "");
  const art = String(a?.artwork?.url || "").replace(/\{w\}/g, "720").replace(/\{h\}/g, "720").replace(/\{f\}/g, "jpg");
  return {
    id,
    catalogId: String(a?.playParams?.id || id),
    title: String(a?.name || "Untitled"),
    artist: String(a?.artistName || "Unknown artist"),
    album: String(a?.albumName || ""),
    artwork: art,
    playHref: String(a?.url || ""),
    language: "en",
    sing: a?.isVocalAttenuationAllowed !== false
  };
}

async function cider(path: string, opts: any = {}) {
  if (!ciderToken.value) throw new Error("Cider is not connected");
  const response = await fetch(CIDER_BASE + path, {
    ...opts,
    headers: { accept: "application/json", ...(opts.headers || {}), apptoken: ciderToken.value }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || body?.error || ("Cider HTTP " + response.status));
  return body;
}

async function connectCider() {
  status.value = "Waiting for Cider approval…";
  try {
    const response = await fetch(CIDER_BASE + "/api/v2/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        app_name: "Cider Karaoke Web",
        app_image: location.origin,
        scopes: ["playback", "queue", "library", "audio", "account", "lyrics"]
      })
    });
    const body = await response.json().catch(() => null);
    const token = String(body?.data?.token || "");
    if (!response.ok || !token) throw new Error(body?.error?.message || "Cider approval was not completed");
    ciderToken.value = token;
    ciderConnected.value = true;
    status.value = "Cider connected.";
  } catch (error: any) {
    status.value = error?.message || "Cider connection failed.";
  }
}

async function loadCiderLibrary() {
  try {
    const body = await cider("/api/v2/library/songs");
    const rows = Array.isArray(body?.data?.data) ? body.data.data : Array.isArray(body?.data) ? body.data : [];
    results.value = rows.slice(0, 100).map(normalize);
    status.value = "Loaded " + results.value.length + " songs from Cider.";
  } catch (error: any) {
    status.value = error?.message || "Could not load Cider library.";
  }
}

function loadMusicKitScript() {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).MusicKit) return resolve();
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("MusicKit failed to load"));
    document.head.appendChild(script);
  });
}

async function connectAppleMusic() {
  status.value = "Opening Apple Music authorization…";
  try {
    await loadMusicKitScript();
    const cfg = await fetch(mus("/api/apple/config")).then((r) => r.json());
    if (!cfg?.developerToken) throw new Error("Apple Music developer token is not configured in Mus-API.");
    const kit = (window as any).MusicKit;
    await kit.configure({ developerToken: cfg.developerToken, app: { name: "Cider Karaoke Web", build: "2026.09.27" } });
    music = kit.getInstance();
    await music.authorize();
    appleConnected.value = true;
    status.value = "Apple Music connected.";
  } catch (error: any) {
    status.value = error?.message || "Apple Music connection failed.";
  }
}

async function search() {
  if (!query.value.trim()) return;
  status.value = "Searching Apple Music…";
  try {
    const body = await fetch(mus("/api/apple/search?q=" + encodeURIComponent(query.value.trim()) + "&types=songs&limit=30")).then((r) => r.json());
    const rows = Array.isArray(body?.results?.songs?.data) ? body.results.songs.data : [];
    results.value = rows.map(normalize);
    status.value = "Found " + results.value.length + " songs.";
  } catch (error: any) {
    status.value = error?.message || "Search failed.";
  }
}

function add(song: Song) {
  if (!queue.value.some((item) => item.id === song.id)) queue.value.push({ ...song });
}

async function loadLyrics(song: Song) {
  try {
    const body = await fetch(mus("/api/apple/lyrics-ttml?id=" + encodeURIComponent(song.catalogId || song.id) + "&format=json")).then((r) => r.json());
    lyrics.value = parseTTML(String(body?.ttml || body?.lyrics || ""));
    activeLyric.value = 0;
  } catch {
    lyrics.value = [];
  }
}

async function play(song: Song) {
  current.value = song;
  try {
    if (music && appleConnected.value) {
      await music.setQueue({ song: song.catalogId || song.id });
      await music.play();
      status.value = "Playing " + song.title;
    } else if (ciderConnected.value) {
      const id = song.catalogId || song.id;
      await cider("/api/v2/playback/play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, trackId: id }) });
      status.value = "Playing through Cider: " + song.title;
    }
  } catch (error: any) {
    status.value = error?.message || "Playback failed.";
  }
  await loadLyrics(song);
  if (role.value === "host") transport?.send({ type: "song", song, startedAt: Date.now() } as any);
}

function createRoom() {
  room.value = hostCode();
  transport?.send({ type: "room-created", code: room.value } as any);
  status.value = "Room " + room.value + " is ready.";
}

function joinRoom() {
  room.value = joinCode.value.trim();
  transport?.send({ type: "join-room", code: room.value, clientId: clientId() } as any);
  status.value = "Joining room " + room.value + "…";
}

transport = new Transport((message: any) => {
  if (message.type === "peer-joined") status.value = "A singer joined the room.";
  else if (message.type === "peer-left") status.value = "A singer left the room.";
  else if (message.type === "room-error") status.value = message.message;
  else if (message.type === "song" && role.value === "mic") {
    current.value = message.song;
    void loadLyrics(message.song);
  }
});
transport.connect();

const currentLine = computed(() => lyrics.value[activeLyric.value]?.original || "");
onBeforeUnmount(() => transport?.close());
</script>

<template>
  <main class="web-app">
    <header class="topbar">
      <div><span class="eyebrow">CIDER KARAOKE</span><h1>Sing together.</h1></div>
      <div class="top-actions">
        <button :class="{on:ciderConnected}" @click="connectCider">{{ ciderConnected ? "Cider Connected" : "Connect Cider" }}</button>
        <button :class="{on:appleConnected}" @click="connectAppleMusic">{{ appleConnected ? "Apple Music Connected" : "Connect Apple Music" }}</button>
      </div>
    </header>
    <section class="layout">
      <aside class="sidebar">
        <div class="role"><span class="eyebrow">MODE</span><div class="seg"><button :class="{on:role==='host'}" @click="role='host'">Host</button><button :class="{on:role==='mic'}" @click="role='mic'">Mic</button></div></div>
        <div class="room-card"><span class="eyebrow">ROOM</span><strong>{{ room || "Not joined" }}</strong><div class="room-actions"><button @click="createRoom">Create</button><input v-model="joinCode" placeholder="4-digit code"><button @click="joinRoom">Join</button></div></div>
        <div class="status">{{ status }}</div>
      </aside>
      <section class="content">
        <div class="searchbar"><input v-model="query" placeholder="Search Apple Music…" @keyup.enter="search"><button @click="search">Search</button><button @click="loadCiderLibrary">Cider Library</button></div>
        <div class="grid"><button v-for="song in results" :key="song.id" class="song" @click="add(song)"><img :src="song.artwork" alt=""><span><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span><b>+</b></button></div>
        <div class="queue"><div class="section-head"><div><span class="eyebrow">QUEUE</span><h2>Up next</h2></div><span>{{ queue.length }}</span></div><div v-if="!queue.length" class="empty">Add a song from search or your Cider library.</div><button v-for="song in queue" :key="'q'+song.id" class="queue-song" @click="play(song)"><img :src="song.artwork" alt=""><span><strong>{{ song.title }}</strong><small>{{ song.artist }}</small></span><span class="play">Play</span></button></div>
      </section>
      <aside class="stage">
        <div v-if="current" class="current"><img :src="current.artwork" alt=""><div><span class="eyebrow">NOW SINGING</span><h2>{{ current.title }}</h2><p>{{ current.artist }}</p></div></div>
        <div v-else class="current empty-current"><span class="eyebrow">NOW SINGING</span><h2>Ready when you are.</h2></div>
        <div class="lyrics"><span class="eyebrow">LYRICS</span><p class="lyric-current">{{ currentLine || "Select a song to load lyrics." }}</p><div class="lyric-rest"><span v-for="(line,i) in lyrics.slice(0,6)" :key="line.id" :class="{active:i===activeLyric}">{{ line.original }}</span></div></div>
      </aside>
    </section>
  </main>
</template>
