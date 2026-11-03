// Start the Grid Auction multiplayer server.
//   PORT=3000 node src/f1a/server/main.ts      (Node.js 22.18+ runs TypeScript directly)
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startServer } from "./http.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.PORT ?? 3000);
startServer({ port, staticDir: join(root, "public/f1a") });
console.log(`Grid Auction server running on http://localhost:${port}`);

// Last line of defence: log unexpected errors instead of dropping every lobby.
process.on("uncaughtException", (e) => console.error("uncaught:", e));
process.on("unhandledRejection", (e) => console.error("unhandled rejection:", e));
