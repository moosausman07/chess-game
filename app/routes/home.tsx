import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/home";
import { useChessWebSocket } from "../hooks/useChessWebSocket";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Chess - Play Online" },
    { name: "description", content: "Play chess online with instant matchmaking" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const { send, connectionState } = useChessWebSocket();

  const handlePlayGame = () => {
    const ok = send({
      type: "queue",
      playerName: playerName || undefined,
    });
    if (ok) {
      navigate("/queue");
    }
  };

  return (
    <main className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="rounded-4xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur space-y-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-2">Chess</h1>
            <p className="text-slate-400">Play instantly with matchmaking</p>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-slate-300">
              Your name (optional)
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name"
                onKeyPress={(e) => e.key === "Enter" && handlePlayGame()}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none focus:border-emerald-400 transition"
              />
            </label>

            <button
              onClick={handlePlayGame}
              disabled={connectionState !== "open"}
              className="w-full rounded-xl bg-emerald-500 px-4 py-4 text-center text-lg font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:translate-y-[-2px] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50 disabled:translate-y-0"
            >
              {connectionState !== "open" ? "Connecting..." : "Play Game"}
            </button>
          </div>

          <div className="text-center pt-4">
            <a
              href="/games"
              className="text-sm text-slate-400 hover:text-emerald-400 transition"
            >
              Watch live games
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
