type ControlState = {
  title: string;
  artist: string;
  artwork: string;
  playing: boolean;
};

type ScreenLike = {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
};

declare global {
  interface Window {
    getScreenDetails?: () => Promise<{ screens: ScreenLike[]; currentScreen: ScreenLike }>;
  }
}

const POPUP_NAME = "cider-karaoke-player";

function popupMarkup() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Karaoke Player</title>
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090a0f;color:#fff}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:linear-gradient(135deg,#0b0c11,#151823);display:flex;align-items:center;justify-content:center}
.player{width:min(720px,100vw);padding:22px 26px;border:1px solid rgba(255,255,255,.12);background:rgba(16,18,25,.94);box-shadow:0 18px 60px rgba(0,0,0,.38)}
.meta{display:flex;align-items:center;gap:16px;min-width:0}
.art{width:68px;height:68px;border-radius:12px;object-fit:cover;background:#222;flex:none}
.copy{min-width:0;flex:1}
.eyebrow{font-size:10px;letter-spacing:.16em;font-weight:800;color:rgba(255,255,255,.5);text-transform:uppercase}
.title{font-size:20px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:6px}
.artist{font-size:12px;color:rgba(255,255,255,.58);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.controls{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:22px}
button{border:0;cursor:pointer;color:#fff;background:rgba(255,255,255,.08);width:46px;height:46px;border-radius:50%;font-size:18px}
button.main{width:58px;height:58px;background:#fff;color:#0b0c11;font-size:22px}
button:hover{transform:translateY(-1px);background:rgba(255,255,255,.14)}
button.main:hover{background:#fff}
.note{text-align:center;color:rgba(255,255,255,.38);font-size:10px;letter-spacing:.08em;margin-top:14px}
</style>
</head>
<body>
<section class="player">
  <div class="meta">
    <img id="art" class="art" alt="">
    <div class="copy">
      <div class="eyebrow">PLAYER CONTROLS</div>
      <div id="title" class="title">Ready</div>
      <div id="artist" class="artist">Waiting for the karaoke host</div>
    </div>
  </div>
  <div class="controls">
    <button id="prev" title="Previous">⏮</button>
    <button id="toggle" class="main" title="Play / pause">▶</button>
    <button id="next" title="Next">⏭</button>
  </div>
  <div class="note">Playback controls • Karaoke display is on the other window</div>
</section>
<script>
const title=document.getElementById("title");
const artist=document.getElementById("artist");
const art=document.getElementById("art");
const toggle=document.getElementById("toggle");
function send(type){window.opener?.postMessage({source:"cider-karaoke-player",type},"*")}
document.getElementById("prev").onclick=()=>send("previous");
document.getElementById("next").onclick=()=>send("next");
toggle.onclick=()=>send("toggle");
window.addEventListener("message",(event)=>{
  if(!event.data||event.data.source!=="cider-karaoke-host")return;
  const state=event.data.state||{};
  title.textContent=state.title||"Ready";
  artist.textContent=state.artist||"Waiting for the karaoke host";
  art.src=state.artwork||"";
  art.style.visibility=state.artwork?"visible":"hidden";
  toggle.textContent=state.playing?"❚❚":"▶";
});
</script>
</body>
</html>`;
}

async function secondaryDisplayPosition(width: number, height: number) {
  let left = window.screenX + window.outerWidth + 24;
  let top = window.screenY;

  try {
    if (window.getScreenDetails) {
      const details = await window.getScreenDetails();
      const target = details.screens.find((screen) => screen !== details.currentScreen);
      if (target) {
        left = target.availLeft + Math.max(0, Math.round((target.availWidth - width) / 2));
        top = target.availTop + Math.max(0, Math.round((target.availHeight - height) / 2));
      }
    }
  } catch {}

  return { left, top };
}

let controlWindow: Window | null = null;

export async function openPlayerControls(
  initial: ControlState,
  onCommand: (type: "ready" | "toggle" | "previous" | "next") => void,
) {
  const width = 720;
  const height = 220;
  const fallbackPosition = {
    left: window.screenX + window.outerWidth + 24,
    top: window.screenY,
  };

  if (controlWindow && !controlWindow.closed) {
    controlWindow.focus();
  } else {
    controlWindow = window.open(
      "",
      POPUP_NAME,
      `popup=yes,width=${width},height=${height},left=${fallbackPosition.left},top=${fallbackPosition.top}`,
    );
  }

  if (!controlWindow) {
    throw new Error("Cider blocked the separate Karaoke Player window.");
  }

  try {
    const position = await secondaryDisplayPosition(width, height);
    controlWindow.moveTo(position.left, position.top);
  } catch {}

  controlWindow.document.open();
  controlWindow.document.write(popupMarkup());
  controlWindow.document.close();
  controlWindow.focus();

  const receive = (event: MessageEvent) => {
    if (event.source !== controlWindow) return;
    if (!event.data || event.data.source !== "cider-karaoke-player") return;
    onCommand(event.data.type);
  };

  const update = (state: ControlState) => {
    if (!controlWindow || controlWindow.closed) return;
    controlWindow.postMessage({source:"cider-karaoke-host",state},"*");
  };

  window.addEventListener("message", receive);
  update(initial);

  return {
    update,
    close() {
      window.removeEventListener("message", receive);
      if (controlWindow && !controlWindow.closed) controlWindow.close();
      controlWindow = null;
    },
  };
}

export function closePlayerControls() {
  if (controlWindow && !controlWindow.closed) controlWindow.close();
  controlWindow = null;
}
