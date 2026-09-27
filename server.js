const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = new WebSocket.Server({
  port: PORT
});

const rooms = new Map();

console.log("Dujon server started on port " + PORT);


/* ===============================
   REMOVE CLIENT FROM ROOM
================================ */

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


  /* অন্য ফোনকে জানানো */

  clients.forEach(client => {

    if (
      client.readyState === WebSocket.OPEN
    ) {

      client.send(
        JSON.stringify({
          type: "peer-left"
        })
      );

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


/* ===============================
   NEW CONNECTION
================================ */

server.on("connection", socket => {

  console.log(
    "New phone connected"
  );

  socket.room = null;


  socket.on("message", rawData => {

    let message;

    try {

      message =
        JSON.parse(
          rawData.toString()
        );

    } catch {

      return;

    }


    /* ===========================
       JOIN ROOM
    ============================ */

    if (message.type === "join") {

      const room =
        String(
          message.room || ""
        ).trim();


      if (!/^\d{6}$/.test(room)) {

        socket.send(
          JSON.stringify({
            type: "error",
            message: "ভুল Room Code"
          })
        );

        return;

      }


      /*
        যদি এই socket আগে থেকেই
        অন্য Room-এ থাকে,
        আগে সেটি remove করা হবে।
      */

      if (socket.room) {

        removeFromRoom(socket);

      }


      let clients =
        rooms.get(room);


      if (!clients) {

        clients = new Set();

        rooms.set(
          room,
          clients
        );

      }


      /*
        একই socket যেন
        একই Room-এ দ্বিতীয়বার
        যোগ না হয়।
      */

      if (clients.has(socket)) {

        socket.send(
          JSON.stringify({
            type: "joined",
            room: room
          })
        );

        return;

      }


      /*
        Room already full
      */

      if (clients.size >= 2) {

        socket.send(
          JSON.stringify({

            type: "error",

            message:
              "এই Room ইতিমধ্যে পূর্ণ।"

          })
        );

        return;

      }


      /* Room-এ যোগ */

      clients.add(socket);

      socket.room = room;


      console.log(
        "Phone joined room:",
        room,
        "Users:",
        clients.size
      );


      socket.send(
        JSON.stringify({

          type: "joined",

          room: room

        })
      );


      /*
        অন্য ফোনকে জানানো
      */

      clients.forEach(client => {

        if (
          client !== socket &&
          client.readyState ===
          WebSocket.OPEN
        ) {

          client.send(
            JSON.stringify({
              type: "peer-joined"
            })
          );

        }

      });


      return;

    }


    /* ===========================
       ROOM MESSAGE
    ============================ */

    const room =
      socket.room;


    if (
      !room ||
      !rooms.has(room)
    ) {

      return;

    }


    const clients =
      rooms.get(room);


    /*
      Chat + Video signaling
      সব message অন্য ফোনে যাবে।
    */

    clients.forEach(client => {

      if (
        client !== socket &&
        client.readyState ===
        WebSocket.OPEN
      ) {

        client.send(
          JSON.stringify(message)
        );

      }

    });


    /* Server log */

    if (message.type === "chat") {

      console.log(
        "Chat:",
        room,
        message.message
      );

    }

    if (message.type === "video-call") {

      console.log(
        "Video call:",
        room
      );

    }

  });


  /* ===============================
     DISCONNECT
  ================================ */

  socket.on("close", () => {

    console.log(
      "Phone disconnected"
    );

    removeFromRoom(socket);

  });


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