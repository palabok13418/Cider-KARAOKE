import http from "node:http";
import { WebSocketServer } from "ws";
const port=Number(process.env.PORT||8787), host=process.env.HOST||"0.0.0.0";
const rooms=new Map();
function send(ws,m){if(ws.readyState===ws.OPEN)ws.send(JSON.stringify(m));}
function leave(ws){const code=ws.room;if(!code)return;const peers=rooms.get(code);if(!peers)return;peers.delete(ws);if(ws.clientId)for(const p of peers)send(p,{type:"peer-left",peerId:ws.clientId});if(!peers.size)rooms.delete(code);ws.room="";}
function join(ws,code){code=String(code||"").trim().slice(0,32);if(!code)return false;leave(ws);let peers=rooms.get(code);if(!peers){peers=new Set();rooms.set(code,peers);}ws.room=code;peers.add(ws);return true;}
function fanout(ws,m){const peers=rooms.get(ws.room);if(!peers)return;for(const p of peers)if(p!==ws)send(p,m);}
const server=http.createServer((req,res)=>{res.setHeader("access-control-allow-origin","*");res.setHeader("content-type","application/json; charset=utf-8");if(req.url==="/"||req.url==="/health")return void res.end(JSON.stringify({ok:true,service:"cider-karaoke-peer",rooms:rooms.size}));res.statusCode=404;res.end(JSON.stringify({ok:false,error:"NOT_FOUND"}));});
const wss=new WebSocketServer({server,path:"/ws"});
wss.on("connection",ws=>{ws.room="";ws.clientId="";ws.on("message",raw=>{let m;try{m=JSON.parse(String(raw))}catch{return}if(!m||typeof m.type!=="string")return;if(m.type==="hello"){ws.clientId=String(m.clientId||"").slice(0,64);return}if(m.type==="room-created"){if(join(ws,m.code))fanout(ws,m);return}if(m.type==="join-room"){if(!join(ws,m.code))return send(ws,{type:"room-error",message:"Invalid room code"});const id=ws.clientId||String(m.clientId||"").slice(0,64);ws.clientId=id;const peers=rooms.get(ws.room);if(peers)for(const p of peers)if(p!==ws)send(p,{type:"peer-joined",peerId:id});return send(ws,{type:"join-accepted",hostId:""});}if(ws.room)fanout(ws,m);});ws.on("close",()=>leave(ws));ws.on("error",()=>leave(ws));});
server.listen(port,host,()=>console.log("Cider Karaoke peer server listening on "+host+":"+port+"/ws"));
