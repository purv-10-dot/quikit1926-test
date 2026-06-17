import "dotenv/config";
import Redis from "ioredis";

async function flush() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("REDIS_URL not set — nothing to flush");
    return;
  }
  const client = new Redis(url, { maxRetriesPerRequest: 2 });
  try {
    await client.flushdb();
    console.log("✅ Redis DB flushed");
  } catch (e) {
    console.error("Failed to flush Redis:", (e as Error).message);
  } finally {
    client.disconnect();
  }
}

flush();
