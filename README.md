# Chess Game (React Router + WebSockets)

Play live chess with a friend: create a table, share a link, and the board stays in sync over WebSockets. The UI is built with React Router, `react-chessboard`, and `chess.js` for move validation; the backend is a small Express server with a WebSocket hub.

## Features
- Real-time multiplayer: create/join by game id; spectators see live updates.
- Drag-and-drop board powered by `react-chessboard`, oriented to your color.
- Server-side move sync (FEN-based) and turn enforcement.
- Shareable join link (`?game=<id>`), last-move highlights, online status badges.

## Prerequisites
- Node.js 20+ (the template targets Node 20+; tested with Node 24).
- npm (comes with Node).

## Install
```bash
npm install
```

## Running in development
Start the WebSocket server and the client separately:
```bash
# Terminal 1: WebSocket hub (ws://localhost:3001/ws)
npm run ws

# Terminal 2: React dev server with HMR (http://localhost:5173)
npm run dev
```
If your socket URL differs, set `VITE_WS_URL` when starting the client, e.g.:
```bash
VITE_WS_URL=ws://localhost:3001/ws npm run dev
```

## Production build & serve
```bash
npm run build        # bundles client + server
npm start            # serves HTTP + WebSocket on PORT (default 3000)
```
Built assets live in `build/client`; the server entry is `build/server/index.js`, which `server/index.js` wraps with Express plus the WebSocket hub.

## Deploy (combined HTTP + WebSocket on one host)
Render example (free tier works for testing):
1) Create a new **Web Service** from this repo.
2) Environment: Node 20+.
3) Build command: `npm install && npm run build`
4) Start command: `npm start`
5) Env vars: `NODE_ENV=production`; optionally `WS_PATH=/ws` (defaults to `/ws`).
6) After deploy, your app is at `https://<app>.onrender.com`; the socket is `wss://<app>.onrender.com/ws`. On Vercel (or any separate frontend), set `VITE_WS_URL` to that socket URL.

## How to play
1) Open the app, choose a color, click “Create a new game”.  
2) Copy the provided link (or game id) and share it with a friend.  
3) The opponent clicks “Join” and pastes the id.  
4) Moves are validated locally by `chess.js` and broadcast to all connected clients. Only the side to move can drag pieces.

## Configuration
- `VITE_WS_URL`: Override the WebSocket endpoint for the client (default uses current origin or `ws://localhost:3001/ws` in dev).
- `VITE_WS_PATH`: Override just the WebSocket path (defaults to `/ws` when building the URL automatically).
- `WS_PORT`: Port for the standalone WebSocket server when running `npm run ws` (default 3001).
- `WS_PATH`: WebSocket path for the combined server (default `/ws`).
- `PORT`: HTTP port for `npm start` (default 3000). The WebSocket path remains `/ws`.

## Tech stack
- React Router v7 (SSR template), Vite dev server
- `react-chessboard` for UI, `chess.js` for rules/FEN
- Express + `ws` for WebSocket signaling

## Testing / type-check
```bash
npm run typecheck
```

## Folder map (top-level)
- `app/` — React Router routes/components (see `app/welcome/welcome.tsx`).
- `server/` — Express wrapper and WebSocket hub (`server/index.js`, `server/game-server.js`).
- `build/` — Generated on `npm run build`.

## Notes
- Game state is in-memory on the WebSocket server; restarting it clears active games.
- No user auth or persistence is included; share the link only with people you trust.***
