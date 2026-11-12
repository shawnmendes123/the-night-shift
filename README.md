# The Night Shift

2-5 player online co-op survival horror. You are night staff in a closed hospital wing: finish your
duties, work out who is haunting the ward and what she wants, and get out through the staff exit.

It runs in the browser (Three.js). One player runs a small Node.js server; everyone else opens a link.

## Launch

1. Install Node.js 18 or newer (https://nodejs.org, LTS).
2. Windows: double-click `start.bat`. Mac/Linux: `./start.sh` (or `npm start`).
   Nothing else to install: the server's one dependency (`ws`) and Three.js are included.
3. Your browser opens http://localhost:3210. Use Chrome or Edge.

## Host and join

- Host: enter a name, click **Host a shift**. You get a 4-letter code and a link.
- Join: open the host's address, enter a name and the code, click **Join** (or open the full link, which fills the code in).
- The host picks the difficulty and starts. Rounds cannot be joined midway; the host returns everyone to the lobby afterwards.

Which address friends use:

- Same Wi-Fi / LAN: the server window prints an address like `http://192.168.x.x:3210`. Allow Node through the Windows firewall when asked.
- Over the internet (pick one):
  - Tunnel: install `cloudflared`, run `cloudflared tunnel --url http://localhost:3210`, share the `https://....trycloudflare.com` address it prints.
  - Host it: push this folder to GitHub and deploy as a Node web service (Render, Railway, Fly). Start command `npm start`; it reads the `PORT` variable. WebSockets must be enabled (they are by default on those hosts).
  - Port-forward TCP 3210 on your router and share your public IP.

## Smooth play on a laptop

- **Graphics** in the lobby: High (shadows + bloom), Medium (default on integrated graphics), Low. Resolution also lowers itself automatically when frames drop and recovers when there is headroom.
- Press **F3** in game to see the frame rate, quality and current resolution.
- **Windows laptops with an NVIDIA/AMD card:** Chrome often runs on the weaker built-in Intel graphics. Fix it once: Settings > System > Display > Graphics > add or pick Google Chrome > Options > High performance, then restart Chrome.
- Mouse sensitivity is in the lobby.

## Controls

WASD move, Shift run (loud, limited stamina), C crouch (silent), E use / hide / hold to work,
F torch, G drop, left click throw a bottle, Space hold breath while hiding, Tab evidence, F3 frame rate, Esc free the mouse.

## How she works (learnable rules)

- She only knows where you are if she sees you (range, view cone, line of sight) or hears you. Running carries about 11 m, walking 4 m, crouching is silent. Doors, drops, the breaker and broken glass are all noise. She goes to where the noise was.
- A thrown bottle makes its noise where it lands. Use it to pull her away.
- She always warns before she can kill: lights and your torch flicker near her, the room tone drops out, and she shrieks before a chase starts. Sometimes she only stands and watches.
- Hiding: if she watched you get in, it will not save you. Otherwise she may come and listen at the door; hold your breath until she leaves. Breath is limited, and gasping is loud.
- Caught players are dragged toward a dark doorway. A teammate who reaches them in time can hold E to pull them free, once per player. Otherwise they are out and can spectate.
- Each player lost lowers the duty quota by one (minimum 2) and adds 90 seconds.
- To win: complete the required number of duties, solve the mystery from the evidence, then at least one player reaches the staff exit.

Difficulty changes the numbers only (quota, time, her speed and senses, how many hiding spots are jammed, rescue time); see `shared/config.js`.

## Project layout

- `server/` - rooms and lobby (`room.js`), ghost AI (`ghost.js`), pathfinding (`nav.js`)
- `shared/` - hospital layout (`map.js`) and tuning (`config.js`), used by both sides
- `public/` - client: rendering, ghost model and animation, audio synthesis, HUD
- `tools/` - `npm test` runs the automated multiplayer tests; `map-check.js` validates the layout

## Known limitations

- No voice chat. Use Discord or a call alongside.
- All art and sound are generated in code: stylised, not photoreal. No sculpted or motion-captured assets.
- Player movement is trusted by the server (fine for friends, not cheat-proof).
- One map, one ghost. No saved progress, no reconnect into a running round.
- "Low" graphics turns off shadows and post-processing for weak laptops.
