const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = new WebSocket.Server({
  port: PORT
});

const rooms = new Map();

console.log("Dujon server started on port " + PORT);


/* =========================
   CONNECTION
========================= */

server.on("connection", (socket) => {

  let currentRoom = null;

  console.log("New phone connected");


  /* =========================
     MESSAGE
  ========================= */

  socket.on("message", (data) => {

    let message;

    try {

      message = JSON.parse(
        data.toString()
      );

    } catch (error) {

      console.log("Invalid JSON");

      return;

    }


    /* =========================
       JOIN ROOM
    ========================= */

    if (message.type === "join") {

      const room =
        String(
          message.room || ""
        ).trim();


      /* Room code check */

      if (!/^\d{6}$/.test(room)) {

        socket.send(
          JSON.stringify({
            type: "error",
            message: "ভুল Room Code"
          })
        );

        return;
      }


      /* আগের Room থাকলে বের করে দাও */

      if (currentRoom) {

        removeFromRoom(
          socket,
          currentRoom
        );

      }


      /* Room তৈরি */

      if (!rooms.has(room)) {

        rooms.set(
          room,
          new Set()
        );

      }


      const clients =
        rooms.get(room);


      /* Room full */

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


      /* Room set */

      currentRoom = room;

      clients.add(socket);


      /* Join confirmation */

      socket.send(
        JSON.stringify({

          type: "joined",

          room: room

        })
      );


      console.log(
        "Phone joined room:",
        room,
        "Users:",
        clients.size
      );


      /* অন্য ফোনকে জানানো */

      clients.forEach(
        (client) => {

          if (
            client !== socket &&
            client.readyState ===
              WebSocket.OPEN
          ) {

            client.send(
              JSON.stringify({

                type:
                  "peer-joined"

              })
            );

          }

        }
      );


      return;

    }


    /* =========================
       CHAT MESSAGE
    ========================= */

    if (message.type === "chat") {

      if (!currentRoom) {

        socket.send(
          JSON.stringify({

            type: "error",

            message:
              "আগে একটি Room-এ প্রবেশ করো।"

          })
        );

        return;

      }


      if (
        !rooms.has(currentRoom)
      ) {

        return;

      }


      const clients =
        rooms.get(currentRoom);


      const text =
        String(
          message.text || ""
        ).trim();


      if (!text) {

        return;

      }


      console.log(
        "Chat:",
        currentRoom,
        text
      );


      /* শুধুমাত্র অন্য ফোনে পাঠাবে */

      clients.forEach(
        (client) => {

          if (
            client !== socket &&
            client.readyState ===
              WebSocket.OPEN
          ) {

            client.send(
              JSON.stringify({

                type: "chat",

                text: text

              })
            );

          }

        }
      );


      return;

    }


    /* =========================
       অন্য WebSocket message
    ========================= */

    if (
      currentRoom &&
      rooms.has(currentRoom)
    ) {

      const clients =
        rooms.get(currentRoom);


      clients.forEach(
        (client) => {

          if (
            client !== socket &&
            client.readyState ===
              WebSocket.OPEN
          ) {

            client.send(
              JSON.stringify(message)
            );

          }

        }
      );

    }

  });


  /* =========================
     DISCONNECT
  ========================= */

  socket.on("close", () => {

    console.log(
      "Phone disconnected"
    );


    if (currentRoom) {

      removeFromRoom(
        socket,
        currentRoom
      );

      currentRoom = null;

    }

  });


  /* =========================
     ERROR
  ========================= */

  socket.on("error", (error) => {

    console.log(
      "WebSocket error:",
      error.message
    );

  });

});


/* =========================
   REMOVE FROM ROOM
========================= */

function removeFromRoom(
  socket,
  room
) {

  if (!rooms.has(room)) {

    return;

  }


  const clients =
    rooms.get(room);


  clients.delete(socket);


  /* অন্য ফোনকে জানানো */

  clients.forEach(
    (client) => {

      if (
        client.readyState ===
        WebSocket.OPEN
      ) {

        client.send(
          JSON.stringify({

            type:
              "peer-left"

          })
        );

      }

    }
  );


  /* Room খালি হলে delete */

  if (clients.size === 0) {

    rooms.delete(room);

    console.log(
      "Room deleted:",
      room
    );

  }

}