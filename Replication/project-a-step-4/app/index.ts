import express from "express";
import os from "os";
import Redis from "ioredis";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 3000;
const RYW_WINDOW_MS = Number(process.env.RYW_WINDOW_MS ?? 10000);

app.use(express.json());
app.use(cookieParser())

const leader = new Redis({
  host: process.env.REDIS_LEADER_HOST ?? "redis",
  port: 6379,
  enableOfflineQueue: false,  // no connection? fail now, do not queue
  maxRetriesPerRequest: 1,     // retry a command one time only
  commandTimeout: 1000,        // no reply in 1 s? fail
});

const follower = new Redis({
  host: process.env.REDIS_FOLLOWER_HOST ?? "redis-replica",
  port: 6379,
  enableOfflineQueue: false,  // no connection? fail now, do not queue
  maxRetriesPerRequest: 1,     // retry a command one time only
  commandTimeout: 1000,        // no reply in 1 s? fail
});

leader.on("error", (err) => console.error("redis:", err.message));
follower.on("error", (err) => console.error("redis-replica:", err.message));

app.get("/count", async (req, res) => {
  try {
    const count = await leader.incr("counter");
    res.json({
      instance: os.hostname(),
      count
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("An error occurred: " + message)
    res.status(503).json({
      message: "An error occurred: " + message,
      instance: os.hostname()
    })
  }
})

app.post("/posts", async (req, res) => {
  try {
    const text = req.body?.text;
    if (typeof text !== "string" || text === "") {
      return res.status(400).json({
        message: "Text is missing",
        instance: os.hostname()
      })
    }

    const len = await leader.lpush("posts", text);
    res.cookie("lastWrite", String(Date.now()), { httpOnly: true, maxAge: RYW_WINDOW_MS })
    res.json({
      instance: os.hostname(),
      len,
      servedBy: "leader"
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(503).json({
      message: "An error occurred: " + message,
      instance: os.hostname()
    });
  }
})

app.get("/posts", async (req, res) => {
  try {
    // Choose one time, so the client and the label always agree
    let servedBy: "leader" | "follower";
    if (req.query.from === "leader") {
      servedBy = "leader";
    } else if (req.query.from === "follower") {
      servedBy = "follower";
    } else {
      // A bad or missing cookie gives NaN, and NaN < anything is false
      const lastWrite = Number(req.cookies.lastWrite);
      const recentWrite = Number.isFinite(lastWrite) && Date.now() - lastWrite < RYW_WINDOW_MS;
      servedBy = recentWrite ? "leader" : "follower";
    }
    const client = servedBy === "leader" ? leader : follower;
    const posts = await client.lrange("posts", 0, -1);
    res.json({
      instance: os.hostname(),
      posts,
      servedBy
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(503).json({
      message: "An error occurred: " + message,
      instance: os.hostname()
    });
  }
})

app.listen(PORT, () => {
  console.log(os.hostname() + " " + PORT)
})