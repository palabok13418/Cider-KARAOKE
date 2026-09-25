import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({port});
const rooms = new Map();

const send = (socket,message) => {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
};

const randomCode = () => {
  let code;
  do code = String(Math.floor(1000 + Math.random() * 9000)); while (rooms.has(code));
  return code;
};

wss.on("connection",(socket)=>{
  socket.id = randomUUID();
  socket.room = null;
  socket.clientId = null;
  socket.role = null;

  socket.on("message",(buffer)=>{
    let message;
    try { message = JSON.parse(buffer.toString()); } catch { return; }

    if (message.type === "hello") {
      socket.clientId = message.clientId;
      socket.role = message.role;
      return;
    }

    if (message.type === "room-created") {
      const code = message.code && !rooms.has(message.code) ? message.code : randomCode();
      rooms.set(code,{host:socket,clients:new Map()});
      socket.room = code;
      send(socket,{type:"room-created",code});
      return;
    }

    if (message.type === "join-room") {
      const room = rooms.get(message.code);
      if (!room?.host) {
        send(socket,{type:"room-error",message:"That karaoke host code is not active."});
        return;
      }
      room.clients.set(message.clientId,socket);
      socket.room = message.code;
      socket.clientId = message.clientId;
      send(socket,{type:"join-accepted",hostId:room.host.id});
      send(room.host,{type:"peer-joined",peerId:message.clientId});
      return;
    }

    if (message.type === "webrtc-offer" || message.type === "webrtc-answer" || message.type === "webrtc-ice") {
      const room = rooms.get(socket.room);
      if (!room) return;
      if (room.host === socket) {
        const target = room.clients.get(message.peerId);
        if (target) send(target,{...message,from:socket.id});
      } else {
        send(room.host,{...message,from:socket.id});
      }
    }
  });

  socket.on("close",()=>{
    if (!socket.room) return;
    const room = rooms.get(socket.room);
    if (!room) return;

    if (room.host === socket) {
      for (const client of room.clients.values()) send(client,{type:"room-error",message:"The karaoke host ended the session."});
      rooms.delete(socket.room);
      return;
    }

    if (socket.clientId) {
      room.clients.delete(socket.clientId);
      send(room.host,{type:"peer-left",peerId:socket.clientId});
    }
  });
});

console.log("Cider KARAOKE signaling server on ws://localhost:" + port);
