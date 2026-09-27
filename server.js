const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = new WebSocket.Server({
  port: PORT
});

const rooms = new Map();

console.log("Dujon server started on port " + PORT);


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
    console.log("Room deleted:", room);
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
      client.send(JSON.stringify(message));
    }
  });
}


/* =========================
   CONNECTION
========================= */

server.on("connection", socket => {

  console.log("New phone connected");

  socket.room = null;


  /* =========================
     MESSAGE
  ========================= */

  socket.on("message", rawData => {

    let message;

    try {
      message = JSON.parse(rawData.toString());
    } catch {
      return;
    }


    /* =========================
       JOIN ROOM
    ========================= */

    if (message.type === "join") {

      const room = String(message.room || "").trim();

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

        rooms.set(room, clients);
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

    if (!room || !rooms.has(room)) {
      return;
    }


    /* =========================
       NORMAL RELAY
    ========================= */

    sendToOthers(room, socket, message);


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


console.log(
  "Server listening on port " + PORT
);