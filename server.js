const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, "users.json");

/* =========================
   DATABASE
========================= */

function loadDB() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return { users: {} };
    }

    return JSON.parse(
      fs.readFileSync(USERS_FILE, "utf8")
    );
  } catch (error) {
    console.log("Database error:", error.message);
    return { users: {} };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.log("Save database error:", error.message);
  }
}

function hashPin(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

/* =========================
   HTTP HELPERS
========================= */

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type"
  });

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {

    let body = "";

    req.on("data", chunk => {

      body += chunk.toString();

      if (
        body.length >
        1024 * 1024
      ) {

        reject(
          new Error(
            "Request too large"
          )
        );

        req.destroy();
      }
    });

    req.on("end", () => {

      if (!body) {
        resolve({});
        return;
      }

      try {

        resolve(
          JSON.parse(body)
        );

      } catch {

        reject(
          new Error(
            "Invalid JSON"
          )
        );
      }
    });

    req.on("error", reject);
  });
}

function getUserByPhone(
  data,
  phone
) {

  return Object.values(
    data.users
  ).find(
    user =>
      String(user.phone) ===
      String(phone)
  );
}

function findUserByUsername(
  data,
  username
) {

  const target =
    String(
      username || ""
    )
      .trim()
      .toLowerCase();

  return Object.values(
    data.users
  ).find(
    user =>
      String(
        user.username || ""
      )
        .trim()
        .toLowerCase() ===
      target
  );
}

function publicUser(user) {

  if (!user) {
    return null;
  }

  return {

    username:
      user.username || "",

    name:
      user.name || "",

    photo:
      user.photo || "",

    friends:
      Array.isArray(user.friends)
        ? user.friends
        : [],

    requests:
      Array.isArray(user.requests)
        ? user.requests
        : []

  };
}

/* =========================
   MIME TYPES
========================= */

const mimeTypes = {

  ".html":
    "text/html; charset=utf-8",

  ".js":
    "application/javascript; charset=utf-8",

  ".css":
    "text/css; charset=utf-8",

  ".json":
    "application/json; charset=utf-8",

  ".png":
    "image/png",

  ".jpg":
    "image/jpeg",

  ".jpeg":
    "image/jpeg",

  ".webp":
    "image/webp",

  ".svg":
    "image/svg+xml",

  ".ico":
    "image/x-icon",

  ".txt":
    "text/plain; charset=utf-8"

};

/* =========================
   HTTP SERVER
========================= */

const httpServer =
  http.createServer(
    async (req, res) => {

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      /* =========================
         CORS
      ========================= */

      if (
        req.method ===
        "OPTIONS"
      ) {

        res.writeHead(204, {

          "Access-Control-Allow-Origin":
            "*",

          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",

          "Access-Control-Allow-Headers":
            "Content-Type"

        });

        res.end();

        return;
      }

      /* =========================
         HEALTH
      ========================= */

      if (
        url.pathname ===
        "/health"
      ) {

        sendJSON(
          res,
          200,
          {

            ok: true,

            server:
              "Dujon",

            message:
              "Dujon Server OK"

          }
        );

        return;
      }

      /* =========================
         PROFILE
      ========================= */

      if (
        url.pathname ===
          "/api/profile" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const data =
            loadDB();

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const username =
            String(
              body.username || ""
            )
              .trim()
              .toLowerCase();

          const name =
            String(
              body.name || ""
            ).trim();

          const photo =
            String(
              body.photo || ""
            ).trim();

          if (
            !phone ||
            !pin ||
            !username
          ) {

            sendJSON(
              res,
              400,
              {

                ok: false,

                message:
                  "Phone, PIN এবং Username প্রয়োজন।"

              }
            );

            return;
          }

          if (
            !/^[a-z0-9_]{3,20}$/
              .test(username)
          ) {

            sendJSON(
              res,
              400,
              {

                ok: false,

                message:
                  "Username 3-20 অক্ষরের হবে। শুধু a-z, 0-9 এবং _ ব্যবহার করুন।"

              }
            );

            return;
          }

          const oldUser =
            getUserByPhone(
              data,
              phone
            );

          const usernameOwner =
            findUserByUsername(
              data,
              username
            );

          if (
            usernameOwner &&
            (
              !oldUser ||
              String(
                usernameOwner.phone
              ) !== String(phone)
            )
          ) {

            sendJSON(
              res,
              409,
              {

                ok: false,

                message:
                  "এই Username ইতিমধ্যে নেওয়া হয়েছে।"

              }
            );

            return;
          }

          /* =========================
             USERNAME CHANGE
          ========================= */

          if (
            oldUser &&
            oldUser.username !==
              username
          ) {

            const oldUsername =
              oldUser.username;

            delete data.users[
              oldUsername
            ];

            Object.values(
              data.users
            ).forEach(user => {

              if (
                Array.isArray(
                  user.friends
                )
              ) {

                user.friends =
                  user.friends.map(
                    item =>
                      item ===
                      oldUsername
                        ? username
                        : item
                  );

              }

              if (
                Array.isArray(
                  user.requests
                )
              ) {

                user.requests =
                  user.requests.map(
                    item =>
                      item ===
                      oldUsername
                        ? username
                        : item
                  );

              }

            });

          }

          data.users[
            username
          ] = {

            username,

            phone,

            pinHash:
              oldUser?.pinHash ||
              hashPin(pin),

            name:
              name ||
              oldUser?.name ||
              "আমি",

            photo:
              photo ||
              oldUser?.photo ||
              "",

            friends:
              Array.isArray(
                oldUser?.friends
              )
                ? oldUser.friends
                : [],

            requests:
              Array.isArray(
                oldUser?.requests
              )
                ? oldUser.requests
                : []

          };

          saveDB(data);

          sendJSON(
            res,
            200,
            {

              ok: true,

              user:
                publicUser(
                  data.users[
                    username
                  ]
                )

            }
          );

          return;

        } catch (error) {

          sendJSON(
            res,
            400,
            {

              ok: false,

              message:
                error.message

            }
          );

          return;
        }
      }

      /* =========================
         SEARCH USER
      ========================= */

      if (
        url.pathname ===
          "/api/search" &&
        req.method === "GET"
      ) {

        const username =
          String(
            url.searchParams.get(
              "username"
            ) || ""
          )
            .trim()
            .toLowerCase();

        const data =
          loadDB();

        const user =
          findUserByUsername(
            data,
            username
          );

        if (!user) {

          sendJSON(
            res,
            404,
            {

              ok: false,

              message:
                "User পাওয়া যায়নি।"

            }
          );

          return;
        }

        sendJSON(
          res,
          200,
          {

            ok: true,

            user: {

              username:
                user.username,

              name:
                user.name || "",

              photo:
                user.photo || ""

            }

          }
        );

        return;
      }

      /* =========================
         SOCIAL
      ========================= */

      if (
        url.pathname ===
          "/api/social" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const data =
            loadDB();

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const user =
            getUserByPhone(
              data,
              phone
            );

          if (
            !user ||
            user.pinHash !==
              hashPin(pin)
          ) {

            sendJSON(
              res,
              401,
              {

                ok: false,

                message:
                  "Login তথ্য সঠিক নয়।"

              }
            );

            return;
          }

          sendJSON(
            res,
            200,
            {

              ok: true,

              user:
                publicUser(user)

            }
          );

          return;

        } catch (error) {

          sendJSON(
            res,
            400,
            {

              ok: false,

              message:
                error.message

            }
          );

          return;
        }
      }

      /* =========================
         FRIEND REQUEST
      ========================= */

      if (
        url.pathname ===
          "/api/friend-request" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const data =
            loadDB();

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const targetUsername =
            String(
              body.username || ""
            )
              .trim()
              .toLowerCase();

          const sender =
            getUserByPhone(
              data,
              phone
            );

          const target =
            findUserByUsername(
              data,
              targetUsername
            );

          if (
            !sender ||
            sender.pinHash !==
              hashPin(pin)
          ) {

            sendJSON(
              res,
              401,
              {

                ok: false,

                message:
                  "Login তথ্য সঠিক নয়।"

              }
            );

            return;
          }

          if (!target) {

            sendJSON(
              res,
              404,
              {

                ok: false,

                message:
                  "User পাওয়া যায়নি।"

              }
            );

            return;
          }

          if (
            String(
              sender.username
            ).toLowerCase() ===
            String(
              target.username
            ).toLowerCase()
          ) {

            sendJSON(
              res,
              400,
              {

                ok: false,

                message:
                  "নিজেকে Friend করা যাবে না।"

              }
            );

            return;
          }

          sender.friends =
            Array.isArray(
              sender.friends
            )
              ? sender.friends
              : [];

          target.friends =
            Array.isArray(
              target.friends
            )
              ? target.friends
              : [];

          target.requests =
            Array.isArray(
              target.requests
            )
              ? target.requests
              : [];

          if (
            sender.friends.some(
              name =>
                String(name)
                  .toLowerCase() ===
                String(
                  target.username
                ).toLowerCase()
            )
          ) {

            sendJSON(
              res,
              400,
              {

                ok: false,

                message:
                  "আপনারা ইতিমধ্যে Friends।"

              }
            );

            return;
          }

          if (
            target.requests.some(
              name =>
                String(name)
                  .toLowerCase() ===
                String(
                  sender.username
                ).toLowerCase()
            )
          ) {

            sendJSON(
              res,
              400,
              {

                ok: false,

                message:
                  "Friend request আগে থেকেই পাঠানো হয়েছে।"

              }
            );

            return;
          }

          target.requests.push(
            sender.username
          );

          saveDB(data);

          sendJSON(
            res,
            200,
            {

              ok: true,

              message:
                "Friend request পাঠানো হয়েছে।"

            }
          );

          return;

        } catch (error) {

          sendJSON(
            res,
            400,
            {

              ok: false,

              message:
                error.message

            }
          );

          return;
        }
      }

      /* =========================
         ACCEPT FRIEND
      ========================= */

      if (
        url.pathname ===
          "/api/friend-accept" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const data =
            loadDB();

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const requesterUsername =
            String(
              body.username || ""
            )
              .trim()
              .toLowerCase();

          /* =========================
             FIND RECEIVER
          ========================= */

          const receiver =
            getUserByPhone(
              data,
              phone
            );

          if (
            !receiver ||
            receiver.pinHash !==
              hashPin(pin)
          ) {

            sendJSON(
              res,
              401,
              {

                ok: false,

                message:
                  "Login তথ্য সঠিক নয়।"

              }
            );

            return;
          }

          /* =========================
             FIND REQUESTER
          ========================= */

          const requester =
            findUserByUsername(
              data,
              requesterUsername
            );

          if (!requester) {

            sendJSON(
              res,
              404,
              {

                ok: false,

                message:
                  "Friend request পাঠানো User পাওয়া যায়নি।"

              }
            );

            return;
          }

          /* =========================
             PREPARE ARRAYS
          ========================= */

          receiver.friends =
            Array.isArray(
              receiver.friends
            )
              ? receiver.friends
              : [];

          receiver.requests =
            Array.isArray(
              receiver.requests
            )
              ? receiver.requests
              : [];

          requester.friends =
            Array.isArray(
              requester.friends
            )
              ? requester.friends
              : [];

          /* =========================
             CHECK REQUEST
          ========================= */

          const hasRequest =
            receiver.requests.some(
              name =>
                String(name)
                  .trim()
                  .toLowerCase() ===
                requesterUsername
            );

          if (!hasRequest) {

            sendJSON(
              res,
              400,
              {

                ok: false,

                message:
                  "এই Friend request আর পাওয়া যাচ্ছে না।"

              }
            );

            return;
          }

          /* =========================
             REMOVE REQUEST
          ========================= */

          receiver.requests =
            receiver.requests.filter(
              name =>
                String(name)
                  .trim()
                  .toLowerCase() !==
                requesterUsername
            );

          /* =========================
             ADD FRIEND TO RECEIVER
          ========================= */

          const requesterAlreadyFriend =
            receiver.friends.some(
              name =>
                String(name)
                  .trim()
                  .toLowerCase() ===
                String(
                  requester.username
                )
                  .trim()
                  .toLowerCase()
            );

          if (
            !requesterAlreadyFriend
          ) {

            receiver.friends.push(
              requester.username
            );

          }

          /* =========================
             ADD FRIEND TO REQUESTER
          ========================= */

          const receiverAlreadyFriend =
            requester.friends.some(
              name =>
                String(name)
                  .trim()
                  .toLowerCase() ===
                String(
                  receiver.username
                )
                  .trim()
                  .toLowerCase()
            );

          if (
            !receiverAlreadyFriend
          ) {

            requester.friends.push(
              receiver.username
            );

          }

          /* =========================
             SAVE DATABASE
          ========================= */

          saveDB(data);

          sendJSON(
            res,
            200,
            {

              ok: true,

              message:
                "Friend হয়েছে ❤️",

              user:
                publicUser(
                  receiver
                )

            }
          );

          return;

        } catch (error) {

          console.log(
            "Friend accept error:",
            error
          );

          sendJSON(
            res,
            500,
            {

              ok: false,

              message:
                "Friend accept করতে সমস্যা হয়েছে।"

            }
          );

          return;
        }
      }

      /* =========================
         REJECT FRIEND
      ========================= */

      if (
        url.pathname ===
          "/api/friend-reject" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const data =
            loadDB();

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const requesterUsername =
            String(
              body.username || ""
            )
              .trim()
              .toLowerCase();

          const receiver =
            getUserByPhone(
              data,
              phone
            );

          if (
            !receiver ||
            receiver.pinHash !==
              hashPin(pin)
          ) {

            sendJSON(
              res,
              401,
              {

                ok: false,

                message:
                  "Login তথ্য সঠিক নয়।"

              }
            );

            return;
          }

          receiver.requests =
            Array.isArray(
              receiver.requests
            )
              ? receiver.requests
              : [];

          receiver.requests =
            receiver.requests.filter(
              name =>
                String(name)
                  .trim()
                  .toLowerCase() !==
                requesterUsername
            );

          saveDB(data);

          sendJSON(
            res,
            200,
            {

              ok: true,

              message:
                "Friend request rejected।",

              user:
                publicUser(
                  receiver
                )

            }
          );

          return;

        } catch (error) {

          sendJSON(
            res,
            400,
            {

              ok: false,

              message:
                error.message

            }
          );

          return;
        }
      }

      /* =========================
         STATIC FILES
      ========================= */

      let filePath;

      try {

        let requestedPath =
          decodeURIComponent(
            url.pathname
          );

        if (
          requestedPath === "/"
        ) {

          requestedPath =
            "/index.html";

        }

        filePath =
          path.resolve(
            ROOT,
            "." + requestedPath
          );

      } catch {

        res.writeHead(400);

        res.end(
          "Bad Request"
        );

        return;
      }

      if (
        filePath !== ROOT &&
        !filePath.startsWith(
          ROOT + path.sep
        )
      ) {

        res.writeHead(403);

        res.end(
          "Forbidden"
        );

        return;
      }

      fs.stat(
        filePath,
        (
          statError,
          stats
        ) => {

          if (
            statError ||
            !stats.isFile()
          ) {

            res.writeHead(
              404,
              {
                "Content-Type":
                  "text/html; charset=utf-8"
              }
            );

            res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>দুজন</title>
</head>
<body>
<h1>Not Found</h1>
<p>Dujon server is running.</p>
</body>
</html>
            `);

            return;
          }

          fs.readFile(
            filePath,
            (
              error,
              fileData
            ) => {

              if (error) {

                res.writeHead(
                  500,
                  {
                    "Content-Type":
                      "text/plain; charset=utf-8"
                  }
                );

                res.end(
                  "Server Error"
                );

                return;
              }

              const ext =
                path.extname(
                  filePath
                ).toLowerCase();

              res.writeHead(
                200,
                {
                  "Content-Type":
                    mimeTypes[ext] ||
                    "application/octet-stream"
                }
              );

              res.end(
                fileData
              );
            }
          );
        }
      );
    }
  );

/* =========================
   WEBSOCKET
========================= */

const wsServer =
  new WebSocket.Server({
    server: httpServer
  });

const rooms =
  new Map();

console.log(
  "Dujon WebSocket starting..."
);

/* =========================
   REMOVE ROOM
========================= */

function removeFromRoom(
  socket
) {

  const room =
    socket.room;

  if (!room) {
    return;
  }

  const clients =
    rooms.get(room);

  if (!clients) {

    socket.room =
      null;

    return;
  }

  clients.delete(
    socket
  );

  clients.forEach(
    client => {

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

  if (
    clients.size === 0
  ) {

    rooms.delete(
      room
    );

  }

  socket.room =
    null;
}

/* =========================
   SEND TO OTHER PHONE
========================= */

function sendToOthers(
  room,
  sender,
  message
) {

  const clients =
    rooms.get(room);

  if (!clients) {
    return;
  }

  clients.forEach(
    client => {

      if (
        client !== sender &&
        client.readyState ===
          WebSocket.OPEN
      ) {

        client.send(
          JSON.stringify(
            message
          )
        );

      }

    }
  );
}

/* =========================
   WEBSOCKET CONNECTION
========================= */

wsServer.on(
  "connection",
  socket => {

    console.log(
      "Phone connected"
    );

    socket.room =
      null;

    socket.on(
      "message",
      rawData => {

        let message;

        try {

          message =
            JSON.parse(
              rawData.toString()
            );

        } catch {

          socket.send(
            JSON.stringify({
              type:
                "error",
              message:
                "Invalid message"
            })
          );

          return;
        }

        /* =========================
           JOIN ROOM
        ========================= */

        if (
          message.type ===
          "join"
        ) {

          const room =
            String(
              message.room ||
              ""
            ).trim();

          if (
            !/^\d{6}$/.test(
              room
            )
          ) {

            socket.send(
              JSON.stringify({

                type:
                  "error",

                message:
                  "ভুল Room Code"

              })
            );

            return;
          }

          if (
            socket.room
          ) {

            removeFromRoom(
              socket
            );

          }

          let clients =
            rooms.get(
              room
            );

          if (!clients) {

            clients =
              new Set();

            rooms.set(
              room,
              clients
            );

          }

          if (
            clients.size >= 2
          ) {

            socket.send(
              JSON.stringify({

                type:
                  "error",

                message:
                  "এই Room ইতিমধ্যে পূর্ণ।"

              })
            );

            return;
          }

          clients.add(
            socket
          );

          socket.room =
            room;

          socket.send(
            JSON.stringify({

              type:
                "joined",

              room

            })
          );

          clients.forEach(
            client => {

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
           ROOM MESSAGE
        ========================= */

        const room =
          socket.room;

        if (
          !room ||
          !rooms.has(room)
        ) {

          return;

        }

        sendToOthers(
          room,
          socket,
          message
        );

        /* =========================
           LOGS
        ========================= */

        if (
          message.type ===
          "chat"
        ) {

          console.log(
            "Chat:",
            room
          );

        }

        if (
          message.type ===
            "video-call" ||
          message.type ===
            "audio-call"
        ) {

          console.log(
            "Call:",
            room,
            message.action
          );

        }

        if (
          message.type ===
          "couple-date"
        ) {

          console.log(
            "Couple date:",
            room
          );

        }

        if (
          message.type ===
          "our-story"
        ) {

          console.log(
            "Our Story:",
            room
          );

        }

        if (
          message.type ===
          "memory"
        ) {

          console.log(
            "Memory:",
            room
          );

        }

        if (
          message.type ===
          "favorite"
        ) {

          console.log(
            "Favorite:",
            room
          );

        }

      }
    );

    socket.on(
      "close",
      () => {

        console.log(
          "Phone disconnected"
        );

        removeFromRoom(
          socket
        );

      }
    );

    socket.on(
      "error",
      error => {

        console.log(
          "Socket error:",
          error.message
        );

        removeFromRoom(
          socket
        );

      }
    );

  }
);

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