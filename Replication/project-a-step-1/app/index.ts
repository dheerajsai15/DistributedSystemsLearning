import express from "express";
import os from "os";

const app = express();

let count = 0;

app.get("/count/local", (req, res) => {
  count = count + 1;
  res.json({
    instance: os.hostname(),
    count
  });
})

app.listen(process.env.PORT || 3000, () => {
  console.log(os.hostname() + " " + process.env.PORT || 3000)
})