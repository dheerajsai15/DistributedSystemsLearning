import express from "express";
import os from "os";
import Redis from "ioredis";

const app = express();
const PORT = process.env.PORT || 3000;

const leader = new Redis({
  host: process.env.REDIS_LEADER_HOST ?? "redis",
  port: 6379,
  enableOfflineQueue: false,  // no connection? fail now, do not queue
  maxRetriesPerRequest: 1,     // retry a command one time only
  commandTimeout: 1000,        // no reply in 1 s? fail
});

leader.on("error", (err) => console.error("redis:", err.message));

app.get("/count", async (req, res) => {
  try {
    const count = await leader.incr("counter");
    res.json({
      instance: os.hostname(),
      count
    })
  } catch (e) {
    if (e instanceof Error) {
      console.error("An error occurred: " + e.message)
      res.status(503).json({
        error: e,
        instance: os.hostname()
      })
    }
  }
})

app.listen(PORT, () => {
  console.log(os.hostname() + " " + PORT)
})