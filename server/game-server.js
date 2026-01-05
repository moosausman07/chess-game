// @ts-check
import http from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

/**
 * @typedef {"white" | "black"} FigureColor
 * @typedef {{ type: string; color: FigureColor; touched?: boolean; position?: [number, number] }} Figure
 * @typedef {{ from: [number, number]; to: [number, number]; figure: Figure; type?: string; FEN?: string; timeWhite?: number; timeBlack?: number }} MoveData
 * @typedef {{ resultType: "mat" | "pat" | "draw" | "timeout" | "surrender" | undefined; winColor?: FigureColor }} GameResult
 */

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * @param {string} fen
 * @returns {FigureColor}
 */
function getActiveColorFromFEN(fen) {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

/**
 * Randomly choose between white and black
 * @returns {FigureColor}
 */
function randomColor() {
  return Math.random() < 0.5 ? "white" : "black";
}

function createGameId() {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * @param {import("ws").WebSocket} socket
 * @param {any} payload
 */
function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

/**
 * @param {import("http").Server} server
 * @param {{ path?: string }} [options]
 */
export function createGameServer(server, options = {}) {
  const path = options.path || "/ws";
  const wss = new WebSocketServer({ server, path });

  /**
   * @typedef {{ id: string; socket: import("ws").WebSocket; name?: string; color?: FigureColor; gameId?: string; viewer?: boolean }} Client
   * @typedef {{ id: string; fen: string; status: "waiting" | "active" | "ended"; players: { white?: Client; black?: Client }; watchers: Set<import("ws").WebSocket>; moves: MoveData[]; result?: GameResult }} Game
   */

  /** @type {Map<string, Game>} */
  const games = new Map();

  /**
   * @typedef {{ clientId: string; socket: import("ws").WebSocket; playerName?: string; timestamp: number }} QueueEntry
   * @type {QueueEntry[]}
   */
  const matchmakingQueue = [];

  /**
   * Broadcast games list to all connected clients
   */
  const broadcastGamesList = () => {
    const gamesList = Array.from(games.values())
      .filter((g) => g.status === "active")
      .map((g) => ({
        id: g.id,
        status: g.status,
        fen: g.fen,
        players: buildPlayers(g),
        watcherCount: g.watchers.size,
        moveCount: g.moves.length,
      }));

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        safeSend(client, { type: "games_list", games: gamesList });
      }
    });
  };

  /**
   * @param {Game} game
   * @returns {{ color: FigureColor; connected: boolean; name?: string }[]}
   */
  const buildPlayers = (game) => {
    return ["white", "black"].map((color) => {
      const player = game.players[color];
      return { color, name: player?.name, connected: !!player };
    });
  };

  /**
   * @param {Game} game
   * @param {any} payload
   * @param {import("ws").WebSocket} [exclude]
   */
  const broadcast = (game, payload, exclude) => {
    const sockets = [
      game.players.white?.socket,
      game.players.black?.socket,
      ...game.watchers,
    ].filter(Boolean);

    sockets.forEach((socket) => {
      if (socket && socket !== exclude) {
        safeSend(socket, payload);
      }
    });
  };

  /**
   * @param {Client} client
   */
  const removeClientFromGame = (client) => {
    if (!client.gameId) return;
    const game = games.get(client.gameId);
    if (!game) return;

    if (game.players.white?.id === client.id) {
      game.players.white = undefined;
    } else if (game.players.black?.id === client.id) {
      game.players.black = undefined;
    } else {
      game.watchers.delete(client.socket);
    }

    game.status =
      game.players.white && game.players.black ? "active" : "waiting";

    broadcast(game, {
      type: "player_left",
      gameId: game.id,
      players: buildPlayers(game),
      status: game.status,
    });
  };

  /**
   * @param {any} message
   */
  const isMoveMessage = (message) =>
    message &&
    typeof message === "object" &&
    message.type === "move" &&
    typeof message.gameId === "string" &&
    message.move;

  wss.on("connection", (socket) => {
    const clientId = randomUUID();
    /** @type {Client} */
    const client = { id: clientId, socket };

    socket.on("message", (data) => {
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        safeSend(socket, { type: "error", message: "Bad JSON payload" });
        return;
      }

      if (parsed.type === "ping") {
        safeSend(socket, { type: "pong" });
        return;
      }

      if (parsed.type === "queue") {
        const queueEntry = {
          clientId: client.id,
          socket,
          playerName: parsed.playerName,
          timestamp: Date.now(),
        };
        matchmakingQueue.push(queueEntry);
        client.inQueue = true;
        client.gameId = undefined;

        // Send initial queue position
        safeSend(socket, {
          type: "queue_status",
          position: matchmakingQueue.length,
          waiting: true,
        });

        // Try to match if 2+ players
        if (matchmakingQueue.length >= 2) {
          const player1 = matchmakingQueue.shift();
          const player2 = matchmakingQueue.shift();

          // Random color assignment
          const p1Color = randomColor();
          const p2Color = p1Color === "white" ? "black" : "white";

          // Create game
          const gameId = createGameId();
          const game = {
            id: gameId,
            fen: START_FEN,
            status: "active",
            players: {
              [p1Color]: {
                id: player1.clientId,
                socket: player1.socket,
                color: p1Color,
                name: player1.playerName,
                gameId: gameId,
              },
              [p2Color]: {
                id: player2.clientId,
                socket: player2.socket,
                color: p2Color,
                name: player2.playerName,
                gameId: gameId,
              },
            },
            watchers: new Set(),
            moves: [],
            result: undefined,
          };
          games.set(gameId, game);

          // Notify both players of match
          safeSend(player1.socket, {
            type: "matched",
            gameId,
            color: p1Color,
            fen: START_FEN,
            status: "active",
            players: buildPlayers(game),
            colorRevealed: true,
          });

          safeSend(player2.socket, {
            type: "matched",
            gameId,
            color: p2Color,
            fen: START_FEN,
            status: "active",
            players: buildPlayers(game),
            colorRevealed: true,
          });

          // Broadcast game list update
          broadcastGamesList();
        }
        return;
      }

      if (parsed.type === "cancel_queue") {
        const index = matchmakingQueue.findIndex((e) => e.clientId === client.id);
        if (index !== -1) {
          matchmakingQueue.splice(index, 1);
          client.inQueue = false;
        }
        safeSend(socket, { type: "queue_cancelled" });
        return;
      }

      if (parsed.type === "list_games") {
        const gamesList = Array.from(games.values())
          .filter((g) => g.status === "active")
          .map((g) => ({
            id: g.id,
            status: g.status,
            fen: g.fen,
            players: buildPlayers(g),
            watcherCount: g.watchers.size,
            moveCount: g.moves.length,
          }));

        safeSend(socket, { type: "games_list", games: gamesList });
        return;
      }

      if (parsed.type === "create") {
        const gameId = createGameId();
        if (games.has(gameId)) {
          safeSend(socket, { type: "error", message: "Game already exists" });
          return;
        }
        const game = {
          id: gameId,
          fen: START_FEN,
          status: "waiting",
          players: { white: undefined, black: undefined },
          watchers: new Set(),
          moves: [],
          result: undefined,
        };

        // Don't assign color yet - just add as first player
        client.gameId = gameId;
        client.name = parsed.playerName;
        // Store client temporarily, color will be assigned when second player joins
        client.tempSlot = true;

        games.set(gameId, game);

        safeSend(socket, {
          type: "session",
          gameId,
          fen: game.fen,
          status: game.status,
          players: buildPlayers(game),
          colorRevealed: false,
        });
        return;
      }

      if (parsed.type === "join") {
        const game = games.get(parsed.gameId);
        if (!game) {
          safeSend(socket, { type: "error", message: "Game not found" });
          return;
        }

        client.gameId = game.id;
        client.name = parsed.playerName;

        const slotIsFree = (color) => !game.players[color];
        const emptySlots = [];
        if (slotIsFree("white")) emptySlots.push("white");
        if (slotIsFree("black")) emptySlots.push("black");

        let assignedColor;
        if (emptySlots.length === 2) {
          // This is the first player joining via the link - place them in a temp slot
          client.viewer = false;
          client.tempSlot = true;
        } else if (emptySlots.length === 1) {
          // Second player joining - assign both players their colors now
          assignedColor = emptySlots[0];
          client.color = assignedColor;
          client.viewer = false;
          game.players[assignedColor] = { ...client };

          // Find the first player (in tempSlot) and assign them the other color
          const otherColor = assignedColor === "white" ? "black" : "white";
          const firstPlayer = Object.values(game.players).find(
            (p) => p && p.tempSlot,
          );
          if (firstPlayer) {
            firstPlayer.color = otherColor;
            firstPlayer.tempSlot = false;
            game.players[otherColor] = firstPlayer;
          }

          game.status = "active";
        } else {
          // Both slots full - become a spectator
          client.viewer = true;
          game.watchers.add(socket);
        }

        safeSend(socket, {
          type: "session",
          gameId: game.id,
          color: client.color,
          viewer: client.viewer,
          fen: game.fen,
          status: game.status,
          players: buildPlayers(game),
          result: game.result,
          colorRevealed: game.status === "active",
        });

        broadcast(
          game,
          {
            type: "player_joined",
            gameId: game.id,
            players: buildPlayers(game),
            status: game.status,
            colorRevealed: game.status === "active",
          },
          socket,
        );
        return;
      }

      if (parsed.type === "end") {
        if (!client.gameId) {
          safeSend(socket, { type: "error", message: "Not in a game" });
          return;
        }
        const game = games.get(client.gameId);
        if (!game) return;
        game.status = "ended";
        game.result = parsed.result;
        broadcast(game, {
          type: "ended",
          gameId: game.id,
          result: parsed.result,
          fen: game.fen,
        });
        return;
      }

      if (isMoveMessage(parsed)) {
        if (!client.gameId || !client.color) {
          safeSend(socket, { type: "error", message: "Join a game first" });
          return;
        }
        const game = games.get(client.gameId);
        if (!game) {
          safeSend(socket, { type: "error", message: "Game not found" });
          return;
        }
        const activeColor = getActiveColorFromFEN(game.fen);
        if (activeColor !== client.color) {
          safeSend(socket, { type: "error", message: "Not your turn" });
          return;
        }
        const moveData = parsed.move;
        if (!moveData.FEN) {
          safeSend(socket, { type: "error", message: "Move is missing FEN" });
          return;
        }

        game.fen = moveData.FEN;
        game.moves.push(moveData);

        const nextToMove = getActiveColorFromFEN(game.fen);
        const message = {
          type: "move",
          gameId: game.id,
          move: moveData,
          fen: game.fen,
          nextToMove,
          by: client.color,
        };

        broadcast(game, message);
        return;
      }

      safeSend(socket, { type: "error", message: "Unknown message type" });
    });

    socket.on("close", () => {
      // Remove from queue if in queue
      if (client.inQueue) {
        const queueIndex = matchmakingQueue.findIndex((e) => e.clientId === client.id);
        if (queueIndex !== -1) {
          matchmakingQueue.splice(queueIndex, 1);
        }
      }

      // Remove from game if in game
      removeClientFromGame(client);
    });
  });

  const port = server.address();
  const portInfo =
    typeof port === "object" && port ? `:${port.port}` : " (shared server)";
  console.log(`WebSocket chess server ready on ${path}${portInfo}`);

  return { wss, games };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cliPort = process.argv[2];
  const port = Number(cliPort || process.env.WS_PORT || 3001);
  const server = http.createServer();

  server.on("error", (err) => {
    if (/** @type {any} */ (err).code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Set WS_PORT to another port, ` +
          `e.g. WS_PORT=${port + 1} npm run ws`,
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, () => {
    console.log(
      `Standalone WebSocket server running on ws://localhost:${port}/ws`,
    );
  });
  createGameServer(server);
}
