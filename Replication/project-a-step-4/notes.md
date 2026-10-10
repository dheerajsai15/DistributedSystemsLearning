1. Why did Part 1 show different counts?
As the requests are handle by round robin bw servers, and the request increments the count of the inmemory variable of particular process,
this makes the server stateful and the answer depends on which server handles the reqeust.
2. When `app2` stopped, did any request fail? Which Nginx behavior caused this result?
No request fails. After the request to app 2 times out, the Nginx automatically fails over to the next healthy server. 
3. In Part 3, step 5, which guarantee did the follower violate?
Read your writes
4. What do the offset values in `INFO replication` show?
The count of bytes executed on the current node
5. Did Redis do a partial resync or a full resync in Part 3, step 9? Why?
Full resync as the leader dint know the new history id of follower and now the latest replid will be send to leader hence full resync happens
6. Redis replication is asynchronous. If the leader stops just after a post, can that post be lost? Why?
Yes, the post can be lost when the master goes down before the replica recieves the post
7. In Part 4, which step prevented split brain? What can occur if nobody does that step?
configure the old leader to be replice of new leader, if that does not happen two leader can accpet write creating divergence and data loss