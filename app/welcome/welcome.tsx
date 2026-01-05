import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

type FigureColor = "white" | "black";
type GameStatus = "idle" | "waiting" | "active" | "ended";

type PlayerSlot = {
  color: FigureColor;
  name?: string;
  connected: boolean;
};

type MoveMessageData = {
  from: string;
  to: string;
  san?: string;
  promotion?: string;
  FEN: string;
  color?: FigureColor;
};

type SessionMessage = {
  type: "session";
  gameId: string;
  color?: FigureColor;
  viewer?: boolean;
  fen: string;
  status: GameStatus;
  players: PlayerSlot[];
  result?: GameResult;
};

type MoveMessage = {
  type: "move";
  gameId: string;
  move: MoveMessageData;
  fen?: string;
  nextToMove?: FigureColor;
  by?: FigureColor;
};

type PlayerChangeMessage = {
  type: "player_joined" | "player_left";
  gameId: string;
  players: PlayerSlot[];
  status: GameStatus;
};

type EndMessage = {
  type: "ended";
  gameId: string;
  result: GameResult;
  fen?: string;
};

type ErrorMessage = {
  type: "error";
  message: string;
};

type ServerMessage =
  | SessionMessage
  | MoveMessage
  | PlayerChangeMessage
  | EndMessage
  | ErrorMessage
  | { type: "pong" };

type GameResultType = "mat" | "pat" | "draw" | "timeout" | "surrender";

type GameResult = {
  resultType: GameResultType | undefined;
  winColor?: FigureColor;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const WS_PATH = "/ws";

function getActiveColorFromFEN(fen: string): FigureColor {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

function normalizePlayers(players?: PlayerSlot[]): PlayerSlot[] {
  const base: Record<FigureColor, PlayerSlot> = {
    white: { color: "white", connected: false },
    black: { color: "black", connected: false },
  };

  (players ?? []).forEach((player) => {
    base[player.color] = { ...base[player.color], ...player };
  });

  return [base.white, base.black];
}

function getWebSocketUrl() {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;

  const devDefault = import.meta.env.DEV
    ? `ws://localhost:3001${WS_PATH}`
    : undefined;

  if (typeof window === "undefined") {
    return devDefault || `ws://localhost:3001${WS_PATH}`;
  }

  if (devDefault) return devDefault;

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = WS_PATH;
  return url.toString();
}

export function Welcome() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionState, setConnectionState] = useState<
    "connecting" | "open" | "closed"
  >("connecting");
  const [gameId, setGameId] = useState("");
  const [pendingGameId, setPendingGameId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [preferredColor, setPreferredColor] = useState<FigureColor>("white");
  const [assignedColor, setAssignedColor] = useState<FigureColor>();
  const [fen, setFen] = useState(START_FEN);
  const [players, setPlayers] = useState<PlayerSlot[]>(normalizePlayers());
  const [status, setStatus] = useState<GameStatus>("idle");
  const [viewer, setViewer] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string }>();

  const chessRef = useRef(new Chess(START_FEN));
  const wsUrl = useMemo(getWebSocketUrl, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialGameId = params.get("game");
    if (initialGameId) {
      setPendingGameId(initialGameId);
    }
  }, []);

  const syncChessToFen = useCallback(
    (nextFen: string) => {
      try {
        chessRef.current.load(nextFen);
        setFen(chessRef.current.fen());
      } catch (err) {
        console.error("Failed to load FEN", err);
      }
    },
    [setFen],
  );

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "session": {
          setGameId(message.gameId);
          setAssignedColor(message.color);
          setViewer(Boolean(message.viewer));
          syncChessToFen(message.fen || START_FEN);
          setLastMove(undefined);
          setPlayers(normalizePlayers(message.players));
          setStatus(message.status ?? "active");
          setResult(message.result ?? null);
          setError(null);
          break;
        }
        case "move": {
          const nextFen = message.fen || message.move.FEN || START_FEN;
          syncChessToFen(nextFen);
          setLastMove({ from: message.move.from, to: message.move.to });
          setResult(null);
          break;
        }
        case "player_joined":
        case "player_left": {
          setPlayers(normalizePlayers(message.players));
          setStatus(message.status ?? "waiting");
          break;
        }
        case "ended": {
          setResult(message.result);
          if (message.fen) {
            syncChessToFen(message.fen);
          }
          setStatus("ended");
          break;
        }
        case "error": {
          setError(message.message);
          break;
        }
        default:
          break;
      }
    },
    [syncChessToFen],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const socket = new WebSocket(wsUrl);
    setConnectionState("connecting");
    socket.onopen = () => {
      setConnectionState("open");
      setError(null);
    };
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        handleServerMessage(parsed);
      } catch (err) {
        console.error("Failed to parse server message", err);
      }
    };
    socket.onerror = () => setError("WebSocket connection failed");
    socket.onclose = () => {
      setConnectionState("closed");
      setStatus("idle");
      setAssignedColor(undefined);
      setViewer(false);
    };
    setWs(socket);

    return () => socket.close();
  }, [handleServerMessage, wsUrl]);

  const activeColor = useMemo(() => getActiveColorFromFEN(fen), [fen]);
  const canMove =
    connectionState === "open" &&
    !viewer &&
    assignedColor &&
    status === "active" &&
    !result &&
    activeColor === assignedColor;

  const send = useCallback(
    (payload: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        return true;
      }
      setError("Waiting for the server connection before sending data.");
      return false;
    },
    [ws],
  );

  const handleCreateGame = () => {
    const ok = send({
      type: "create",
      playerName: playerName || undefined,
      preferredColor,
    });
    if (ok) {
      setResult(null);
      setStatus("waiting");
    }
  };

  const handleJoinGame = () => {
    if (!pendingGameId.trim()) {
      setError("Enter a game id to join.");
      return;
    }
    const ok = send({
      type: "join",
      gameId: pendingGameId.trim(),
      playerName: playerName || undefined,
      preferredColor,
    });
    if (ok) {
      setResult(null);
    }
  };

  const handleMove = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (!canMove) return false;
      const move = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      if (!move) return false;

      const nextFen = chessRef.current.fen();
      setFen(nextFen);
      setLastMove({ from: sourceSquare, to: targetSquare });

      if (gameId) {
        const payload: MoveMessage = {
          type: "move",
          gameId,
          move: {
            from: sourceSquare,
            to: targetSquare,
            san: move.san,
            promotion: move.promotion,
            FEN: nextFen,
            color: assignedColor,
          },
          fen: nextFen,
          nextToMove: getActiveColorFromFEN(nextFen),
          by: assignedColor,
        };
        send(payload);
      }
      return true;
    },
    [canMove, gameId, send, assignedColor],
  );

  const shareUrl = useMemo(() => {
    if (!gameId || typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("game", gameId);
    return url.toString();
  }, [gameId]);

  const statusLabel = useMemo(() => {
    if (result) return "Game finished";
    if (status === "waiting") return "Waiting for an opponent";
    if (status === "active") {
      if (viewer || !assignedColor) return "Watching the board";
      return activeColor === assignedColor ? "Your move" : "Opponent to move";
    }
    return "Not in a game yet";
  }, [activeColor, assignedColor, result, status, viewer]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = {
        background:
          "radial-gradient(circle, rgba(74,222,128,0.35) 0%, rgba(34,197,94,0.3) 50%, rgba(22,101,52,0.25) 100%)",
      };
      styles[lastMove.to] = {
        background:
          "radial-gradient(circle, rgba(74,222,128,0.4) 0%, rgba(34,197,94,0.35) 50%, rgba(22,101,52,0.3) 100%)",
      };
    }
    return styles;
  }, [lastMove]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-4xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/40 backdrop-blur">
            {/*<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 rounded-full bg-white/5 px-4 py-2 text-sm text-slate-200 ring-1 ring-white/10 backdrop-blur">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connectionState === "open"
                      ? "bg-emerald-400"
                      : connectionState === "connecting"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                  }`}
                />
                <span className="font-medium capitalize">
                  {connectionState}
                </span>
                <span className="text-slate-400">socket</span>
              </div>{" "}
              <div className="flex items-center gap-3 text-sm text-slate-200">
                <span className="rounded-full bg-white/10 px-3 py-1">
                  Game ID: {gameId || "—"}
                </span>
                {shareUrl && (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">
                    Share link ready
                  </span>
                )}
              </div>
            </div>*/}

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-inner shadow-black/30">
              <Chessboard
                options={{
                  position: fen,
                  boardOrientation:
                    assignedColor === "black" ? "black" : "white",
                  allowDragging: canMove,
                  squareStyles,
                  animationDurationInMs: 200,
                  onPieceDrop: ({ sourceSquare, targetSquare }) =>
                    handleMove(sourceSquare, targetSquare ?? sourceSquare),
                }}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/30">
              <h2 className="mb-3 text-lg font-semibold text-white">
                Start or join a table
              </h2>
              <div className="flex flex-col gap-3">
                <label className="text-sm text-slate-300">
                  Your name (optional)
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Chess Master"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-white outline-none ring-emerald-500/40 focus:border-emerald-400"
                  />
                </label>

                <div className="flex items-center gap-3">
                  <button
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      preferredColor === "white"
                        ? "bg-white text-slate-900"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                    onClick={() => setPreferredColor("white")}
                  >
                    Play as White
                  </button>
                  <button
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      preferredColor === "black"
                        ? "bg-white text-slate-900"
                        : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                    onClick={() => setPreferredColor("black")}
                  >
                    Play as Black
                  </button>
                </div>

                <button
                  onClick={handleCreateGame}
                  className="rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:translate-y-[-1px] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
                  disabled={connectionState !== "open"}
                >
                  Create a new game
                </button>

                <div className="h-px w-full bg-white/10" />

                <label className="text-sm text-slate-300">
                  Join by game id
                  <div className="mt-2 flex gap-2">
                    <input
                      value={pendingGameId}
                      onChange={(e) => setPendingGameId(e.target.value)}
                      placeholder="Paste game id"
                      className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-white outline-none ring-emerald-500/40 focus:border-emerald-400"
                    />
                    <button
                      onClick={handleJoinGame}
                      className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:bg-white/10"
                      disabled={connectionState !== "open"}
                    >
                      Join
                    </button>
                  </div>
                </label>
                {shareUrl && (
                  <p className="text-xs text-slate-400">
                    Share this link with a friend:{" "}
                    <span className="break-all text-slate-200">{shareUrl}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/30">
              <h3 className="mb-3 text-lg font-semibold text-white">Players</h3>
              <div className="space-y-2 text-sm text-slate-200">
                {players.map((player) => (
                  <div
                    key={player.color}
                    className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          player.connected ? "bg-emerald-400" : "bg-slate-500"
                        }`}
                      />
                      <span className="capitalize font-semibold">
                        {player.color}
                      </span>
                      <span className="text-slate-400">
                        {player.name || "Open seat"}
                      </span>
                    </div>
                    {assignedColor === player.color && !viewer && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
