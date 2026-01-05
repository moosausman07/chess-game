import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useChessWebSocket } from "../hooks/useChessWebSocket";

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

type GameResult = {
  resultType: "mat" | "pat" | "draw" | "timeout" | "surrender" | undefined;
  winColor?: FigureColor;
};

type ServerMessage =
  | { type: "move"; move: MoveMessageData; fen?: string }
  | { type: "player_joined" | "player_left"; players: PlayerSlot[]; status: GameStatus }
  | { type: "ended"; result: GameResult; fen?: string }
  | { type: "error"; message: string }
  | { type: "pong" };

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

type ChessGameProps = {
  gameId?: string;
  playerName?: string;
  onLeave?: () => void;
};

export function ChessGame({
  gameId,
  playerName,
  onLeave,
}: ChessGameProps) {
  const [fen, setFen] = useState(START_FEN);
  const [players, setPlayers] = useState<PlayerSlot[]>(normalizePlayers());
  const [status, setStatus] = useState<GameStatus>("idle");
  const [viewer, setViewer] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string }>();
  const [assignedColor, setAssignedColor] = useState<FigureColor | undefined>();

  const chessRef = useRef(new Chess(START_FEN));

  const syncChessToFen = useCallback(
    (nextFen: string) => {
      try {
        chessRef.current.load(nextFen);
        setFen(chessRef.current.fen());
      } catch (err) {
        console.error("Failed to load FEN", err);
      }
    },
    [],
  );

  const handleServerMessage = useCallback(
    (message: ServerMessage) => {
      const msg = message as any;

      switch (msg.type) {
        case "session":
        case "matched": {
          if (msg.color) {
            setAssignedColor(msg.color);
            setViewer(msg.viewer ?? false);
          }
          break;
        }
        case "move": {
          const nextFen = msg.fen || msg.move.FEN || START_FEN;
          syncChessToFen(nextFen);
          setLastMove({ from: msg.move.from, to: msg.move.to });
          setResult(null);
          break;
        }
        case "player_joined":
        case "player_left": {
          setPlayers(normalizePlayers(msg.players));
          setStatus(msg.status ?? "waiting");
          break;
        }
        case "ended": {
          setResult(msg.result);
          if (msg.fen) {
            syncChessToFen(msg.fen);
          }
          setStatus("ended");
          break;
        }
        case "error": {
          setError(msg.message);
          break;
        }
        default:
          break;
      }
    },
    [syncChessToFen],
  );

  const { send, connectionState } = useChessWebSocket({
    onMessage: handleServerMessage,
    autoJoinGameId: gameId,
    playerName,
  });

  const activeColor = useMemo(() => getActiveColorFromFEN(fen), [fen]);
  const canMove =
    connectionState === "open" &&
    !viewer &&
    assignedColor &&
    status === "active" &&
    !result &&
    activeColor === assignedColor;

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
        const payload = {
          type: "move" as const,
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
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-4xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/40 backdrop-blur">
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
              <h3 className="mb-3 text-lg font-semibold text-white">Game Status</h3>
              <p className="text-sm text-slate-300 mb-4">{statusLabel}</p>
              {onLeave && (
                <button
                  onClick={onLeave}
                  className="w-full rounded-xl bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/30"
                >
                  Leave Game
                </button>
              )}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/30">
              <h3 className="mb-3 text-lg font-semibold text-white">Players</h3>
              <div className="space-y-2 text-sm text-slate-200">
                {players.map((player, index) => (
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
    </div>
  );
}
