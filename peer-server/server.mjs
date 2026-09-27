import { WebSocketServer } from "ws";
import http from "node:http";
import crypto from "node:crypto";

const PORT=Number(process.env.PORT||8787);
const server=http.createServer((req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,service:"cider-karaoke-peer",rooms:rooms.size}));});
const wss=new WebSocketServer({server});
const rooms=new Map();

function code(){let c="";do{c=String(1000+crypto.randomInt(9000))}while(rooms.has(c));return c}
function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg))}
function leave(ws){
  const room=ws.room;
  if(!room)return;
  room.clients.delete(ws);
  for(const peer of room.clients)send(peer,{type:"peer-left",peerId:ws.clientId});
  if(!room.clients.size)rooms.delete(room.code);
  ws.room=null;
}

wss.on("connection",(ws)=>{
  ws.clientId=null;ws.room=null;
  ws.on("message",(raw)=>{
    let msg;try{msg=JSON.parse(String(raw))}catch{return}
    if(msg.type==="hello"){
      ws.clientId=String(msg.clientId||crypto.randomUUID());
      if(msg.role==="host"){
        const roomCode=String(msg.code||code());
        const room=rooms.get(roomCode)||{code:roomCode,host:ws,clients:new Set()};
        room.host=ws;room.clients.add(ws);rooms.set(roomCode,room);ws.room=room;
        send(ws,{type:"room-created",code:room.code});
      }
      return;
    }
    if(msg.type==="join"){
      const room=rooms.get(String(msg.code||""));
      if(!room){send(ws,{type:"room-error",message:"Room not found"});return}
      ws.clientId=ws.clientId||crypto.randomUUID();ws.room=room;room.clients.add(ws);
      send(ws,{type:"join-accepted",hostId:room.host?.clientId||""});
      for(const peer of room.clients)if(peer!==ws)send(peer,{type:"peer-joined",peerId:ws.clientId});
      return;
    }
    if(["webrtc-offer","webrtc-answer","webrtc-ice"].includes(msg.type)){
      const room=ws.room;if(!room)return;
      const target=Array.from(room.clients).find(p=>p.clientId===String(msg.peerId||""));
      if(target)send(target,{...msg,peerId:ws.clientId});
      return;
    }
    if(msg.type==="room-state"){
      const room=ws.room;if(!room)return;
      for(const peer of room.clients)if(peer!==ws)send(peer,{type:"room-state",state:msg.state});
      return;
    }
    if(msg.type==="leave")leave(ws);
  });
  ws.on("close",()=>leave(ws));
});
server.listen(PORT,()=>console.log("Cider Karaoke peer server listening on "+PORT));
