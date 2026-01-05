import { Link } from "react-router";

export function Navigation() {
  return (
    <nav className="flex gap-6 px-6 py-4 bg-white/5 border-b border-white/10">
      <Link
        to="/"
        className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
      >
        Home
      </Link>
      <Link
        to="/games"
        className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition"
      >
        Active Games
      </Link>
    </nav>
  );
}
