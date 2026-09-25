import type { Ref } from "vue";

export type Language = "en" | "ko" | "ja" | "zh";

export type Song = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  animatedArtwork?: string;
  canvas?: string;
  catalogId?: string;
  playHref?: string;
  language: Language;
  sing?: boolean;
};

export type QueueSong = Song & { queueId: string };

export type LyricLine = {
  id: string;
  original: string;
  language: Language;
  translation?: string;
  pronunciation?: string;
  startTime?: number;
};

export type LyricsSource = "user" | "apple" | "fallback";

export type LyricsResult = {
  lines: LyricLine[];
  source: LyricsSource;
  ttml?: string;
};

export type Signal =
  | { type: "hello"; role: "host" | "mic"; clientId: string }
  | { type: "room-created"; code: string }
  | { type: "join-room"; code: string; clientId: string }
  | { type: "join-accepted"; hostId: string }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "webrtc-offer"; peerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc-answer"; peerId: string; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc-ice"; peerId: string; candidate: RTCIceCandidateInit }
  | { type: "room-error"; message: string };

declare global {
  interface Window {
    CiderSpotifyCanvas?: { getCurrentCanvas?: () => string | null | Promise<string | null> };
    CIDER_KARAOKE_SIGNALING_URL?: string;
    __CIDER_KARAOKE_RPC_TOKEN__?: string;
    CiderApp?: {
      v3?: (url: string, args?: unknown, opts?: unknown, apiType?: string) => Promise<any>;
    };
  }
}

export const demoSongs: Song[] = [
  { id:"demo-1", title:"Midnight Signal", artist:"KARAOKE Demo", album:"Prototype Sessions", artwork:"https://picsum.photos/seed/karaoke1/800/800", animatedArtwork:"https://picsum.photos/seed/karaoke1/1200/700", language:"en", sing:true },
  { id:"demo-2", title:"별빛 아래", artist:"KARAOKE Demo", album:"Prototype Sessions", artwork:"https://picsum.photos/seed/karaoke2/800/800", language:"ko", sing:true },
  { id:"demo-3", title:"夜のメロディ", artist:"KARAOKE Demo", album:"Prototype Sessions", artwork:"https://picsum.photos/seed/karaoke3/800/800", language:"ja", sing:true },
  { id:"demo-4", title:"一起唱歌", artist:"KARAOKE Demo", album:"Prototype Sessions", artwork:"https://picsum.photos/seed/karaoke4/800/800", language:"zh", sing:true },
  { id:"demo-5", title:"Summer Lights", artist:"KARAOKE Demo", album:"Prototype Sessions", artwork:"https://picsum.photos/seed/karaoke5/800/800", language:"en", sing:true },
  { id:"demo-6", title:"Moonlit Drive", artist:"KARAOKE Demo", album:"Prototype Sessions", artwork:"https://picsum.photos/seed/karaoke6/800/800", canvas:"https://picsum.photos/seed/canvas6/1200/700", language:"en", sing:true }
];

export const demoLyrics: Record<string, LyricLine[]> = {
  "demo-1":[
    {id:"1",original:"Tonight we sing together",language:"en",translation:"Tonight we sing together"},
    {id:"2",original:"Follow the light",language:"en",translation:"Follow the light"},
    {id:"3",original:"Keep the rhythm close",language:"en",translation:"Keep the rhythm close"}
  ],
  "demo-2":[
    {id:"1",original:"별빛 아래 함께 노래해",language:"ko",translation:"Let's sing together under the starlight",pronunciation:"byeolbit arae hamkke noraehae"},
    {id:"2",original:"우리의 밤이 시작돼",language:"ko",translation:"Our night is beginning",pronunciation:"uriui bami sijakdwae"}
  ],
  "demo-3":[
    {id:"1",original:"夜のメロディを歌おう",language:"ja",translation:"Let's sing the melody of the night",pronunciation:"yoru no merodi o utaou"},
    {id:"2",original:"光の中で笑おう",language:"ja",translation:"Let's smile in the light",pronunciation:"hikari no naka de waraou"}
  ],
  "demo-4":[
    {id:"1",original:"一起唱歌吧",language:"zh",translation:"Let's sing together",pronunciation:"yì qǐ chàng gē ba"},
    {id:"2",original:"我爱你们",language:"zh",translation:"I love you all",pronunciation:"wǒ ài nǐ men"}
  ],
  "demo-5":[
    {id:"1",original:"Sing it like you mean it",language:"en",translation:"Sing it like you mean it"},
    {id:"2",original:"Let the whole room glow",language:"en",translation:"Let the whole room glow"}
  ],
  "demo-6":[
    {id:"1",original:"Take the wheel tonight",language:"en",translation:"Take the wheel tonight"},
    {id:"2",original:"Ride the moonlit road",language:"en",translation:"Ride the moonlit road"}
  ]
};

export function clientId() { return Math.random().toString(36).slice(2,10); }
export function hostCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
export function signalUrl() { return (import.meta.env.VITE_SIGNALING_URL || window.CIDER_KARAOKE_SIGNALING_URL || "") as string; }

export class Transport {
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private queued: Signal[] = [];
  constructor(private readonly onMessage: (message: Signal) => void) {}

  connect() {
    const url = signalUrl();
    if (url) {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.flush();
      this.ws.onmessage = (event) => { try { this.onMessage(JSON.parse(event.data)); } catch {} };
      return;
    }
    if ("BroadcastChannel" in window) {
      this.bc = new BroadcastChannel("cider-karaoke-demo");
      this.bc.onmessage = (event) => this.onMessage(event.data);
    }
  }

  send(message: Signal) {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
      else this.queued.push(message);
    } else this.bc?.postMessage(message);
  }

  private flush() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    for (const message of this.queued.splice(0)) this.ws.send(JSON.stringify(message));
  }

  close() { this.ws?.close(); this.bc?.close(); this.ws = null; this.queued = []; }
}

function ciderV3() {
  return (window as any).CiderApp?.v3 as
    | ((url: string, args?: unknown, opts?: unknown, apiType?: string) => Promise<any>)
    | undefined;
}

function normalizeArtwork(url: unknown, width = 420, height = 420) {
  if (typeof url !== "string" || !url) return "";
  return url
    .replace(/\{w\}/g, String(width))
    .replace(/\{h\}/g, String(height))
    .replace(/\{f\}/g, "webp");
}

function guessLanguage(text: string): Language {
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u3400-\u9fff]/.test(text)) return "zh";
  return "en";
}

function decodeCiderEntities(value: string) {
  return value
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, entity) => ({
      amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'"
    } as Record<string, string>)[entity] || entity);
}

function mapSong(row: any): Song {
  const attrs = row?.attributes || row || {};
  const playId = String(attrs?.playParams?.id || row?.playParams?.id || row?.id || "");
  const id = String(row?.id || playId);
  const title = decodeCiderEntities(String(attrs?.name || "Untitled"));
  const animatedArtwork =
    attrs?.editorialVideo?.motionSquareVideo1x1?.video ||
    attrs?.editorialVideo?.motionWideVideo21x9?.video ||
    attrs?.editorialVideo?.motionTallVideo3x4?.video ||
    undefined;

  return {
    id,
    catalogId: playId || undefined,
    title,
    artist: decodeCiderEntities(String(attrs?.artistName || "Unknown artist")),
    album: attrs?.albumName ? decodeCiderEntities(String(attrs.albumName)) : undefined,
    artwork: normalizeArtwork(attrs?.artwork?.url || "", 420, 420),
    animatedArtwork,
    language: guessLanguage(title),
    sing: attrs?.isVocalAttenuationAllowed !== false,
    playHref: attrs?.url || (playId ? "https://music.apple.com/us/songs/_/" + encodeURIComponent(playId) : undefined)
  };
}

function extractSongRows(payload: any): any[] {
  const direct = payload?.data?.data;
  if (Array.isArray(direct)) return direct;
  const searchSongs = payload?.data?.results?.songs?.data;
  if (Array.isArray(searchSongs)) return searchSongs;
  const catalogSongs = payload?.results?.songs?.data;
  if (Array.isArray(catalogSongs)) return catalogSongs;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function ciderStorefront(): Promise<string> {
  const known = String((window as any).__PLUGINSYS__?.Stores?.appleMusicStore?.storefrontId || "").trim();
  if (known) return known;

  const v3 = ciderV3();
  if (v3) {
    try {
      const response = await v3("/v1/me/storefront");
      const id = response?.data?.data?.[0]?.id || response?.data?.[0]?.id || response?.data?.id;
      if (id) return String(id);
    } catch {}
  }

  return "us";
}

async function ciderMusicRequest(path: string): Promise<any | null> {
  const v3 = ciderV3();
  if (!v3) return null;
  try {
    return await v3(path);
  } catch {
    return null;
  }
}

export async function ciderCatalogSearch(term: string): Promise<Song[]> {
  const needle = term.trim();
  if (!needle) return [];

  const storefront = await ciderStorefront();
  const response = await ciderMusicRequest(
    "/v1/catalog/" + encodeURIComponent(storefront) +
    "/search?term=" + encodeURIComponent(needle) +
    "&types=songs&limit=50&extend=editorialArtwork,editorialVideo"
  );

  return extractSongRows(response)
    .map(mapSong)
    .filter((song) => song.artwork || song.playHref || song.id);
}

export async function ciderLibrarySongs(limit = 100): Promise<Song[]> {
  const response = await ciderMusicRequest("/v1/me/library/songs?limit=" + Math.min(Math.max(limit, 1), 200));
  return extractSongRows(response)
    .filter((row: any) => row?.attributes?.isVocalAttenuationAllowed !== false)
    .map(mapSong)
    .filter((song) => song.artwork || song.playHref || song.id);
}

export async function ciderSearch(term: string): Promise<Song[]> {
  return ciderCatalogSearch(term);
}

export async function ciderNowPlaying(): Promise<Song | null> {
  try {
    const item = (window as any).__PLUGINSYS__?.Stores?.appleMusicStore?.nowPlayingItem;
    if (!item) return null;
    return mapSong(item);
  } catch {
    return null;
  }
}

export async function ciderPlay(song: Song) {
  const store = (window as any).__PLUGINSYS__?.Stores?.appleMusicStore;
  const href = song.playHref || (song.catalogId ? "https://music.apple.com/us/songs/_/" + encodeURIComponent(song.catalogId) : undefined);

  if (href && store?.playItemByHref) {
    await store.playItemByHref(href);
    return;
  }

  if (song.id && store?.player?.playItemByID) {
    await store.player.playItemByID(song.id);
    return;
  }

  throw new Error("Cider Apple Music playback adapter unavailable");
}

export async function visualFor(song: Song): Promise<{kind:"animated"|"canvas"|"static";url:string}> {
  if (song.animatedArtwork) return {kind:"animated" as const,url:song.animatedArtwork};

  const provider = window.CiderSpotifyCanvas?.getCurrentCanvas;
  if (provider) {
    try {
      const url = await provider();
      if (url) return {kind:"canvas" as const,url};
    } catch {}
  }

  if (song.canvas) return {kind:"canvas" as const,url:song.canvas};
  return {kind:"static" as const,url:song.artwork};
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return NaN;
  const clean = value.trim().replace(/s$/, "");
  return clean.split(":").reduce((acc, part) => acc * 60 + Number.parseFloat(part), 0);
}

export function parseTTML(ttml: string): LyricLine[] {
  const xml = decodeCiderEntities(ttml);
  const lines: LyricLine[] = [];

  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const nodes = Array.from(doc.querySelectorAll("p"));

    nodes.forEach((node, index) => {
      const original = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!original) return;

      const startTime = parseTimestamp(node.getAttribute("begin"));
      lines.push({
        id: String(index + 1),
        original,
        language: guessLanguage(original),
        startTime: Number.isFinite(startTime) ? startTime : undefined
      });
    });
  } catch {}

  if (lines.length) return lines;

  for (const match of xml.matchAll(/<p\b[^>]*\bbegin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const original = decodeCiderEntities(match[2].replace(/<[^>]*>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!original) continue;

    const startTime = parseTimestamp(match[1]);
    lines.push({
      id: String(lines.length + 1),
      original,
      language: guessLanguage(original),
      startTime: Number.isFinite(startTime) ? startTime : undefined
    });
  }

  return lines;
}

type StudioLyric = { ttml?: string; score?: number; [key: string]: unknown };

export async function fetchUserSubmittedLyrics(song: Song): Promise<string | null> {
  if (!song.catalogId) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      "https://exp-rise.cider.sh/api/v1/lyrics/user/" + encodeURIComponent(song.catalogId) + "/all",
      { method: "GET", cache: "no-store", signal: controller.signal }
    );

    if (!response.ok) return null;

    const payload = await response.json() as { lyrics?: StudioLyric[] };
    const candidates = Array.isArray(payload?.lyrics) ? payload.lyrics : [];

    candidates.sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
    const ttml = candidates.find((item) => typeof item?.ttml === "string" && item.ttml.trim())?.ttml;

    return ttml || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchAppleMusicLyrics(song: Song): Promise<string | null> {
  if (!song.catalogId) return null;

  const storefront = await ciderStorefront();
  const response = await ciderMusicRequest(
    "/v1/catalog/" + encodeURIComponent(storefront) +
    "/songs/" + encodeURIComponent(song.catalogId) + "/lyrics"
  );

  const rows = response?.data?.data || response?.data || [];
  const first = Array.isArray(rows) ? rows[0] : rows;
  const attributes = first?.attributes || {};
  const direct = typeof attributes.ttml === "string" ? attributes.ttml : null;

  if (direct) return direct;

  const localizations = attributes.ttmlLocalizations;
  if (localizations && typeof localizations === "object") {
    const localized = Object.values(localizations).find((value) => typeof value === "string" && value.trim());
    if (typeof localized === "string") return localized;
  }

  return null;
}

export async function fetchLyricsForSong(song: Song): Promise<LyricsResult> {
  // Cider's Apple Music TTML is the authoritative Sing source.
  // Keep the original TTML intact so the karaoke surface can use Cider's renderer.
  const appleTTML = await fetchAppleMusicLyrics(song);
  if (appleTTML) {
    const lines = parseTTML(appleTTML);
    if (lines.length) return {lines,source:"apple",ttml:appleTTML};
  }

  // User-submitted TTML remains a compatibility fallback.
  const userTTML = await fetchUserSubmittedLyrics(song);
  if (userTTML) {
    const lines = parseTTML(userTTML);
    if (lines.length) return {lines,source:"user",ttml:userTTML};
  }

  return {
    lines: demoLyrics[song.id] || [],
    source:"fallback"
  };
}

export async function enhanceLyrics(lines: LyricLine[]) {
  const pronunciation: Record<string,string> = {
    "별빛 아래 함께 노래해":"byeolbit arae hamkke noraehae", "우리의 밤이 시작돼":"uriui bami sijakdwae",
    "夜のメロディを歌おう":"yoru no merodi o utaou", "光の中で笑おう":"hikari no naka de waraou",
    "一起唱歌吧":"yì qǐ chàng gē ba", "我爱你们":"wǒ ài nǐ men"
  };
  const translations: Record<string,string> = {
    "별빛 아래 함께 노래해":"Let's sing together under the starlight", "우리의 밤이 시작돼":"Our night is beginning",
    "夜のメロディを歌おう":"Let's sing the melody of the night", "光の中で笑おう":"Let's smile in the light",
    "一起唱歌吧":"Let's sing together", "我爱你们":"I love you all"
  };

  return lines.map((line) => ({
    ...line,
    translation: line.translation || translations[line.original] || line.original,
    pronunciation:["ko","ja","zh"].includes(line.language) ? line.pronunciation || pronunciation[line.original] : undefined
  }));
}

export function getHostAudioElement(): HTMLAudioElement | null {
  const storeAudio = (window as any).__PLUGINSYS__?.Stores?.appleMusicStore?.audioElement;
  if (storeAudio && typeof storeAudio.currentTime === "number") return storeAudio;
  const fallback = document.querySelector("audio");
  return fallback instanceof HTMLAudioElement ? fallback : null;
}

export function getPlaybackTime() {
  const audio = getHostAudioElement();
  const time = audio?.currentTime;
  return typeof time === "number" && Number.isFinite(time) ? time : 0;
}

export async function vocalRuntime() {
  const nav = navigator as Navigator & {ml?: unknown};
  if (nav.ml) return {mode:"webnn",message:"WebNN available. Lightweight model hook ready.",loaded:false};
  if ("gpu" in navigator) return {mode:"webgpu",message:"WebGPU available. WebNN was not exposed.",loaded:false};
  return {mode:"fallback",message:"Low-cost local fallback active until the ML model is installed.",loaded:false};
}

export type MaybeRefSong = Ref<Song | null>;
