const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, "users.json");

/* =====================================================
   DATABASE
===================================================== */

let db = {
  users: {}
};

function loadDatabase() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      db = { users: {} };

      fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(db, null, 2)
      );

      return;
    }

    const text = fs.readFileSync(
      USERS_FILE,
      "utf8"
    );

    if (!text.trim()) {
      db = { users: {} };
      return;
    }

    const parsed = JSON.parse(text);

    if (
      parsed &&
      parsed.users &&
      typeof parsed.users === "object"
    ) {
      db = parsed;
    } else {
      db = { users: {} };
    }

  } catch (error) {

    console.log(
      "Database load error:",
      error.message
    );

    db = { users: {} };
  }
}

function saveDatabase() {
  try {

    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(db, null, 2)
    );

    return true;

  } catch (error) {

    console.log(
      "Database save error:",
      error.message
    );

    return false;
  }
}

function hashPin(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function getUserByPhone(phone) {

  const target =
    String(phone || "").trim();

  return Object.values(
    db.users
  ).find(
    user =>
      String(user.phone || "").trim() ===
      target
  );
}

function getUserByUsername(username) {

  const target =
    normalizeUsername(username);

  return Object.values(
    db.users
  ).find(
    user =>
      normalizeUsername(
        user.username
      ) === target
  );
}

function ensureArrays(user) {

  if (!user) return;

  if (!Array.isArray(user.friends)) {
    user.friends = [];
  }

  if (!Array.isArray(user.requests)) {
    user.requests = [];
  }
}

function publicUser(user) {

  if (!user) return null;

  ensureArrays(user);

  return {
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
    friends: [...user.friends],
    requests: [...user.requests]
  };
}

loadDatabase();

console.log(
  "Dujon users:",
  Object.keys(db.users).length
);

/* =====================================================
   HTTP HELPERS
===================================================== */

function sendJSON(
  res,
  status,
  data
) {

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type"
    }
  );

  res.end(
    JSON.stringify(data)
  );
}

function readBody(req) {

  return new Promise(
    (resolve, reject) => {

      let body = "";

      req.on(
        "data",
        chunk => {

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
        }
      );

      req.on(
        "end",
        () => {

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
        }
      );

      req.on(
        "error",
        reject
      );
    }
  );
}

/* =====================================================
   MIME TYPES
===================================================== */

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

/* =====================================================
   HTTP SERVER
===================================================== */

const httpServer =
  http.createServer(
    async (req, res) => {

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      /* =================================================
         OPTIONS
      ================================================= */

      if (
        req.method === "OPTIONS"
      ) {

        res.writeHead(
          204,
          {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET, POST, OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        );

        res.end();

        return;
      }

      /* =================================================
         HEALTH
      ================================================= */

      if (
        url.pathname === "/health"
      ) {

        sendJSON(
          res,
          200,
          {
            ok: true,
            server: "Dujon",
            users:
              Object.keys(
                db.users
              ).length,
            message:
              "Dujon Server OK"
          }
        );

        return;
      }

      /* =================================================
         PROFILE
      ================================================= */

      if (
        url.pathname === "/api/profile" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const username =
            normalizeUsername(
              body.username
            );

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
            getUserByPhone(phone);

          const usernameOwner =
            getUserByUsername(username);

          if (
            usernameOwner &&
            (
              !oldUser ||
              String(
                usernameOwner.phone
              ) !== phone
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

          /* ---------------------------------------------
             USERNAME CHANGE
          --------------------------------------------- */

          if (
            oldUser &&
            normalizeUsername(
              oldUser.username
            ) !== username
          ) {

            const oldUsername =
              oldUser.username;

            delete db.users[
              oldUsername
            ];

            Object.values(
              db.users
            ).forEach(
              otherUser => {

                ensureArrays(
                  otherUser
                );

                otherUser.friends =
                  otherUser.friends.map(
                    item =>
                      normalizeUsername(
                        item
                      ) ===
                      normalizeUsername(
                        oldUsername
                      )
                        ? username
                        : item
                  );

                otherUser.requests =
                  otherUser.requests.map(
                    item =>
                      normalizeUsername(
                        item
                      ) ===
                      normalizeUsername(
                        oldUsername
                      )
                        ? username
                        : item
                  );
              }
            );
          }

          /* ---------------------------------------------
             CREATE / UPDATE USER
          --------------------------------------------- */

          const user = {

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

          db.users[username] =
            user;

          const saved =
            saveDatabase();

          console.log(
            "PROFILE SAVED:",
            username,
            phone,
            "Total users:",
            Object.keys(
              db.users
            ).length
          );

          sendJSON(
            res,
            200,
            {
              ok: true,
              saved: saved,
              user:
                publicUser(user)
            }
          );

          return;

        } catch (error) {

          console.log(
            "Profile error:",
            error
          );

          sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                error.message
            }
          );

          return;
        }
      }

      /* =================================================
         SEARCH USER
      ================================================= */

      if (
        url.pathname === "/api/search" &&
        req.method === "GET"
      ) {

        const username =
          normalizeUsername(
            url.searchParams.get(
              "username"
            )
          );

        const user =
          getUserByUsername(
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

      /* =================================================
         SOCIAL
      ================================================= */

      if (
        url.pathname === "/api/social" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const user =
            getUserByPhone(phone);

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

          ensureArrays(user);

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

      /* =================================================
         FRIEND REQUEST
      ================================================= */

      if (
        url.pathname ===
          "/api/friend-request" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const targetUsername =
            normalizeUsername(
              body.username
            );

          const sender =
            getUserByPhone(phone);

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

          const target =
            getUserByUsername(
              targetUsername
            );

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
            normalizeUsername(
              sender.username
            ) ===
            normalizeUsername(
              target.username
            )
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

          ensureArrays(sender);
          ensureArrays(target);

          const alreadyFriend =
            sender.friends.some(
              item =>
                normalizeUsername(
                  item
                ) ===
                normalizeUsername(
                  target.username
                )
            );

          if (
            alreadyFriend
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

          const alreadyRequested =
            target.requests.some(
              item =>
                normalizeUsername(
                  item
                ) ===
                normalizeUsername(
                  sender.username
                )
            );

          if (
            alreadyRequested
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

          saveDatabase();

          console.log(
            "FRIEND REQUEST:",
            sender.username,
            "->",
            target.username
          );

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

          console.log(
            "Friend request error:",
            error
          );

          sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Friend request পাঠাতে সমস্যা হয়েছে।"
            }
          );

          return;
        }
      }

      /* =================================================
         ACCEPT FRIEND
      ================================================= */

      if (
        url.pathname ===
          "/api/friend-accept" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const requesterUsername =
            normalizeUsername(
              body.username
            );

          const receiver =
            getUserByPhone(phone);

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

          ensureArrays(receiver);

          /* ---------------------------------------------
             FIND REQUESTER
          --------------------------------------------- */

          const requester =
            getUserByUsername(
              requesterUsername
            );

          if (!requester) {

            console.log(
              "REQUESTER NOT FOUND:",
              requesterUsername
            );

            console.log(
              "AVAILABLE USERS:",
              Object.keys(
                db.users
              )
            );

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

          ensureArrays(requester);

          /* ---------------------------------------------
             CHECK REQUEST
          --------------------------------------------- */

          const requestIndex =
            receiver.requests.findIndex(
              item =>
                normalizeUsername(
                  item
                ) ===
                normalizeUsername(
                  requester.username
                )
            );

          if (
            requestIndex === -1
          ) {

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

          /* ---------------------------------------------
             REMOVE REQUEST
          --------------------------------------------- */

          receiver.requests.splice(
            requestIndex,
            1
          );

          /* ---------------------------------------------
             ADD FRIEND TO RECEIVER
          --------------------------------------------- */

          const receiverHasRequester =
            receiver.friends.some(
              item =>
                normalizeUsername(
                  item
                ) ===
                normalizeUsername(
                  requester.username
                )
            );

          if (
            !receiverHasRequester
          ) {

            receiver.friends.push(
              requester.username
            );
          }

          /* ---------------------------------------------
             ADD FRIEND TO REQUESTER
          --------------------------------------------- */

          const requesterHasReceiver =
            requester.friends.some(
              item =>
                normalizeUsername(
                  item
                ) ===
                normalizeUsername(
                  receiver.username
                )
            );

          if (
            !requesterHasReceiver
          ) {

            requester.friends.push(
              receiver.username
            );
          }

          saveDatabase();

          console.log(
            "FRIEND ACCEPTED:",
            receiver.username,
            "<->",
            requester.username
          );

          sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Friend হয়েছে ❤️",
              user:
                publicUser(receiver)
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

      /* =================================================
         REJECT FRIEND
      ================================================= */

      if (
        url.pathname ===
          "/api/friend-reject" &&
        req.method === "POST"
      ) {

        try {

          const body =
            await readBody(req);

          const phone =
            String(
              body.phone || ""
            ).trim();

          const pin =
            String(
              body.pin || ""
            ).trim();

          const requesterUsername =
            normalizeUsername(
              body.username
            );

          const receiver =
            getUserByPhone(phone);

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

          ensureArrays(receiver);

          receiver.requests =
            receiver.requests.filter(
              item =>
                normalizeUsername(
                  item
                ) !==
                requesterUsername
            );

          saveDatabase();

          sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Friend request rejected।",
              user:
                publicUser(receiver)
            }
          );

          return;

        } catch (error) {

          console.log(
            "Reject error:",
            error
          );

          sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Request reject করতে সমস্যা হয়েছে।"
            }
          );

          return;
        }
      }

      /* =================================================
         STATIC FILES
      ================================================= */

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
<html lang="bn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
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
              data
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

              res.end(data);
            }
          );
        }
      );
    }
  );

/* =====================================================
   WEBSOCKET SERVER
===================================================== */

const wsServer =
  new WebSocket.Server({
    server: httpServer
  });

const rooms = new Map();

console.log(
  "Dujon WebSocket starting..."
);

/* =====================================================
   REMOVE ROOM
===================================================== */

function removeFromRoom(socket) {

  const room =
    socket.room;

  if (!room) {
    return;
  }

  const clients =
    rooms.get(room);

  if (!clients) {

    socket.room = null;

    return;
  }

  clients.delete(socket);

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

    rooms.delete(room);
  }

  socket.room = null;
}

/* =====================================================
   SEND TO OTHER CLIENT
===================================================== */

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

/* =====================================================
   WEBSOCKET CONNECTION
===================================================== */

wsServer.on(
  "connection",
  socket => {

    console.log(
      "Phone connected"
    );

    socket.room = null;

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

        /* =============================================
           JOIN ROOM
        ============================================= */

        if (
          message.type ===
          "join"
        ) {

          const room =
            String(
              message.room || ""
            ).trim();

          if (
            !/^\d{6}$/.test(room)
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
            rooms.get(room);

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
              room:
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

        /* =============================================
           OTHER ROOM MESSAGES
        ============================================= */

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

        /* =============================================
           LOGS
        ============================================= */

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

/* =====================================================
   START SERVER
===================================================== */

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

    console.log(
      "Users loaded:",
      Object.keys(
        db.users
      ).length
    );
  }
);