const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

/* =========================
   HTTP SERVER
========================= */

const httpServer = http.createServer((req, res) => {

  let filePath;

  if (req.url === "/" || req.url === "/index.html") {
    filePath = path.join(__dirname, "index.html");
  } else {
    filePath = path.join(__dirname, req.url.split("?")[0]);
  }

  /* Security: prevent ../ access */
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {

    if (error) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon"
    };

    res.writeHead(200, {
      "Content-Type":
        contentTypes[ext] || "application/octet-stream"
    });

    res.end(data);
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
   ROOM CLEANUP
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
   SEND TO OTHER PERSON
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

  console.log(
    "New phone connected"
  );

  socket.room = null;


  /* =========================
     MESSAGE
  ========================= */

  socket.on("message", rawData => {

    let message;

    try {

      message = JSON.parse(
        rawData.toString()
      );

    } catch (error) {

      console.log(
        "Invalid JSON message"
      );

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


      /* Tell the first phone that the second phone joined */

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
       CHECK ROOM
    ========================= */

    const room = socket.room;

    if (
      !room ||
      !rooms.has(room)
    ) {

      return;

    }


    /* =========================
       RELAY
    ========================= */

    sendToOthers(
      room,
      socket,
      message
    );


    /* =========================
       CHAT LOG
    ========================= */

    if (message.type === "chat") {

      console.log(
        "Chat:",
        room,
        message.message
      );

    }


    /* =========================
       CALL LOG
    ========================= */

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


    /* =========================
       COUPLE SPACE
    ========================= */

    if (
      message.type === "couple-date"
    ) {

      console.log(
        "Couple date:",
        room,
        message.date
      );

    }


    if (
      message.type === "our-story"
    ) {

      console.log(
        "Our Story updated:",
        room
      );

    }


    if (
      message.type === "memory"
    ) {

      console.log(
        "Memory added:",
        room
      );

    }


    if (
      message.type === "favorite"
    ) {

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

    console.log(
      "Phone disconnected"
    );

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
      "Dujon server started on port " +
      PORT
    );

    console.log(
      "Server listening on port " +
      PORT
    );

  }
);