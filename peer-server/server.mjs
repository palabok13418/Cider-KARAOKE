import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map();
const clients = new Map();

function makeCode() {
  let code = '';
  do code = String(1000 + crypto.randomInt(9000));
  while (rooms.has(code));
  return code;
}
function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}
function leave(ws) {
  const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
  if (room) {
    room.clients.delete(ws.clientId);
    for (const peer of room.clients.values()) send(peer.ws, { type: 'peer-left', peerId: ws.clientId });
    if (room.hostId === ws.clientId) {
      const next = room.clients.values().next().value;
      room.hostId = next?.ws ? next.ws.clientId : null;
      if (next?.ws) send(next.ws, { type: 'host-promoted', code: room.code });
    }
    if (!room.clients.size) rooms.delete(room.code);
  }
  if (ws.clientId) clients.delete(ws.clientId);
  ws.roomCode = '';
}
function ensureRoomForHost(ws, requestedCode = '') {
  const code = requestedCode && /^\d{4}$/.test(requestedCode) && !rooms.has(requestedCode) ? requestedCode : makeCode();
  const room = { code, hostId: ws.clientId, clients: new Map() };
  room.clients.set(ws.clientId, { ws, role: 'host' });
  rooms.set(code, room);
  ws.roomCode = code;
  return room;
}

const httpServer = http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.url === '/' || req.url === '/healthz' || req.url === '/health') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: true, service: 'cider-karaoke-peer', rooms: rooms.size, clients: clients.size }));
  }
  res.statusCode = 404;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', (ws) => {
  ws.clientId = '';
  ws.roomCode = '';
  ws.role = '';

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'hello') {
      ws.clientId = String(msg.clientId || crypto.randomUUID()).slice(0, 64);
      ws.role = msg.role === 'mic' ? 'mic' : 'host';
      clients.set(ws.clientId, ws);
      if (ws.role === 'host') {
        const room = ensureRoomForHost(ws, String(msg.code || ''));
        send(ws, { type: 'room-created', code: room.code });
      }
      return;
    }

    if (msg.type === 'join-room' || msg.type === 'join') {
      const room = rooms.get(String(msg.code || ''));
      if (!room) return send(ws, { type: 'room-error', message: 'Room not found' });
      if (!ws.clientId) {
        ws.clientId = String(msg.clientId || crypto.randomUUID()).slice(0, 64);
        clients.set(ws.clientId, ws);
      }
      if (room.clients.has(ws.clientId)) return send(ws, { type: 'join-accepted', hostId: room.hostId, code: room.code });
      room.clients.set(ws.clientId, { ws, role: 'mic' });
      ws.roomCode = room.code;
      send(ws, { type: 'join-accepted', hostId: room.hostId, code: room.code });
      for (const client of room.clients.values()) {
        if (client.ws !== ws) send(client.ws, { type: 'peer-joined', peerId: ws.clientId });
      }
      return;
    }

    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;

    if (msg.type === 'webrtc-offer' || msg.type === 'webrtc-answer' || msg.type === 'webrtc-ice') {
      const target = room.clients.get(String(msg.peerId || ''));
      if (target?.ws) send(target.ws, { ...msg, peerId: ws.clientId });
      return;
    }

    if (msg.type === 'room-state' || msg.type === 'room-song') {
      for (const client of room.clients.values()) {
        if (client.ws !== ws) send(client.ws, { ...msg, from: ws.clientId });
      }
      return;
    }

    if (msg.type === 'leave') leave(ws);
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000).unref();

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

httpServer.listen(PORT, HOST, () => {
  console.log('Cider Karaoke peer server listening on ' + HOST + ':' + PORT + '/ws');
});
