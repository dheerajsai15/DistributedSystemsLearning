1. Why did Part 1 show different counts?
As the requests are handle by round robin bw servers, and the request increments the count of the inmemory variable of particular process,
this makes the server stateful and the answer depends on which server handles the reqeust.
2. When `app2` stopped, did any request fail? Which Nginx behavior caused this result?
3. In Part 3, step 5, which guarantee did the follower violate?
4. What do the offset values in `INFO replication` show?
5. Did Redis do a partial resync or a full resync in Part 3, step 9? Why?
6. Redis replication is asynchronous. If the leader stops just after a post, can that post be lost? Why?
7. In Part 4, which step prevented split brain? What can occur if nobody does that step?