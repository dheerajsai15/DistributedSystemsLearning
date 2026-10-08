# Project A: Stateless service, Redis replication and failover

## Context

I am a Java backend engineer. I study distributed systems with a step-by-step plan.
This is Phase 1 and Phase 2, topic 1: **replication**.

The goal of Project A is to see these problems on my own machine:

1. Local state does not work with many instances of a service.
2. Single-leader replication (Redis leader and follower).
3. Replication lag and the read-your-writes problem.
4. Catch-up recovery (partial resync and full resync).
5. Manual failover and the risk of split brain.

This is a learning project. Keep it small and easy to read. Do not add production features that hide the problems.

## How to help me

- I write the application logic and I do the experiments.
- You can make the infrastructure files (Dockerfile, `docker-compose.yml`, `nginx.conf`, `tsconfig.json`, `package.json`).
- For application code, give hints and review my code first. Write the full code only when I ask.
- When an experiment gives a result, explain the result with replication concepts. Do not only fix it.
- Do not write the answers in `NOTES.md`. I write them.
- Use ASD-STE100 Simplified Technical English in explanations.

## Stack

- Bun (runtime and package manager), Express, TypeScript. Bun runs `.ts` files directly. There is no build step.
- `ioredis` for Redis
- Docker Compose
- Nginx as the load balancer
- Redis 7 (image `redis:7`)

Do not use Redis Sentinel, Redis Cluster, Kubernetes or an ORM in this project.

## Folder structure

```
project-a/
  app/
    index.ts
    package.json
    bun.lock
    tsconfig.json
    Dockerfile
  nginx/
    nginx.conf
  docker-compose.yml
  NOTES.md
  CLAUDE.md
```

## Services in docker-compose.yml

| Service | Image or build | Job |
|---|---|---|
| `app1`, `app2`, `app3` | build `./app` | Three instances of the same Express service on port 3000 |
| `nginx` | `nginx` | Load balancer. Host port 8080 to container port 80 |
| `redis` | `redis:7` | Redis leader (primary) |
| `redis-replica` | `redis:7` | Redis follower. Command: `redis-server --replicaof redis 6379` (added in Part 3) |

Nginx configuration:

```nginx
events {}
http {
  upstream app { server app1:3000; server app2:3000; server app3:3000; }
  server { listen 80; location / { proxy_pass http://app; } }
}
```

## Environment variables

Read all Redis host names from environment variables. Part 4 changes them.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_LEADER_HOST` | `redis` | All writes |
| `REDIS_FOLLOWER_HOST` | `redis-replica` | Normal reads of posts |
| `RYW_WINDOW_MS` | `10000` | Read-your-writes time window |

## ioredis settings

Use settings that make errors visible quickly. With the default settings, a request waits for a long time when Redis is stopped.

- `enableOfflineQueue: false`
- `maxRetriesPerRequest: 1`
- `commandTimeout: 1000`

## API

Each response includes `instance` (the value of `os.hostname()`). Responses about posts also include `servedBy` (`"leader"` or `"follower"`).

| Method and path | Part | Behavior |
|---|---|---|
| `GET /count/local` | 1 | Increase an in-memory counter. Return `{ instance, count }`. Keep this endpoint for comparison. |
| `GET /count` | 2 | Run `INCR counter` on the leader. Return `{ instance, count }`. |
| `POST /posts` | 3 | Body `{ "text": "..." }`. Run `LPUSH posts <text>` on the leader. Set the cookie `lastWrite=<Date.now()>`. |
| `GET /posts` | 3 | Run `LRANGE posts 0 -1` on the follower. If the `lastWrite` cookie is less than `RYW_WINDOW_MS` old, read from the leader. |
| `GET /posts?from=leader` | 3 | Always read from the leader. |
| `GET /posts?from=follower` | 3 | Always read from the follower. Ignore the cookie. |

### Part 1: Three instances with local state

1. Make the Express service with `GET /count/local`.
2. Start with `docker compose up --build`.
3. Test: `for i in $(seq 1 9); do curl -s localhost:8080/count/local; echo; done`

**Expected result:** each instance has its own counter. The count is not correct.

### Part 2: Move the state to Redis

1. Add the `redis` service and `GET /count`.
2. Send 9 requests to `/count`. **Expected result:** one counter.
3. Run `docker compose stop app2`. Send 9 requests. Record if any request fails.
4. Run `docker compose start app2`.

### Part 3: Redis leader and follower

1. Add `redis-replica` and the `/posts` endpoints.
2. Send 3 posts. Read with `?from=follower`. **Expected result:** 3 posts.
3. Compare the log positions:
   - `docker compose exec redis redis-cli INFO replication`
   - `docker compose exec redis-replica redis-cli INFO replication`
   - Compare `master_repl_offset`. Also examine `repl_backlog_active`.
4. Stop replication: `docker compose exec redis-replica redis-cli REPLICAOF NO ONE`
5. Send 2 more posts. Read with `?from=follower` and with `?from=leader`. **Expected result:** 3 posts and 5 posts.
6. Test the read-your-writes fix with a cookie jar:
   - `curl -c jar.txt -b jar.txt -X POST localhost:8080/posts -H 'Content-Type: application/json' -d '{"text":"hello"}'`
   - `curl -c jar.txt -b jar.txt localhost:8080/posts`
   - **Expected result:** `servedBy` is `"leader"` in the time window.
7. Start replication again: `docker compose exec redis-replica redis-cli REPLICAOF redis 6379`
8. Read with `?from=follower`. **Expected result:** all posts.
9. Run `docker compose logs redis-replica`. Find if Redis did a partial resync or a full resync.

Optional check: try to write to the follower with `redis-cli`. Redis replicas are read-only by default.

### Part 4: Manual failover

1. Run `docker compose stop redis`.
2. Send a post. Record the error. Read with `?from=follower`. Record if reads still work.
3. Promote the follower: `docker compose exec redis-replica redis-cli REPLICAOF NO ONE`
4. Set `REDIS_LEADER_HOST=redis-replica` for the three app services. Run `docker compose up -d app1 app2 app3`.
5. Run `docker compose restart nginx` (see Known problems).
6. Send a post. **Expected result:** success.
7. Run `docker compose start redis`. Now two nodes are leaders.
8. Make the old leader a follower: `docker compose exec redis redis-cli REPLICAOF redis-replica 6379`
9. **Expected result:** the old leader has all the posts.

### Part 5: Notes

I write my answers in `NOTES.md`:

1. Why did Part 1 show different counts?
2. When `app2` stopped, did any request fail? Which Nginx behavior caused this result?
3. In Part 3, step 5, which guarantee did the follower violate?
4. What do the offset values in `INFO replication` show?
5. Did Redis do a partial resync or a full resync in Part 3, step 9? Why?
6. Redis replication is asynchronous. If the leader stops just after a post, can that post be lost? Why?
7. In Part 4, which step prevented split brain? What can occur if nobody does that step?

## Known problems

- **Nginx and changed IP addresses:** open-source Nginx finds the IP addresses of `app1` to `app3` only when it starts. If Docker gives a container a new IP address (for example, after `up -d` makes the container again), Nginx sends requests to the old address and returns 502 errors. Restart Nginx after you make the app containers again. This is a small service-discovery problem.
- **Replica reads during a full resync:** the replica can return old data or an error during a full resync. Record the behavior.

## Concepts that this project shows

| Part | Concept |
|---|---|
| 1, 2 | Local state versus shared state. Stateless services. |
| 3 | Single-leader replication. Log position (replication offset). Replication lag. Read-your-writes. Catch-up recovery. |
| 4 | Failover (detect, choose, reconfigure). Lost writes with asynchronous replication. Split brain. |

## Exit criteria

1. All four parts operate.
2. `NOTES.md` has answers to all seven questions.
3. I can explain each failure with a replication concept.