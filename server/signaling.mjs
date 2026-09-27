import http from "node:http";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const HEARTBEAT_MS = 25000;

function send(ws, message) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(message)); } catch {}
}
function roomFor(code) { return rooms.get(String(code || "").trim()); }
function touch(room) { if (room) room.updatedAt = Date.now(); }
function cleanupRooms() { const now = Date.now(); for (const [code, room] of rooms) { if (now - Number(room.updatedAt || 0) > ROOM_TTL_MS) { for (const peer of room.clients.values()) send(peer.ws, {type:"room-error",message:"Karaoke room expired."}); rooms.delete(code); } } }
setInterval(cleanupRooms, 60_000).unref();
function removeClient(client) {
  const room = client.roomCode ? roomFor(client.roomCode) : null;
  if (!room) return;
  room.clients.delete(client.id);
  if (room.hostId === client.id) {
    for (const peer of room.clients.values()) send(peer.ws, {type:"room-error",message:"The karaoke host disconnected."});
    rooms.delete(client.roomCode);
    return;
  }
  const host = room.clients.get(room.hostId);
  if (host) send(host.ws, {type:"peer-left",peerId:client.id});
  for (const peer of room.clients.values()) {
    if (peer.id !== client.id && peer.id !== room.hostId) send(peer.ws, {type:"peer-left",peerId:client.id});
  }
}

const server = http.createServer((req,res)=>{
  res.writeHead(200,{"content-type":"application/json","access-control-allow-origin":"*"});
  res.end(JSON.stringify({ok:true,service:"cider-karaoke-peer-server",rooms:rooms.size}));
});
const wss = new WebSocketServer({server});
wss.on("connection",(ws)=>{
  const client={id:randomUUID().slice(0,8),role:"mic",roomCode:"",ws};
  ws.on("message",(raw)=>{
    let msg; try { msg=JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "hello") {
      client.id=String(msg.clientId || client.id).slice(0,64);
      client.role=msg.role === "host" ? "host" : "mic";
      return;
    }
    if (msg.type === "room-created" && client.role === "host") {
      const code=String(msg.code||"").trim();
      if (!/^\d{4}$/.test(code)) return send(ws,{type:"room-error",message:"Invalid room code."});
      const existing=roomFor(code);
      if (existing && existing.hostId !== client.id) return send(ws,{type:"room-error",message:"That room code is already in use."});
      const room=existing || {hostId:client.id,clients:new Map(),updatedAt:Date.now()};
      touch(room);
      room.clients.set(client.id,client);
      rooms.set(code,room);
      client.roomCode=code;
      return;
    }
    if (msg.type === "join-room" && client.role === "mic") {
      const code=String(msg.code||"").trim();
      const room=roomFor(code);
      if (!room) return send(ws,{type:"room-error",message:"Karaoke room not found."});
      client.roomCode=code;
      room.clients.set(client.id,client);
      const host=room.clients.get(room.hostId);
      send(ws,{type:"join-accepted",hostId:room.hostId});
      if (host) send(host.ws,{type:"peer-joined",peerId:client.id});
      return;
    }
    if (/^webrtc-/.test(String(msg.type||""))) {
      touch(client.roomCode ? roomFor(client.roomCode) : null);
      const room=client.roomCode ? roomFor(client.roomCode) : null;
      if (!room) return;
      const target=room.clients.get(String(msg.peerId||""));
      if (target) send(target.ws,{...msg,peerId:client.id});
      return;
    }
    if (msg.type === "peer-joined" && client.role === "host") {
      const room=client.roomCode ? roomFor(client.roomCode) : null;
      const target=room?.clients.get(String(msg.peerId||""));
      if (target) send(target.ws,msg);
    }
  });
  ws.on("close",()=>removeClient(client));
});
setInterval(() => { for (const room of rooms.values()) for (const client of room.clients.values()) { try { if (client.ws.readyState === 1) client.ws.ping(); } catch {} } }, HEARTBEAT_MS).unref();
server.listen(port,host,()=>console.log("Cider KARAOKE peer server listening on "+host+":"+port));
