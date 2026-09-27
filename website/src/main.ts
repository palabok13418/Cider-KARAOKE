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

function esc(s:string){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]||m))}

const Root={
  setup(){
    const connected=ref(false),busy=ref(false),query=ref(""),results=ref<Song[]>([]);
    const queue=ref<QueueSong[]>([]),current=ref<Song|null>(null),lyrics=ref<any[]>([]);
    const lyricsBusy=ref(false),live=ref(false),status=ref("Connect Apple Music to begin.");
    const code=ref(hostCode()),me=clientId(),isHost=ref(false),micConnected=ref(false);
    const pendingRoomSong=ref<Song|null>(null);
    let ws:WebSocket|null=null;
    let music:any=null;
    const peers=new Map<string,RTCPeerConnection>();
    let micStream:MediaStream|null=null;
    let lyricRaf=0;

    async function connectApple(){
      busy.value=true;
      try{
        if(!(window as any).MusicKit){
          await new Promise<void>((resolve,reject)=>{
            const s=document.createElement("script"); s.src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"; s.async=true;
            s.onload=()=>resolve(); s.onerror=()=>reject(new Error("MusicKit failed to load")); document.head.appendChild(s);
          });
        }
        const cfg=await fetch(API+"/api/apple/config",{cache:"no-store"}).then(r=>r.json());
        if(!cfg?.developerToken)throw new Error(cfg?.error||"Mus-API Apple Music is not configured.");
        await (window as any).MusicKit.configure({developerToken:cfg.developerToken,app:{name:"Cider Karaoke Web",build:"0.1.0"}});
        music=(window as any).MusicKit.getInstance();
        const authorized=await music.authorize();
        const musicUserToken=String(authorized||music?.musicUserToken||music?.userToken||"").trim();
        if(musicUserToken){
          try{sessionStorage.setItem("musaudio_music_user_token_v1",musicUserToken)}catch{}
          try{
            await fetch(API+"/api/apple/session",{
              method:"POST",
              headers:{"content-type":"application/json",accept:"application/json"},
              body:JSON.stringify({
                developerToken:cfg.developerToken,
                musicUserToken,
                storefront:String(music?.storefrontId||"us").trim()||"us"
              })
            });
          }catch{}
        }
        connected.value=true;
        status.value="Apple Music connected.";
      }catch(e:any){status.value=e?.message||"Apple Music connection failed."}
      finally{busy.value=false}
    }

    async function searchSongs(){
      const q=query.value.trim();if(!q)return;
      busy.value=true;
      try{
        const payload=await fetch(API+"/api/apple/search?q="+encodeURIComponent(q)+"&types=songs&limit=24",{cache:"no-store"}).then(r=>r.json());
        const rows=Array.isArray(payload?.results?.songs?.data)?payload.results.songs.data:[];
        results.value=rows.map((row:any)=>({
          id:String(row.id),
          catalogId:String(row.attributes?.playParams?.id||row.id),
          title:String(row.attributes?.name||"Untitled"),
          artist:String(row.attributes?.artistName||"Unknown Artist"),
          album:String(row.attributes?.albumName||""),
          artwork:String(row.attributes?.artwork?.url||"").replace(/\{w\}/g,"640").replace(/\{h\}/g,"640").replace(/\{f\}/g,"jpg"),
          language:"en",sing:row.attributes?.isVocalAttenuationAllowed!==false,playHref:row.attributes?.url
        }));
        status.value=results.value.length?results.value.length+" Apple Music songs found.":"No Apple Music songs found.";
      }catch{status.value="Apple Music search failed through Mus-API.";results.value=[]}
      finally{busy.value=false}
    }

    function addSong(song:Song){
      if(queue.value.some(q=>q.id===song.id))return;
      queue.value.push({...song,queueId:Math.random().toString(36).slice(2)});
      if(!current.value)current.value=song;
      status.value=song.title+" added to queue.";
    }

    async function loadLyrics(song:Song){
      cancelAnimationFrame(lyricRaf);lyrics.value=[];lyricsBusy.value=true;
      try{
        const j=await fetch(API+"/api/apple/lyrics-ttml?id="+encodeURIComponent(song.catalogId||song.id)+"&format=json",{cache:"no-store"}).then(r=>r.json());
        lyrics.value=parseTtml(String(j?.ttml||j?.data?.ttml||""));
      }catch{lyrics.value=[]}
      finally{lyricsBusy.value=false}
      syncLyrics();
    }

    function parseTime(v:string|null|undefined){
      const s=String(v||"").trim();if(!s)return NaN;
      if(s.endsWith("s"))return Number(s.slice(0,-1))||0;
      const parts=s.split(":").map(Number);if(parts.some(Number.isNaN))return NaN;
      return parts.reduce((a,b)=>a*60+b,0);
    }

    function parseTtml(xml:string){
      if(!xml)return [];
      try{
        const doc=new DOMParser().parseFromString(xml,"application/xml");
        return [...doc.getElementsByTagName("*")].filter(n=>n.localName==="p").map((p:any,i:number)=>{
          const spans=[...p.getElementsByTagName("*")].filter((n:any)=>n.localName==="span").map((sp:any)=>({
            text:(sp.textContent||"").replace(/\s+/g," ").trim(),
            begin:parseTime(sp.getAttribute("begin")),
            end:parseTime(sp.getAttribute("end"))
          })).filter((x:any)=>x.text);
          return {
            id:String(i),original:(p.textContent||"").replace(/\s+/g," ").trim(),
            begin:parseTime(p.getAttribute("begin")),end:parseTime(p.getAttribute("end"))||parseTime(p.getAttribute("begin"))+4,
            spans
          };
        }).filter((x:any)=>x.original&&Number.isFinite(x.begin));
      }catch{return []}
    }

    function playbackTime(){
      const t=Number(music?.currentPlaybackTime);
      if(Number.isFinite(t))return t;
      const audio=document.querySelector("audio") as HTMLAudioElement|null;
      return Number(audio?.currentTime||0);
    }

    function syncLyrics(){
      cancelAnimationFrame(lyricRaf);
      const tick=()=>{
        const t=playbackTime();
        const nodes=[...document.querySelectorAll<HTMLElement>(".kw-lyric")];
        let active=-1;
        lyrics.value.forEach((l:any,i:number)=>{if(t>=l.begin&&t<l.end)active=i});
        nodes.forEach((node,i)=>{
          node.classList.toggle("active",i===active);
          node.classList.toggle("past",i<active);
          const words=lyrics.value[i]?.spans||[];
          node.querySelectorAll<HTMLElement>(".lyric-letter").forEach(el=>{el.style.setProperty("--p","0")});
          if(i===active&&words.length){
            words.forEach((word:any)=>{
              const local=Math.max(0,Math.min(1,(t-word.begin)/Math.max(.08,(word.end||word.begin+.4)-word.begin)));
              const letters=node.querySelectorAll<HTMLElement>('[data-word="'+CSS.escape(word.text)+'"] .lyric-letter');
              letters.forEach((el,j)=>el.style.setProperty("--p",String(Math.max(0,Math.min(1,local-j/Math.max(1,word.text.length))))));
            });
          }
        });
        lyricRaf=requestAnimationFrame(tick);
      };
      lyricRaf=requestAnimationFrame(tick);
    }

    function renderLyricLine(line:any){
      if(!line.spans.length)return `<div class="lyric-main">${esc(line.original)}</div>`;
      return line.spans.map((sp:any)=>`<span class="lyric-word" data-word="${esc(sp.text)}">${[...sp.text].map((ch:string)=>`<span class="lyric-letter" style="--p:0">${ch===" "?"&nbsp;":esc(ch)}</span>`).join("")}</span>`).join(" ");
    }

    async function playSong(song:Song,announce=true){
      current.value=song;
      await loadLyrics(song);
      try{
        if(!music)await connectApple();
        const id=String(song.catalogId||song.id);
        if(music?.setQueue)await music.setQueue({song:id});
        else if(music?.queue?.push)await music.queue.push({id});
        await music?.play?.();
        status.value="Now singing: "+song.title;
      }catch(e:any){status.value=e?.message||"Apple Music playback failed."}
      if(announce){
        if(ws?.readyState===WebSocket.OPEN) broadcast({type:"room-song",song} as Signal);
        else if(isHost.value) pendingRoomSong.value=song;
      }
      live.value=true;
    }

    async function startRoom(){
      if(!current.value){status.value="Add and select a song first.";return}
      if(!connected.value)await connectApple();
      isHost.value=true;
      connectTransport("host");
      live.value=true;
      await playSong(current.value);
    }

    async function joinRoom(withMic=false){
      const value=(document.getElementById("roomCode") as HTMLInputElement)?.value.trim();
      if(!/^\d{4}$/.test(value)){status.value="Enter a four-digit host code.";return}
      if(withMic){
        try{micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});micConnected.value=true}
        catch{status.value="Microphone permission was denied.";return}
      }
      code.value=value;
      connectTransport("mic",value);
    }

    function connectTransport(role:"host"|"mic",joinCode?:string){
      if(!SIGNAL){status.value="Peer server is not configured.";return}
      ws?.close();
      ws=new WebSocket(SIGNAL);
      ws.onopen=()=>{
        ws!.send(JSON.stringify({type:"hello",role,clientId:me} as Signal));
        if(role==="host"){
          ws!.send(JSON.stringify({type:"room-created",code:code.value} as Signal));
        }else if(joinCode){
          ws!.send(JSON.stringify({type:"join-room",code:joinCode,clientId:me} as Signal));
        }
      };
      ws.onclose=()=>{status.value="Peer server disconnected.";};
      ws.onerror=()=>{status.value="Peer server connection failed."};
      ws.onmessage=e=>{try{handleSignal(JSON.parse(e.data))}catch{}};
    }

    function broadcast(message:Signal){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message))}

    async function makeOffer(peerId:string){
      if(!isHost.value)return;
      const pc=new RTCPeerConnection({iceServers:[{urls:["stun:stun.l.google.com:19302"]}]});
      peers.set(peerId,pc);
      const transceiver=pc.addTransceiver("audio",{direction:micStream?.getAudioTracks().length?"sendrecv":"recvonly"});
      if(micStream?.getAudioTracks().length) await transceiver.sender.replaceTrack(micStream.getAudioTracks()[0]);
      pc.ontrack=e=>{
        const existing=document.getElementById("remote-mic-"+peerId) as HTMLAudioElement|null;
        if(existing) existing.srcObject=e.streams[0];
        else { const a=document.createElement("audio"); a.autoplay=true; a.srcObject=e.streams[0]; a.id="remote-mic-"+peerId; document.body.appendChild(a); }
      };
      pc.onicecandidate=e=>{if(e.candidate)broadcast({type:"webrtc-ice",peerId,candidate:e.candidate.toJSON()})};
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      broadcast({type:"webrtc-offer",peerId,sdp:offer});
    }

    async function acceptOffer(peerId:string,sdp:RTCSessionDescriptionInit){
      if(isHost.value)return;
      const pc=peers.get(peerId)||new RTCPeerConnection({iceServers:[{urls:["stun:stun.l.google.com:19302"]}]});
      peers.set(peerId,pc);
      if(micStream?.getAudioTracks().length) micStream.getTracks().forEach(t=>pc.addTrack(t,micStream!));
      pc.onicecandidate=e=>{if(e.candidate)broadcast({type:"webrtc-ice",peerId,candidate:e.candidate.toJSON()})};
      await pc.setRemoteDescription(sdp);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
      broadcast({type:"webrtc-answer",peerId,sdp:answer});
    }

    async function handleSignal(message:Signal){
      if(message.type==="room-created"){
        code.value=message.code;
        status.value="Room "+message.code+" is ready.";
        if(isHost.value&&pendingRoomSong.value){
          const song=pendingRoomSong.value;
          pendingRoomSong.value=null;
          broadcast({type:"room-song",song} as Signal);
        }
        return;
      }
      if(message.type==="join-accepted"){status.value="Joined room "+code.value;return}
      if(message.type==="peer-joined"){await makeOffer(message.peerId);return}
      if(message.type==="webrtc-offer"){await acceptOffer(message.peerId,message.sdp);return}
      if(message.type==="webrtc-answer"){const pc=peers.get(message.peerId);if(pc)await pc.setRemoteDescription(message.sdp);return}
      if(message.type==="webrtc-ice"){const pc=peers.get(message.peerId);if(pc&&message.candidate)await pc.addIceCandidate(message.candidate).catch(()=>{});return}
      if(message.type==="room-song"&&!isHost.value){const song=(message as any).song as Song;if(song){await playSong(song,false)}}
      if(message.type==="host-promoted"){status.value="Host promoted for room "+message.code}
      if(message.type==="room-error"){status.value=message.message}
    }

    onBeforeUnmount(()=>{cancelAnimationFrame(lyricRaf);ws?.close();peers.forEach(p=>p.close());micStream?.getTracks().forEach(t=>t.stop())});

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
          ...queue.value.map(song=>h("button",{class:["kw-queue-song",current.value?.id===song.id?"active":""],onClick:()=>playSong(song)},[
            h("img",{src:song.artwork,alt:""}),h("span",{class:"copy"},[h("b",song.title),h("small",song.artist)])
          ])),
          h("input",{id:"roomCode",class:"code",maxlength:4,inputmode:"numeric",placeholder:"HOST CODE"}),
          h("div",{class:"live-actions"},[
            h("button",{class:"kw-start",disabled:!current.value,onClick:startRoom},"Start Karaoke"),
            h("button",{class:"kw-button",onClick:()=>joinRoom(true)},"Join microphone")
          ])
        ])
      ]),
      current.value?h("section",{class:"kw-stage"},[
        h("div",{class:"kw-backdrop",style:{backgroundImage:"url("+current.value.artwork+")"}}),
        h("div",{class:"kw-stage-cover"},[current.value.animatedArtwork?h("video",{src:current.value.animatedArtwork,autoplay:true,muted:true,loop:true,playsInline:true}):h("img",{src:current.value.artwork,alt:""}),h("strong",current.value.title),h("span",current.value.artist)]),
        h("div",{class:"kw-lyrics"},
          lyricsBusy.value?h("div",{class:"kw-loading"},"Loading lyrics…"):
          lyrics.value.length?lyrics.value.map((line:any)=>h("div",{class:["kw-lyric"],innerHTML:'<div class="lyric-main">'+renderLyricLine(line)+'</div>'})):
          h("div",{class:"kw-loading"},"No timed lyrics available")
        )
      ]):null
    ]);
  }
};
createApp(Root).mount("#app");
