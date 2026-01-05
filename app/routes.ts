import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("queue", "routes/queue.tsx"),
  route("games", "routes/games.tsx"),
  route("game/:gameId", "routes/game.tsx"),
] satisfies RouteConfig;
