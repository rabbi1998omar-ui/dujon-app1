const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;

const DATA_FILE = path.join(__dirname, "users.json");

let users = {};

function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      users = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    } else {
      users = {};
      saveUsers();
    }
  } catch (error) {
    console.log("Load users error:", error);
    users = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(users, null, 2)
    );
  } catch (error) {
    console.log("Save users error:", error);
  }
}

loadUsers();

function hashPIN(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

function cleanUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function ensureArrays(user) {
  if (!Array.isArray(user.friends)) {
    user.friends = [];
  }

  if (!Array.isArray(user.requests)) {
    user.requests = [];
  }

  return user;
}

function findUserByUsername(username) {
  const target =
    cleanUsername(username);

  for (const phone of Object.keys(users)) {
    const user = users[phone];

    if (
      cleanUsername(user.username) ===
      target
    ) {
      return user;
    }
  }

  return null;
}

function findPhoneByUsername(username) {
  const target =
    cleanUsername(username);

  for (const phone of Object.keys(users)) {
    const user = users[phone];

    if (
      cleanUsername(user.username) ===
      target
    ) {
      return phone;
    }
  }

  return null;
}

function publicUser(user) {
  if (!user) return null;

  return {
    phone: user.phone || "",
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
    friends: Array.isArray(user.friends)
      ? user.friends
      : [],
    requests: Array.isArray(user.requests)
      ? user.requests
      : []
  };
}

function sendJSON(res, status, data) {
  const body =
    JSON.stringify(data);

  res.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type"
    }
  );

  res.end(body);
}

function readBody(req) {
  return new Promise(
    (resolve, reject) => {

      let body = "";

      req.on("data", chunk => {
        body += chunk;
      });

      req.on("end", () => {
        try {
          resolve(
            body
              ? JSON.parse(body)
              : {}
          );
        } catch (error) {
          reject(error);
        }
      });

      req.on("error", reject);
    }
  );
}


/* =========================================
   ONLINE USERS
========================================= */

const onlineUsers =
  new Map();


/* =========================================
   HTTP SERVER
========================================= */

const server =
  http.createServer(
    async (req, res) => {

      if (req.method === "OPTIONS") {
        res.writeHead(
          204,
          {
            "Access-Control-Allow-Origin":
              "*",
            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type"
          }
        );

        res.end();
        return;
      }


      /* ===============================
         REGISTER
      =============================== */

      if (
        req.method === "POST" &&
        req.url === "/api/register"
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
            cleanUsername(
              body.username
            );

          const name =
            String(
              body.name || "আমি"
            ).trim();

          const photo =
            String(
              body.photo || ""
            );

          if (!phone) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "মোবাইল নম্বর দিন"
              }
            );
          }

          if (
            !/^[0-9]{4,6}$/.test(pin)
          ) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "PIN ৪-৬ সংখ্যার হতে হবে"
              }
            );
          }

          if (
            !/^[a-z0-9_]{3,20}$/.test(
              username
            )
          ) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "Username 3-20 অক্ষরের হতে হবে"
              }
            );
          }


          if (users[phone]) {
            return sendJSON(
              res,
              409,
              {
                ok: false,
                message:
                  "এই মোবাইল নম্বরে Account আগে থেকেই আছে"
              }
            );
          }


          if (
            findUserByUsername(
              username
            )
          ) {
            return sendJSON(
              res,
              409,
              {
                ok: false,
                message:
                  "এই Username আগে থেকেই ব্যবহার হয়েছে"
              }
            );
          }


          users[phone] = {
            phone,
            pin: hashPIN(pin),
            username,
            name,
            photo,
            friends: [],
            requests: [],
            createdAt:
              new Date().toISOString()
          };

          saveUsers();

          return sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Account তৈরি হয়েছে ❤️",
              user:
                publicUser(
                  users[phone]
                )
            }
          );

        } catch (error) {

          console.log(
            "Register error:",
            error
          );

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         SOCIAL DATA
      =============================== */

      if (
        req.method === "POST" &&
        req.url === "/api/social"
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
            users[phone];

          if (!user) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "Account পাওয়া যায়নি"
              }
            );
          }

          if (
            user.pin !==
            hashPIN(pin)
          ) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "PIN ভুল"
              }
            );
          }

          ensureArrays(user);

          return sendJSON(
            res,
            200,
            {
              ok: true,
              user:
                publicUser(user),
              friends:
                user.friends,
              requests:
                user.requests
            }
          );

        } catch (error) {

          console.log(
            "Social error:",
            error
          );

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         PROFILE
         DO NOT CHANGE
      =============================== */

      if (
        req.method === "POST" &&
        req.url === "/api/profile"
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
            users[phone];

          if (!user) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "Account পাওয়া যায়নি"
              }
            );
          }

          if (
            user.pin !==
            hashPIN(pin)
          ) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "PIN ভুল"
              }
            );
          }

          if (
            typeof body.name ===
            "string"
          ) {
            user.name =
              body.name.trim();
          }

          if (
            typeof body.username ===
            "string" &&
            body.username.trim()
          ) {

            const newUsername =
              cleanUsername(
                body.username
              );

            const currentUsername =
              cleanUsername(
                user.username
              );

            if (
              newUsername !==
              currentUsername
            ) {

              const another =
                findUserByUsername(
                  newUsername
                );

              if (
                another &&
                another.phone !==
                  phone
              ) {
                return sendJSON(
                  res,
                  409,
                  {
                    ok: false,
                    message:
                      "এই Username ব্যবহার করা হয়েছে"
                  }
                );
              }

              user.username =
                newUsername;
            }
          }

          if (
            typeof body.photo ===
            "string"
          ) {
            user.photo =
              body.photo;
          }

          ensureArrays(user);

          saveUsers();

          return sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Profile saved ❤️",
              user:
                publicUser(user)
            }
          );

        } catch (error) {

          console.log(
            "Profile error:",
            error
          );

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         SEARCH USER
      =============================== */

      if (
        req.method === "GET" &&
        req.url.startsWith(
          "/api/search"
        )
      ) {

        try {

          const url =
            new URL(
              req.url,
              "http://localhost"
            );

          const username =
            cleanUsername(
              url.searchParams.get(
                "username"
              )
            );

          if (!username) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "Username দিন"
              }
            );
          }

          const user =
            findUserByUsername(
              username
            );

          if (!user) {
            return sendJSON(
              res,
              404,
              {
                ok: false,
                message:
                  "User পাওয়া যায়নি"
              }
            );
          }

          return sendJSON(
            res,
            200,
            {
              ok: true,
              user:
                publicUser(user)
            }
          );

        } catch (error) {

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      if (
        req.method === "POST" &&
        req.url === "/api/search"
      ) {

        try {

          const body =
            await readBody(req);

          const username =
            cleanUsername(
              body.username
            );

          const user =
            findUserByUsername(
              username
            );

          if (!user) {
            return sendJSON(
              res,
              404,
              {
                ok: false,
                message:
                  "User পাওয়া যায়নি"
              }
            );
          }

          return sendJSON(
            res,
            200,
            {
              ok: true,
              user:
                publicUser(user)
            }
          );

        } catch (error) {

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         FRIEND REQUEST
      =============================== */

      if (
        req.method === "POST" &&
        req.url === "/api/friend-request"
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
            cleanUsername(
              body.username
            );

          const sender =
            users[phone];

          if (!sender) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "Account পাওয়া যায়নি"
              }
            );
          }

          if (
            sender.pin !==
            hashPIN(pin)
          ) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "PIN ভুল"
              }
            );
          }

          ensureArrays(sender);

          const targetPhone =
            findPhoneByUsername(
              targetUsername
            );

          if (!targetPhone) {
            return sendJSON(
              res,
              404,
              {
                ok: false,
                message:
                  "এই Username পাওয়া যায়নি"
              }
            );
          }

          if (
            targetPhone ===
            sender.phone
          ) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "নিজেকে Friend Request পাঠানো যাবে না"
              }
            );
          }

          const target =
            users[targetPhone];

          ensureArrays(target);


          if (
            target.friends.includes(
              sender.username
            )
          ) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "তোমরা আগে থেকেই Friends"
              }
            );
          }


          if (
            target.requests.includes(
              sender.username
            )
          ) {

            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "Friend Request আগেই পাঠানো হয়েছে"
              }
            );
          }


          target.requests.push(
            sender.username
          );

          saveUsers();


          /* ===============================
             REAL-TIME NOTIFICATION
          =============================== */

          const targetSocket =
            onlineUsers.get(
              target.phone
            );

          if (
            targetSocket &&
            targetSocket.readyState ===
              1
          ) {

            try {

              targetSocket.send(
                JSON.stringify({
                  type:
                    "friend-request",

                  from: {
                    username:
                      sender.username ||
                      "",
                    name:
                      sender.name ||
                      sender.username ||
                      "কেউ",
                    photo:
                      sender.photo ||
                      ""
                  }
                })
              );

            } catch (error) {

              console.log(
                "Friend notification error:",
                error
              );
            }
          }


          return sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Friend Request পাঠানো হয়েছে ❤️"
            }
          );

        } catch (error) {

          console.log(
            "Friend request error:",
            error
          );

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         FRIEND ACCEPT
      =============================== */

      if (
        req.method === "POST" &&
        req.url === "/api/friend-accept"
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
            cleanUsername(
              body.username
            );

          const receiver =
            users[phone];

          if (!receiver) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "Account পাওয়া যায়নি"
              }
            );
          }

          if (
            receiver.pin !==
            hashPIN(pin)
          ) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "PIN ভুল"
              }
            );
          }

          ensureArrays(receiver);

          const requesterPhone =
            findPhoneByUsername(
              requesterUsername
            );

          if (!requesterPhone) {
            return sendJSON(
              res,
              404,
              {
                ok: false,
                message:
                  "Requester পাওয়া যায়নি"
              }
            );
          }

          const requester =
            users[requesterPhone];

          ensureArrays(requester);

          const requestIndex =
            receiver.requests.findIndex(
              item =>
                cleanUsername(item) ===
                requesterUsername
            );

          if (
            requestIndex === -1
          ) {
            return sendJSON(
              res,
              400,
              {
                ok: false,
                message:
                  "Friend Request পাওয়া যায়নি"
              }
            );
          }


          receiver.requests.splice(
            requestIndex,
            1
          );


          if (
            !receiver.friends.includes(
              requester.username
            )
          ) {
            receiver.friends.push(
              requester.username
            );
          }


          if (
            !requester.friends.includes(
              receiver.username
            )
          ) {
            requester.friends.push(
              receiver.username
            );
          }


          requester.requests =
            requester.requests.filter(
              item =>
                cleanUsername(item) !==
                cleanUsername(
                  receiver.username
                )
            );


          saveUsers();


          /* Notify requester that request
             was accepted */

          const requesterSocket =
            onlineUsers.get(
              requester.phone
            );

          if (
            requesterSocket &&
            requesterSocket.readyState ===
              1
          ) {

            try {

              requesterSocket.send(
                JSON.stringify({
                  type:
                    "friend-accepted",

                  username:
                    receiver.username,

                  name:
                    receiver.name ||
                    receiver.username ||
                    "বন্ধু"
                })
              );

            } catch (error) {

              console.log(
                "Accept notification error:",
                error
              );
            }
          }


          return sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Friend Request accepted ❤️",

              user:
                publicUser(receiver),

              friends:
                receiver.friends,

              requests:
                receiver.requests
            }
          );

        } catch (error) {

          console.log(
            "Friend accept error:",
            error
          );

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         FRIEND REJECT
      =============================== */

      if (
        req.method === "POST" &&
        req.url === "/api/friend-reject"
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
            cleanUsername(
              body.username
            );

          const receiver =
            users[phone];

          if (!receiver) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "Account পাওয়া যায়নি"
              }
            );
          }

          if (
            receiver.pin !==
            hashPIN(pin)
          ) {
            return sendJSON(
              res,
              401,
              {
                ok: false,
                message:
                  "PIN ভুল"
              }
            );
          }

          ensureArrays(receiver);

          receiver.requests =
            receiver.requests.filter(
              item =>
                cleanUsername(item) !==
                requesterUsername
            );

          saveUsers();

          return sendJSON(
            res,
            200,
            {
              ok: true,
              message:
                "Friend Request rejected"
            }
          );

        } catch (error) {

          console.log(
            "Friend reject error:",
            error
          );

          return sendJSON(
            res,
            500,
            {
              ok: false,
              message:
                "Server error"
            }
          );
        }
      }


      /* ===============================
         STATIC FILES
      =============================== */

      let filePath =
        req.url.split("?")[0];

      if (
        filePath === "/" ||
        filePath === ""
      ) {
        filePath =
          "/index.html";
      }

      const safePath =
        path.normalize(
          path.join(
            __dirname,
            filePath
          )
        );

      if (
        !safePath.startsWith(
          path.normalize(__dirname)
        )
      ) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.readFile(
        safePath,
        (error, data) => {

          if (error) {

            sendJSON(
              res,
              404,
              {
                ok: false,
                message:
                  "Not Found"
              }
            );

            return;
          }

          const ext =
            path.extname(
              safePath
            ).toLowerCase();

          const types = {
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
            ".svg":
              "image/svg+xml",
            ".ico":
              "image/x-icon",
            ".webp":
              "image/webp"
          };

          res.writeHead(
            200,
            {
              "Content-Type":
                types[ext] ||
                "application/octet-stream"
            }
          );

          res.end(data);
        }
      );
    }
  );


/* =========================================
   WEBSOCKET
========================================= */

const wss =
  new WebSocketServer({
    server
  });

const rooms =
  new Map();


function sendWS(ws, data) {

  if (
    ws &&
    ws.readyState === 1
  ) {

    try {
      ws.send(
        JSON.stringify(data)
      );
    } catch (error) {
      console.log(
        "WS send error:",
        error
      );
    }
  }
}


function broadcastRoom(
  roomCode,
  sender,
  data
) {

  if (!roomCode) return;

  const room =
    rooms.get(roomCode);

  if (!room) return;

  for (const peer of room) {

    if (
      peer !== sender &&
      peer.readyState === 1
    ) {

      sendWS(
        peer,
        data
      );
    }
  }
}


wss.on(
  "connection",
  ws => {

    ws.roomCode = null;
    ws.phone = null;
    ws.username = null;


    ws.on(
      "message",
      raw => {

        try {

          const data =
            JSON.parse(
              raw.toString()
            );


          /* =========================
             ACCOUNT AUTH
          ========================= */

          if (
            data.type === "join" ||
            data.type === "auth"
          ) {

            const phone =
              String(
                data.phone || ""
              ).trim();

            const pin =
              String(
                data.pin || ""
              ).trim();

            const user =
              users[phone];

            if (
              !user ||
              user.pin !==
                hashPIN(pin)
            ) {

              sendWS(
                ws,
                {
                  type:
                    "auth-error",
                  message:
                    "Account authentication failed"
                }
              );

              return;
            }


            /* Remove old socket
               for same account */

            const oldSocket =
              onlineUsers.get(
                phone
              );

            if (
              oldSocket &&
              oldSocket !== ws
            ) {

              try {
                oldSocket.close();
              } catch {}
            }


            ws.phone =
              phone;

            ws.username =
              user.username || "";


            onlineUsers.set(
              phone,
              ws
            );


            sendWS(
              ws,
              {
                type:
                  "joined",
                username:
                  user.username ||
                  ""
              }
            );

            return;
          }


          /* =========================
             CREATE ROOM
          ========================= */

          if (
            data.type ===
            "room-create"
          ) {

            let code = "";

            do {

              code =
                Math.floor(
                  100000 +
                  Math.random() *
                    900000
                ).toString();

            } while (
              rooms.has(code)
            );


            rooms.set(
              code,
              new Set([
                ws
              ])
            );

            ws.roomCode =
              code;


            sendWS(
              ws,
              {
                type:
                  "room-created",
                roomCode:
                  code
              }
            );

            return;
          }


          /* =========================
             JOIN ROOM
          ========================= */

          if (
            data.type ===
            "room-join"
          ) {

            const code =
              String(
                data.roomCode || ""
              ).trim();

            if (!code) {

              sendWS(
                ws,
                {
                  type:
                    "room-error",
                  message:
                    "Room Code দিন"
                }
              );

              return;
            }


            const room =
              rooms.get(code);

            if (!room) {

              sendWS(
                ws,
                {
                  type:
                    "room-error",
                  message:
                    "Room পাওয়া যায়নি"
                }
              );

              return;
            }


            if (
              room.size >= 2
            ) {

              sendWS(
                ws,
                {
                  type:
                    "room-error",
                  message:
                    "Room পূর্ণ"
                }
              );

              return;
            }


            room.add(ws);

            ws.roomCode =
              code;


            sendWS(
              ws,
              {
                type:
                  "room-joined",
                roomCode:
                  code
              }
            );


            broadcastRoom(
              code,
              ws,
              {
                type:
                  "peer-joined"
              }
            );

            return;
          }


          /* =========================
             ROOM MESSAGE RELAY
          ========================= */

          if (
            ws.roomCode
          ) {

            broadcastRoom(
              ws.roomCode,
              ws,
              data
            );

            return;
          }


          /* =========================
             OTHER MESSAGE
          ========================= */

          sendWS(
            ws,
            {
              type:
                "server-info",
              message:
                "WebSocket connected"
            }
          );

        } catch (error) {

          console.log(
            "WS message error:",
            error
          );
        }
      }
    );


    ws.on(
      "close",
      () => {

        if (
          ws.phone &&
          onlineUsers.get(
            ws.phone
          ) === ws
        ) {

          onlineUsers.delete(
            ws.phone
          );
        }


        if (
          ws.roomCode
        ) {

          const roomCode =
            ws.roomCode;

          const room =
            rooms.get(
              roomCode
            );

          if (room) {

            room.delete(ws);


            broadcastRoom(
              roomCode,
              ws,
              {
                type:
                  "peer-left"
              }
            );


            if (
              room.size === 0
            ) {

              rooms.delete(
                roomCode
              );
            }
          }
        }
      }
    );


    ws.on(
      "error",
      error => {

        console.log(
          "WebSocket error:",
          error
        );
      }
    );

  }
);


server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Dujon server running on port ${PORT}`
    );

  }
);