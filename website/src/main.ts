import { createApp, h, onBeforeUnmount, ref } from "vue";
import { clientId, enhanceLyrics, fetchLyricsForSong, hostCode, type QueueSong, type Song } from "../../src/karaoke";
import "../styles.css";

const API = String(import.meta.env.VITE_MUS_API_BASE || "https://mus-api.vercel.app").replace(/\/+$/,"");
const SIGNAL = String(import.meta.env.VITE_SIGNALING_URL || "").trim();

function normalize(row:any):Song {
  const a=row?.attributes||{};
  const id=String(row?.id||a?.playParams?.id||Math.random().toString(36).slice(2));
  const artwork=String(a?.artwork?.url||"").replace(/\{w\}/g,"900").replace(/\{h\}/g,"900").replace(/\{f\}/g,"jpg");
  return {
    id,
    catalogId:String(a?.playParams?.id||row?.id||id),
    title:String(a?.name||"Untitled"),
    artist:String(a?.artistName||"Unknown artist"),
    album:String(a?.albumName||""),
    artwork,
    animatedArtwork:a?.editorialVideo?.motionSquareVideo1x1?.video||a?.editorialVideo?.motionWideVideo21x9?.video,
    language:/[\u3040-\u30ff]/.test(a?.name||"")?"ja":/[\uac00-\ud7af]/.test(a?.name||"")?"ko":/[\u3400-\u9fff]/.test(a?.name||"")?"zh":"en",
    sing:a?.isVocalAttenuationAllowed!==false,
    playHref:a?.url
  };
}

const Root={
  setup(){
    const connected=ref(false),busy=ref(false),query=ref(""),results=ref<Song[]>([]);
    const queue=ref<QueueSong[]>([]),current=ref<Song|null>(null);
    const lyrics=ref<any[]>([]),lyricsBusy=ref(false),live=ref(false),status=ref("Connect Apple Music to begin.");
    const code=ref(hostCode()); const me=clientId();
    let ws:WebSocket|null=null;

    async function connectApple(){
      busy.value=true;
      try{
        if(!(window as any).MusicKit){
          await new Promise<void>((resolve,reject)=>{
            const s=document.createElement("script"); s.src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"; s.async=true;
            s.onload=()=>resolve(); s.onerror=()=>reject(new Error("MusicKit failed to load")); document.head.appendChild(s);
          });
        }
        const cfg=await fetch(API+"/api/apple/config").then(r=>r.json());
        if(!cfg?.developerToken)throw new Error(cfg?.error||"Mus-API Apple Music is not configured.");
        await (window as any).MusicKit.configure({developerToken:cfg.developerToken,app:{name:"Cider Karaoke Web",build:"0.1.0"}});
        const music=(window as any).MusicKit.getInstance();
        await music.authorize();
        connected.value=true; status.value="Apple Music connected.";
      }catch(e:any){status.value=e?.message||"Apple Music connection failed."}
      finally{busy.value=false}
    }

    async function searchSongs(){
      const q=query.value.trim(); if(!q)return;
      busy.value=true;
      try{
        const data=await fetch(API+"/api/apple/search?q="+encodeURIComponent(q)+"&types=songs&limit=20").then(r=>r.json());
        const rows=Array.isArray(data?.results?.songs?.data)?data.results.songs.data:[];
        results.value=rows.map(normalize);
        if(!rows.length)status.value="No Apple Music songs found.";
      }catch{status.value="Apple Music search failed.";results.value=[]}
      finally{busy.value=false}
    }

    function addSong(song:Song){
      if(queue.value.some(q=>q.id===song.id))return;
      queue.value.push({...song,queueId:Math.random().toString(36).slice(2)});
      if(!current.value)current.value=song;
      status.value=song.title+" added to queue.";
    }

    async function selectSong(song:Song){
      current.value=song; lyricsBusy.value=true;
      try{const r=await fetchLyricsForSong(song);lyrics.value=await enhanceLyrics(r.lines)}catch{lyrics.value=[]}
      finally{lyricsBusy.value=false}
    }

    function startRoom(){
      if(!current.value)return;
      live.value=true;
      if(SIGNAL&&!ws){
        ws=new WebSocket(SIGNAL);
        ws.onopen=()=>ws?.send(JSON.stringify({type:"hello",role:"host",clientId:me}));
        ws.onmessage=(e)=>{try{const m=JSON.parse(e.data);if(m.type==="room-created"&&m.code)code.value=m.code;if(m.type==="peer-joined")status.value="A singer joined room "+code.value}catch{}};
        ws.onerror=()=>{status.value="Peer server unavailable; room runs locally until the server is configured."};
      }
      status.value="Room "+code.value+" is live.";
    }

    onBeforeUnmount(()=>ws?.close());

    return()=>h("div",{class:"kw-app"},[
      h("header",{class:"kw-header"},[
        h("div",{class:"kw-brand"},[h("span",{class:"eyebrow"},"CIDER KARAOKE"),h("strong","Web Host")]),
        h("div",{class:"kw-room"},[h("small","ROOM"),h("b",code.value)]),
        h("button",{class:"kw-button",onClick:connectApple,disabled:busy.value},connected.value?"Apple Music Connected":busy.value?"Connecting…":"Connect Apple Music")
      ]),
      h("main",{class:"kw-shell"},[
        h("section",{class:"kw-browser"},[
          h("div",{class:"kw-hero"},[h("span",{class:"eyebrow"},"KARAOKE STUDIO"),h("h1","Your songs. Your room. Your stage."),h("p",status.value)]),
          h("div",{class:"kw-search"},[
            h("input",{value:query.value,placeholder:"Search Apple Music…",onInput:(e:any)=>query.value=e.target.value,onKeyup:(e:any)=>{if(e.key==="Enter")searchSongs()}}),
            h("button",{class:"kw-button",onClick:searchSongs,disabled:busy.value},"Search")
          ]),
          h("div",{class:"kw-results"},results.value.map(song=>h("button",{class:"kw-song",onClick:()=>addSong(song)},[
            h("img",{src:song.artwork,alt:""}),h("span",{class:"copy"},[h("b",song.title),h("small",song.artist)]),h("strong","+")
          ])))
        ]),
        h("aside",{class:"kw-queue"},[
          h("div",{class:"kw-queue-head"},[h("div",[h("span",{class:"eyebrow"},"UP NEXT"),h("h2","Queue")]),h("span",{class:"kw-count"},String(queue.value.length))]),
          ...queue.value.map(song=>h("button",{class:["kw-queue-song",current.value?.id===song.id?"active":""],onClick:()=>selectSong(song)},[
            h("img",{src:song.artwork,alt:""}),h("span",{class:"copy"},[h("b",song.title),h("small",song.artist)])
          ])),
          h("button",{class:"kw-start",disabled:!current.value,onClick:startRoom},live.value?"Room Live":"Start Karaoke")
        ])
      ]),
      current.value?h("section",{class:"kw-stage"},[
        h("div",{class:"kw-backdrop",style:{backgroundImage:"url("+current.value.artwork+")"}}),
        h("div",{class:"kw-stage-cover"},[h("img",{src:current.value.artwork,alt:""}),h("strong",current.value.title),h("span",current.value.artist)]),
        h("div",{class:"kw-lyrics"},lyricsBusy.value?h("div",{class:"kw-loading"},"Loading lyrics…"):lyrics.value.length?lyrics.value.slice(0,8).map((line:any,i:number)=>h("div",{class:["kw-lyric",i===0?"active":""]},[
          h("div",line.original),line.pronunciation?h("small",line.pronunciation):null,
          line.translation&&line.language!=="en"?h("small",line.translation):null
        ])):h("div",{class:"kw-loading"},"No timed lyrics available"))
      ]):null
    ]);
  }
};
createApp(Root).mount("#app");
