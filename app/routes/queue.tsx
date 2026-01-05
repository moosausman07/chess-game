import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useChessWebSocket } from "../hooks/useChessWebSocket";

type QueueMessage =
  | { type: "queue_status"; position: number; waiting: boolean }
  | { type: "matched"; gameId: string }
  | { type: "error"; message: string };

export default function Queue() {
  const navigate = useNavigate();
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { send, connectionState } = useChessWebSocket({
    onMessage: (msg: any) => {
      if (msg.type === "queue_status") {
        setQueuePosition(msg.position);
      } else if (msg.type === "matched") {
        navigate(`/game/${msg.gameId}`);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    },
  });

  const handleCancel = () => {
    send({ type: "cancel_queue" });
    navigate("/");
  };

  return (
    <main className="min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-900 via-slate-950 to-black text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <div className="rounded-4xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Finding opponent...</h2>

            <div className="flex justify-center mb-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 animate-spin">
                  <div className="h-full w-full border-4 border-emerald-500/20 border-t-emerald-500 rounded-full"></div>
                </div>
              </div>
            </div>

            {queuePosition !== null && (
              <p className="text-slate-400">
                Position in queue: <span className="font-semibold text-emerald-400">#{queuePosition}</span>
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          )}

          <button
            onClick={handleCancel}
            className="w-full rounded-xl bg-rose-500/20 px-4 py-3 text-center font-semibold text-rose-200 transition hover:bg-rose-500/30"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
