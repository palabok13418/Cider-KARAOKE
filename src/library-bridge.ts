import { demoSongs, type Language, type Song } from "./karaoke";

type LibrarySong = Song & { catalogId?: string };

const state: { songs: Map<string, LibrarySong>; installed: boolean } = {
  songs: new Map(),
  installed: false,
};

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

function mapLibrarySong(row: any): LibrarySong {
  const attrs = row?.attributes || row || {};
  const catalogId = String(attrs?.playParams?.id || row?.playParams?.id || "");
  const id = String(row?.id || catalogId);
  const title = String(attrs?.name || "Untitled");
  return {
    id,
    catalogId: catalogId || undefined,
    title,
    artist: String(attrs?.artistName || "Unknown artist"),
    album: attrs?.albumName,
    artwork: normalizeArtwork(attrs?.artwork?.url || ""),
    language: guessLanguage(title),
    sing: attrs?.isVocalAttenuationAllowed !== false,
  };
}

function extractRows(payload: any): any[] {
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data?.results?.songs?.data)) return payload.data.results.songs.data;
  return [];
}

export async function primeAppleMusicLibrary() {
  const v3 = (window as any).CiderApp?.v3;
  if (typeof v3 !== "function") return [];

  try {
    const response = await v3("/v1/me/library/songs?limit=100");
    const songs = extractRows(response)
      .filter((row: any) => row?.attributes?.isVocalAttenuationAllowed !== false)
      .map(mapLibrarySong)
      .filter((song) => song.id);

    state.songs.clear();
    for (const song of songs) state.songs.set(song.id, song);

    // Replace the existing demo catalog before Karaoke is instantiated.
    // KaraokeHost starts from this same array, so the browser becomes the real library.
    demoSongs.splice(0, demoSongs.length, ...songs);
    return songs;
  } catch {
    return [];
  }
}

export function installLibraryBridge() {
  if (state.installed) return;
  state.installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isCiderRunV3 = url.includes("http://localhost:10767/api/v1/amapi/run-v3");

    if (isCiderRunV3 && init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        const path = typeof body?.path === "string" ? body.path : "";

        if (path.includes("/v1/catalog/") && path.includes("/search?")) {
          const parsed = new URL(path, "https://music.apple.com");
          const term = parsed.searchParams.get("term") || "";
          const limit = parsed.searchParams.get("limit") || "12";
          const libraryPath = `/v1/me/library/search?term=${encodeURIComponent(term)}&types=songs&limit=${encodeURIComponent(limit)}`;
          const response = await originalFetch(input, {
            ...init,
            body: JSON.stringify({ ...body, path: libraryPath }),
          });

          if (!response.ok) return response;

          try {
            const json = await response.clone().json();
            const rows = extractRows(json);
            const wrapped = {
              data: {
                results: {
                  songs: { data: rows },
                },
              },
            };
            return new Response(JSON.stringify(wrapped), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch {
            return response;
          }
        }
      } catch {
        // Keep the original request untouched if the body isn't our karaoke request.
      }
    }

    if (url.includes("http://localhost:10767/api/v1/playback/play-item") && init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        const mapped = state.songs.get(String(body?.id));
        if (mapped?.catalogId) {
          return originalFetch(input, {
            ...init,
            body: JSON.stringify({ ...body, id: mapped.catalogId }),
          });
        }
      } catch {
        // Fall through to the original playback request.
      }
    }

    return originalFetch(input, init);
  };
}
