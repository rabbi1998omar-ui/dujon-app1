const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const ROOT = __dirname;

/* =========================
   MIME TYPES
========================= */

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};


/* =========================
   HTTP SERVER
========================= */

const httpServer = http.createServer((req, res) => {

  let requestPath = req.url.split("?")[0];

  if (requestPath === "/") {
    requestPath = "/index.html";
  }

  const filePath = path.join(
    ROOT,
    decodeURIComponent(requestPath)
  );

  /* Security check */
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {

    if (statError || !stats.isFile()) {

      /* Browser/API health check */
      if (requestPath === "/health") {

        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("Dujon Server OK");
        return;
      }

      res.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8"
      });

      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Dujon</title>
        </head>
        <body>
          <h1>Not Found</h1>
          <p>Dujon server is running.</p>
        </body>
        </html>
      `);

      return;
    }

    fs.readFile(filePath, (error, data) => {

      if (error) {

        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("Server Error");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();

      res.writeHead(200, {
        "Content-Type":
          contentTypes[ext] ||
          "application/octet-stream"
      });

      res.end(data);

    });

  });

});


/* =========================
   WEBSOCKET SERVER
========================= */

const wsServer = new WebSocket.Server({
  server: httpServer
});

const rooms = new Map();

console.log("Dujon server starting...");


/* =========================
   REMOVE FROM ROOM
========================= */

function removeFromRoom(socket) {

  const room = socket.room;

  if (!room) return;

  const clients = rooms.get(room);

  if (!clients) {
    socket.room = null;
    return;
  }

  clients.delete(socket);

  console.log(
    "Phone left room:",
    room,
    "Users:",
    clients.size
  );

  clients.forEach(client => {

    if (client.readyState === WebSocket.OPEN) {

      client.send(JSON.stringify({
        type: "peer-left"
      }));

    }

  });

  if (clients.size === 0) {

    rooms.delete(room);

    console.log(
      "Room deleted:",
      room
    );

  }

  socket.room = null;
}


/* =========================
   SEND TO OTHER PHONE
========================= */

function sendToOthers(room, sender, message) {

  const clients = rooms.get(room);

  if (!clients) return;

  clients.forEach(client => {

    if (
      client !== sender &&
      client.readyState === WebSocket.OPEN
    ) {

      client.send(
        JSON.stringify(message)
      );

    }

  });

}


/* =========================
   WEBSOCKET CONNECTION
========================= */

wsServer.on("connection", socket => {

  console.log("New phone connected");

  socket.room = null;


  socket.on("message", rawData => {

    let message;

    try {

      message = JSON.parse(
        rawData.toString()
      );

    } catch (error) {

      console.log("Invalid JSON message");

      return;
    }


    /* =========================
       JOIN ROOM
    ========================= */

    if (message.type === "join") {

      const room = String(
        message.room || ""
      ).trim();


      if (!/^\d{6}$/.test(room)) {

        socket.send(JSON.stringify({
          type: "error",
          message: "ভুল Room Code"
        }));

        return;
      }


      if (socket.room) {
        removeFromRoom(socket);
      }


      let clients = rooms.get(room);


      if (!clients) {

        clients = new Set();

        rooms.set(
          room,
          clients
        );

      }


      if (clients.size >= 2) {

        socket.send(JSON.stringify({
          type: "error",
          message: "এই Room ইতিমধ্যে পূর্ণ।"
        }));

        return;
      }


      clients.add(socket);

      socket.room = room;


      console.log(
        "Phone joined room:",
        room,
        "Users:",
        clients.size
      );


      socket.send(JSON.stringify({
        type: "joined",
        room: room
      }));


      /* দ্বিতীয় ফোন ঢুকলে প্রথম ফোনকে জানানো */

      clients.forEach(client => {

        if (
          client !== socket &&
          client.readyState === WebSocket.OPEN
        ) {

          client.send(JSON.stringify({
            type: "peer-joined"
          }));

        }

      });

      return;
    }


    /* =========================
       ROOM CHECK
    ========================= */

    const room = socket.room;

    if (
      !room ||
      !rooms.has(room)
    ) {

      return;
    }


    /* =========================
       RELAY MESSAGE
    ========================= */

    sendToOthers(
      room,
      socket,
      message
    );


    /* =========================
       LOGS
    ========================= */

    if (message.type === "chat") {

      console.log(
        "Chat:",
        room,
        message.message
      );

    }


    if (
      message.type === "video-call" ||
      message.type === "audio-call"
    ) {

      console.log(
        "Call:",
        room,
        message.action
      );

    }


    if (message.type === "couple-date") {

      console.log(
        "Couple date:",
        room,
        message.date
      );

    }


    if (message.type === "our-story") {

      console.log(
        "Our Story updated:",
        room
      );

    }


    if (message.type === "memory") {

      console.log(
        "Memory added:",
        room
      );

    }


    if (message.type === "favorite") {

      console.log(
        "Favorite moment:",
        room
      );

    }

  });


  /* =========================
     CLOSE
  ========================= */

  socket.on("close", () => {

    console.log("Phone disconnected");

    removeFromRoom(socket);

  });


  /* =========================
     ERROR
  ========================= */

  socket.on("error", error => {

    console.log(
      "Socket error:",
      error.message
    );

    removeFromRoom(socket);

  });

});


/* =========================
   START SERVER
========================= */

httpServer.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "Dujon server started on port " + PORT
    );

    console.log(
      "Server listening on port " + PORT
    );

  }
);