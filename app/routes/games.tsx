import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useChessWebSocket } from "../hooks/useChessWebSocket";
import { MiniChessboard } from "../components/MiniChessboard";

type PlayerSlot = {
  color: "white" | "black";
  name?: string;
  connected: boolean;
};

type GameInfo = {
  id: string;
  status: "active";
  fen: string;
  players: PlayerSlot[];
  watcherCount: number;
  moveCount: number;
};

type GamesMessage =
  | { type: "games_list"; games: GameInfo[] }
  | { type: "error"; message: string };

export default function Games() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { send, connectionState } = useChessWebSocket({
    onMessage: (msg: any) => {
      if (msg.type === "games_list") {
        setGames(msg.games);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    },
  });

  // Request games list on mount and refresh every 5 seconds
  useEffect(() => {
    send({ type: "list_games" });
    const interval = setInterval(() => {
      send({ type: "list_games" });
    }, 5000);

    return () => clearInterval(interval);
  }, [send]);

  const handleWatch = (gameId: string) => {
    navigate(`/game/${gameId}`);
  };

  return (
    <main className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <h1 className="text-3xl font-bold mb-8">Active Games</h1>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 mb-6">
            {error}
          </div>
        )}

        {games.length === 0 ? (
          <div className="rounded-4xl border border-white/10 bg-white/5 p-16 text-center">
            <p className="text-slate-400 mb-6">No active games right now</p>
            <button
              onClick={() => navigate("/")}
              className="inline-block rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-emerald-950 hover:bg-emerald-400 transition"
            >
              Start Playing
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.map((game) => (
              <div
                key={game.id}
                className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden shadow-lg shadow-black/30 hover:border-white/20 transition"
              >
                <div className="p-4">
                  <MiniChessboard fen={game.fen} />

                  <div className="mt-4 space-y-3">
                    <div className="text-sm">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-400">White</span>
                        <span className="font-semibold text-white">
                          {game.players[0].name || "Anonymous"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Black</span>
                        <span className="font-semibold text-white">
                          {game.players[1].name || "Anonymous"}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-white/10">
                      <span>{game.moveCount} moves</span>
                      <span>{game.watcherCount} watching</span>
                    </div>

                    <button
                      onClick={() => handleWatch(game.id)}
                      className="w-full mt-3 rounded-xl bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
                    >
                      Watch
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
