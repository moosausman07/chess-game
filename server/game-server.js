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
 * @param {string} [preferred]
 * @returns {FigureColor}
 */
function normalizeColor(preferred) {
  return preferred === "black" ? "black" : "white";
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

      if (parsed.type === "create") {
        const color = normalizeColor(parsed.preferredColor);
        const gameId = parsed.gameId || createGameId();
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

        game.players[color] = { ...client, color, name: parsed.playerName };
        client.color = color;
        client.gameId = gameId;
        client.name = parsed.playerName;
        games.set(gameId, game);

        safeSend(socket, {
          type: "session",
          gameId,
          color,
          fen: game.fen,
          status: game.status,
          players: buildPlayers(game),
        });
        return;
      }

      if (parsed.type === "join") {
        const game = games.get(parsed.gameId);
        if (!game) {
          safeSend(socket, { type: "error", message: "Game not found" });
          return;
        }

        const preferredColor = normalizeColor(parsed.preferredColor);
        const slotIsFree = (color) => !game.players[color];
        let assignedColor;
        if (preferredColor && slotIsFree(preferredColor)) {
          assignedColor = preferredColor;
        } else if (slotIsFree("white")) {
          assignedColor = "white";
        } else if (slotIsFree("black")) {
          assignedColor = "black";
        }

        client.gameId = game.id;
        client.name = parsed.playerName;

        if (assignedColor) {
          client.color = assignedColor;
          client.viewer = false;
          game.players[assignedColor] = { ...client };
          game.status =
            game.players.white && game.players.black ? "active" : "waiting";
        } else {
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
        });

        broadcast(
          game,
          {
            type: "player_joined",
            gameId: game.id,
            players: buildPlayers(game),
            status: game.status,
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
  const port = Number(process.env.WS_PORT || 3001);
  const server = http.createServer();
  server.listen(port, () => {
    console.log(
      `Standalone WebSocket server running on ws://localhost:${port}/ws`,
    );
  });
  createGameServer(server);
}
