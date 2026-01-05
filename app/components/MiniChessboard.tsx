import { Chessboard } from "react-chessboard";

type MiniChessboardProps = {
  fen: string;
  boardOrientation?: "white" | "black";
};

export function MiniChessboard({ fen, boardOrientation = "white" }: MiniChessboardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden" style={{ width: "220px", height: "220px" }}>
      <Chessboard
        options={{
          position: fen,
          boardOrientation,
          allowDragging: false,
          animationDurationInMs: 0,
        }}
      />
    </div>
  );
}
