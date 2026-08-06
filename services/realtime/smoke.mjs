// smoke.mjs — end-to-end real-Redis smoke for the realtime gateway.
// Proves the whole path the ioredis-mock unit tests can't: a real socket
// handshake + a real `quikchat:fanout` publish → per-user room delivery.
//
// Run from services/realtime with local Redis up and the server on :3012:
//   node --env-file-if-exists=.env smoke.mjs
// (loading the same .env guarantees the token secret + REDIS_URL match the
// running server).
import jwt from "jsonwebtoken";
import { io as ioClient } from "socket.io-client";
import Redis from "ioredis";

const SECRET = process.env.REALTIME_TOKEN_SECRET;
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";
const PORT = process.env.PORT ?? 3012;
const orgId = "org-smoke",
  userId = "u-smoke";

if (!SECRET) {
  console.error("✗ REALTIME_TOKEN_SECRET not set (load the server's .env)");
  process.exit(1);
}

const token = jwt.sign({ userId, orgId }, SECRET, { expiresIn: "60s" });
const pub = new Redis(REDIS_URL);
const socket = ioClient(`http://localhost:${PORT}`, { auth: { token }, transports: ["websocket"] });

socket.on("connect", () => console.log("connected", socket.id));
socket.on("connect_error", (e) => {
  console.error("connect_error:", e.message);
  process.exit(1);
});
socket.on("ready", async () => {
  console.log("ready — publishing notification to quikchat:fanout");
  await pub.publish(
    "quikchat:fanout",
    JSON.stringify({
      orgId,
      channelId: "smoke",
      event: "notification",
      userId,
      payload: { hello: "world", t: Date.now() },
    }),
  );
});
socket.on("notification", (p) => {
  console.log("✓ received notification:", p);
  socket.close();
  pub.quit();
  process.exit(0);
});
setTimeout(() => {
  console.error("✗ no notification within 5s");
  process.exit(1);
}, 5000);
