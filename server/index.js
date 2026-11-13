// The Night Shift - game server. Serves the client and runs the rooms over WebSockets.
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const STARTED = new Date().toISOString();
export function startServer(port = 3000, opts = {}) {
  const rooms = new Map();
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ ok: true, upSeconds: Math.round(process.uptime()), started: STARTED, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0), memMB: Math.round(process.memoryUsage().rss / 1048576) })); }
    const base = url.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
    const file = path.normalize(path.join(base, url));
    if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  const wss = new WebSocketServer({ server });
  const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[(Math.random() * 24) | 0]).join(''); } while (rooms.has(c)); return c; };
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!ws.player) {
        if (m.t !== 'join') return;
        let code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        if (m.resume) { // reconnecting to a shift we were already in
          const room = rooms.get(code), p = room && room.players.get(+m.resume.id);
          if (!p || p.key !== m.resume.key) return ws.send(JSON.stringify({ t: 'err', gone: true, msg: room ? 'You were away too long and lost your place in that shift. Join the next one.' : 'That shift has ended. The server restarted or everyone left.' }));
          ws.player = p; ws.room = room; room.reattach(ws, p);
          return;
        }
        if (code && !rooms.has(code)) return ws.send(JSON.stringify({ t: 'err', msg: `No shift with code ${code}. Check the code or host a new one.` }));
        if (!code) { code = newCode(); rooms.set(code, new Room(code, { debug: opts.debug, grace: opts.grace, onEmpty: (r) => rooms.delete(r.code) })); }
        const room = rooms.get(code), r = room.add(ws, m.name);
        if (r.err) return ws.send(JSON.stringify({ t: 'err', msg: r.err }));
        ws.player = r.p; ws.room = room;
        return;
      }
      try { ws.room.onMessage(ws.player, m); } catch (e) { console.error('message error', e); }
    });
    ws.on('close', () => { if (ws.player && ws.player.ws === ws) ws.room.dropped(ws.player); });
    ws.on('error', () => {});
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  });
  // Protocol-level heartbeat: finds connections that died without closing, so their player can reconnect.
  const beat = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 15000);
  wss.on('close', () => clearInterval(beat));
  return new Promise((resolve) => server.listen(port, () => resolve({ server, wss, rooms, port: server.address().port, close: () => { for (const r of rooms.values()) r.stop(); wss.close(); server.close(); } })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Never let one bad event take every player's game down with it.
  process.on('uncaughtException', (e) => console.error('uncaught (server keeps running)', e));
  process.on('unhandledRejection', (e) => console.error('unhandled rejection (server keeps running)', e));
  const port = +process.env.PORT || 3000;
  startServer(port, { debug: process.env.NS_DEBUG === '1' }).then(() => {
    console.log('\n  THE NIGHT SHIFT - server running\n');
    console.log(`  On this computer:   http://localhost:${port}`);
    for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Same Wi-Fi / LAN:   http://${n.address}:${port}`);
    console.log('\n  For friends over the internet, see README.md ("Playing online").\n  Press Ctrl+C to stop.\n');
  });
}
