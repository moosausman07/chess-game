import { useParams, useNavigate } from "react-router";
import { ChessGame } from "../components/ChessGame";

export default function Game() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  if (!gameId) {
    return (
      <main className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-red-400 mb-4">Invalid game ID</p>
          <button
            onClick={() => navigate("/")}
            className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-emerald-950"
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <ChessGame
      gameId={gameId}
      onLeave={() => navigate("/games")}
    />
  );
}
