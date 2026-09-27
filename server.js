const WebSocket = require("ws");

const server = new WebSocket.Server({
  port: 8080
});

const rooms = new Map();

console.log("Dujon server started on port 8080");

server.on("connection", (socket) => {

  let currentRoom = null;

  socket.on("message", (data) => {

    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Room join
    if (message.type === "join") {

      const room = String(message.room || "").trim();

      if (!room || room.length !== 6) {
        socket.send(JSON.stringify({
          type: "error",
          message: "ভুল Room Code"
        }));
        return;
      }

      currentRoom = room;

      if (!rooms.has(room)) {
        rooms.set(room, new Set());
      }

      const clients = rooms.get(room);

      if (clients.size >= 2) {
        socket.send(JSON.stringify({
          type: "error",
          message: "এই Room ইতিমধ্যে পূর্ণ।"
        }));
        currentRoom = null;
        return;
      }

      clients.add(socket);

      socket.send(JSON.stringify({
        type: "joined",
        room: room
      }));

      // অন্য ফোনকে জানানো
      clients.forEach((client) => {

        if (client !== socket &&
            client.readyState === WebSocket.OPEN) {

          client.send(JSON.stringify({
            type: "peer-joined"
          }));

        }

      });

      return;
    }


    // Room-এর অন্য ফোনে message পাঠানো
    if (currentRoom && rooms.has(currentRoom)) {

      const clients = rooms.get(currentRoom);

      clients.forEach((client) => {

        if (client !== socket &&
            client.readyState === WebSocket.OPEN) {

          client.send(JSON.stringify(message));

        }

      });

    }

  });


  socket.on("close", () => {

    if (!currentRoom) return;

    const clients = rooms.get(currentRoom);

    if (!clients) return;

    clients.delete(socket);

    clients.forEach((client) => {

      if (client.readyState === WebSocket.OPEN) {

        client.send(JSON.stringify({
          type: "peer-left"
        }));

      }

    });

    if (clients.size === 0) {
      rooms.delete(currentRoom);
    }

  });

});