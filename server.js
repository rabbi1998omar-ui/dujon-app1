const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const DB_FILE = path.join(__dirname, "users.json");

let users = {};


/* =========================================
   LOAD DATABASE
========================================= */

if (fs.existsSync(DB_FILE)) {
  try {
    users = JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );
  } catch {
    users = {};
  }
}


/* =========================================
   SAVE DATABASE
========================================= */

function saveUsers() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(users, null, 2)
    );
  } catch (error) {
    console.log(
      "Database save error:",
      error
    );
  }
}


/* =========================================
   HASH PIN
========================================= */

function hashPin(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}


/* =========================================
   JSON RESPONSE
========================================= */

function json(res, status, data) {

  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8",

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET,POST,OPTIONS"
  });

  res.end(
    JSON.stringify(data)
  );
}


/* =========================================
   READ REQUEST BODY
========================================= */

function body(req) {

  return new Promise(
    (resolve, reject) => {

      let data = "";

      req.on(
        "data",
        chunk => {
          data += chunk;
        }
      );

      req.on(
        "end",
        () => {

          try {

            resolve(
              data
                ? JSON.parse(data)
                : {}
            );

          } catch {

            resolve({});

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


/* =========================================
   FIND USER BY USERNAME
========================================= */

function findUserByUsername(
  username
) {

  if (!username) {
    return null;
  }

  const wanted =
    String(username)
      .replace(/^@/, "")
      .trim()
      .toLowerCase();

  return (
    Object.values(users)
      .find(
        user =>
          String(
            user.username || ""
          )
            .toLowerCase() ===
          wanted
      ) || null
  );

}


/* =========================================
   FIND PHONE BY USERNAME
========================================= */

function findUserPhoneByUsername(
  username
) {

  const user =
    findUserByUsername(
      username
    );

  return user?.phone || null;

}


/* =========================================
   PUBLIC USER
========================================= */

function publicUser(user) {

  if (!user) {
    return null;
  }

  return {

    username:
      user.username || "",

    name:
      user.name ||
      user.username ||
      "",

    photo:
      user.photo || "",

    friends:
      Array.isArray(user.friends)
        ? user.friends
        : []

  };

}


/* =========================================
   AUTHENTICATE
========================================= */

function authenticate(
  phone,
  pin
) {

  const user =
    users[
      String(phone || "")
    ];

  if (!user) {
    return null;
  }

  if (
    user.pinHash !==
    hashPin(pin)
  ) {

    return null;

  }

  return user;

}


/* =========================================
   NORMALIZE USER
========================================= */

function normalizeUser(user) {

  if (!user) {
    return;
  }

  if (
    !Array.isArray(
      user.friends
    )
  ) {

    user.friends = [];

  }

  if (
    !Array.isArray(
      user.requests
    )
  ) {

    user.requests = [];

  }

}


/* =========================================
   HTTP SERVER
========================================= */

const server =
  http.createServer(
    async (req, res) => {

      /* ================================
         OPTIONS
      ================================= */

      if (
        req.method ===
        "OPTIONS"
      ) {

        res.writeHead(
          204,
          {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Headers":
              "Content-Type",

            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS"
          }
        );

        res.end();

        return;

      }


      const url =
        new URL(
          req.url,
          `http://${req.headers.host}`
        );


      const pathname =
        url.pathname;


      /* ================================
         REGISTER
      ================================= */

      if (
        pathname ===
          "/api/register" &&
        req.method === "POST"
      ) {

        const data =
          await body(req);


        const phone =
          String(
            data.phone || ""
          ).trim();


        const pin =
          String(
            data.pin || ""
          ).trim();


        const username =
          String(
            data.username || ""
          )
            .trim()
            .toLowerCase();


        const name =
          String(
            data.name || "আমি"
          ).trim();


        const photo =
          String(
            data.photo || ""
          );


        if (!phone) {

          return json(
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

          return json(
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
          !/^[a-z0-9_]{3,20}$/
            .test(username)
        ) {

          return json(
            res,
            400,
            {
              ok: false,
              message:
                "Username 3-20 অক্ষরের হতে হবে"
            }
          );

        }


        if (
          users[phone]
        ) {

          return json(
            res,
            409,
            {
              ok: false,
              message:
                "এই মোবাইল নম্বর দিয়ে Account আছে"
            }
          );

        }


        const existing =
          findUserByUsername(
            username
          );


        if (existing) {

          return json(
            res,
            409,
            {
              ok: false,
              message:
                "এই Username ইতিমধ্যে ব্যবহার হয়েছে"
            }
          );

        }


        users[phone] = {

          phone,

          pinHash:
            hashPin(pin),

          username,

          name:
            name || "আমি",

          photo:
            photo || "",

          friends: [],

          requests: [],

          createdAt:
            Date.now()

        };


        saveUsers();


        return json(
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

      }


      /* ================================
         PROFILE
         /api/profile অপরিবর্তিত
      ================================= */

      if (
        pathname ===
          "/api/profile" &&
        req.method === "POST"
      ) {

        const data =
          await body(req);


        const phone =
          String(
            data.phone || ""
          ).trim();


        const pin =
          String(
            data.pin || ""
          ).trim();


        const user =
          authenticate(
            phone,
            pin
          );


        if (!user) {

          return json(
            res,
            401,
            {
              ok: false,
              message:
                "Authentication failed"
            }
          );

        }


        normalizeUser(user);


        if (
          data.name !==
          undefined
        ) {

          user.name =
            String(
              data.name
            ).trim();

        }


        if (
          data.username !==
          undefined
        ) {

          const username =
            String(
              data.username
            )
              .trim()
              .toLowerCase();


          if (
            username &&
            username !==
              user.username
          ) {

            const other =
              findUserByUsername(
                username
              );


            if (
              other &&
              other.phone !==
                phone
            ) {

              return json(
                res,
                409,
                {
                  ok: false,
                  message:
                    "Username already exists"
                }
              );

            }


            user.username =
              username;

          }

        }


        if (
          data.photo !==
          undefined
        ) {

          user.photo =
            String(
              data.photo || ""
            );

        }


        saveUsers();


        return json(
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

      }


      /* ================================
         SOCIAL
      ================================= */

      if (
        pathname ===
          "/api/social" &&
        req.method === "POST"
      ) {

        const data =
          await body(req);


        const user =
          authenticate(
            data.phone,
            data.pin
          );


        if (!user) {

          return json(
            res,
            401,
            {
              ok: false,
              message:
                "Authentication failed"
            }
          );

        }


        normalizeUser(user);


        return json(
          res,
          200,
          {

            ok: true,

            user: {

              username:
                user.username,

              name:
                user.name,

              photo:
                user.photo,

              friends:
                user.friends,

              requests:
                user.requests

            },

            friends:
              user.friends,

            requests:
              user.requests

          }
        );

      }


      /* ================================
         SEARCH
      ================================= */

      if (
        pathname ===
          "/api/search" &&
        (
          req.method === "GET" ||
          req.method === "POST"
        )
      ) {

        let username = "";


        if (
          req.method ===
          "GET"
        ) {

          username =
            url.searchParams
              .get("username") ||
            "";

        } else {

          const data =
            await body(req);

          username =
            data.username || "";

        }


        const user =
          findUserByUsername(
            username
          );


        if (!user) {

          return json(
            res,
            404,
            {
              ok: false,
              message:
                "User পাওয়া যায়নি"
            }
          );

        }


        return json(
          res,
          200,
          {
            ok: true,
            user:
              publicUser(user)
          }
        );

      }


      /* ================================
         FRIEND REQUEST
      ================================= */

      if (
        pathname ===
          "/api/friend-request" &&
        req.method === "POST"
      ) {

        const data =
          await body(req);


        const sender =
          authenticate(
            data.phone,
            data.pin
          );


        if (!sender) {

          return json(
            res,
            401,
            {
              ok: false,
              message:
                "Authentication failed"
            }
          );

        }


        const target =
          findUserByUsername(
            data.username
          );


        if (!target) {

          return json(
            res,
            404,
            {
              ok: false,
              message:
                "User পাওয়া যায়নি"
            }
          );

        }


        if (
          target.phone ===
          sender.phone
        ) {

          return json(
            res,
            400,
            {
              ok: false,
              message:
                "নিজেকে Friend করা যাবে না"
            }
          );

        }


        normalizeUser(
          sender
        );

        normalizeUser(
          target
        );


        if (
          sender.friends.includes(
            target.username
          )
        ) {

          return json(
            res,
            400,
            {
              ok: false,
              message:
                "তোমরা ইতিমধ্যে Friend"
            }
          );

        }


        if (
          target.requests.includes(
            sender.username
          )
        ) {

          return json(
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


        sendToUser(
          target.phone,
          {
            type:
              "friend-request",

            from:
              publicUser(
                sender
              )
          }
        );


        return json(
          res,
          200,
          {
            ok: true,
            message:
              "Friend Request পাঠানো হয়েছে ❤️"
          }
        );

      }


      /* ================================
         FRIEND ACCEPT
      ================================= */

      if (
        pathname ===
          "/api/friend-accept" &&
        req.method === "POST"
      ) {

        const data =
          await body(req);


        const receiver =
          authenticate(
            data.phone,
            data.pin
          );


        if (!receiver) {

          return json(
            res,
            401,
            {
              ok: false,
              message:
                "Authentication failed"
            }
          );

        }


        const requester =
          findUserByUsername(
            data.username
          );


        if (!requester) {

          return json(
            res,
            404,
            {
              ok: false,
              message:
                "Requester পাওয়া যায়নি"
            }
          );

        }


        normalizeUser(
          receiver
        );

        normalizeUser(
          requester
        );


        const index =
          receiver.requests
            .indexOf(
              requester.username
            );


        if (
          index === -1
        ) {

          return json(
            res,
            400,
            {
              ok: false,
              message:
                "Friend Request পাওয়া যায়নি"
            }
          );

        }


        receiver.requests
          .splice(
            index,
            1
          );


        if (
          !receiver.friends
            .includes(
              requester.username
            )
        ) {

          receiver.friends
            .push(
              requester.username
            );

        }


        if (
          !requester.friends
            .includes(
              receiver.username
            )
        ) {

          requester.friends
            .push(
              receiver.username
            );

        }


        requester.requests =
          requester.requests
            .filter(
              item =>
                item !==
                receiver.username
            );


        saveUsers();


        sendToUser(
          requester.phone,
          {
            type:
              "friend-accepted",

            username:
              receiver.username,

            name:
              receiver.name ||
              receiver.username
          }
        );


        return json(
          res,
          200,
          {

            ok: true,

            message:
              "Friend request accepted ❤️",

            user: {

              username:
                receiver.username,

              friends:
                receiver.friends,

              requests:
                receiver.requests

            },

            friends:
              receiver.friends,

            requests:
              receiver.requests

          }
        );

      }


      /* ================================
         FRIEND REJECT
      ================================= */

      if (
        pathname ===
          "/api/friend-reject" &&
        req.method === "POST"
      ) {

        const data =
          await body(req);


        const receiver =
          authenticate(
            data.phone,
            data.pin
          );


        if (!receiver) {

          return json(
            res,
            401,
            {
              ok: false,
              message:
                "Authentication failed"
            }
          );

        }


        normalizeUser(
          receiver
        );


        const requester =
          findUserByUsername(
            data.username
          );


        if (requester) {

          receiver.requests =
            receiver.requests
              .filter(
                item =>
                  item !==
                  requester.username
              );

        }


        saveUsers();


        return json(
          res,
          200,
          {

            ok: true,

            message:
              "Request rejected",

            friends:
              receiver.friends,

            requests:
              receiver.requests

          }
        );

      }


      /* ================================
         STATIC FILES
      ================================= */

      let filePath;


      if (
        pathname === "/"
      ) {

        filePath =
          path.join(
            __dirname,
            "index.html"
          );

      } else {

        /*
         Query string বাদ দিয়ে
         শুধু pathname ব্যবহার হচ্ছে।
        */

        const cleanPath =
          pathname
            .replace(/^\/+/, "");


        filePath =
          path.join(
            __dirname,
            cleanPath
          );

      }


      const normalizedPath =
        path.normalize(
          filePath
        );


      if (
        !normalizedPath
          .startsWith(
            __dirname
          )
      ) {

        res.writeHead(
          403
        );

        res.end(
          "Forbidden"
        );

        return;

      }


      fs.readFile(
        normalizedPath,
        (err, file) => {

          if (err) {

            res.writeHead(
              404,
              {
                "Content-Type":
                  "text/plain; charset=utf-8"
              }
            );

            res.end(
              "Not Found"
            );

            return;

          }


          const ext =
            path.extname(
              normalizedPath
            )
              .toLowerCase();


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

            ".webp":
              "image/webp",

            ".ico":
              "image/x-icon"

          };


          res.writeHead(
            200,
            {
              "Content-Type":
                types[ext] ||
                "application/octet-stream"
            }
          );


          res.end(
            file
          );

        }
      );

    }
  );


/* =========================================
   WEBSOCKET SERVER
========================================= */

const wss =
  new WebSocket.Server({
    server
  });


/*
  phone -> WebSocket
*/
const onlineUsers =
  new Map();


/*
  roomCode -> Set<WebSocket>
*/
const rooms =
  new Map();


/* =========================================
   SOCKET HELPERS
========================================= */

function isOpen(socket) {

  return (
    socket &&
    socket.readyState ===
      WebSocket.OPEN
  );

}


function sendSocket(
  socket,
  data
) {

  if (
    !isOpen(socket)
  ) {

    return false;

  }


  try {

    socket.send(
      JSON.stringify(data)
    );

    return true;

  } catch {

    return false;

  }

}


/* =========================================
   SEND TO USER
========================================= */

function sendToUser(
  phone,
  data
) {

  const socket =
    onlineUsers.get(
      String(phone || "")
    );


  return sendSocket(
    socket,
    data
  );

}


/* =========================================
   FIND TARGET SOCKET
========================================= */

function findTargetSocket(
  ws,
  data
) {

  let targetPhone =
    String(
      data.toPhone ||
      data.targetPhone ||
      ""
    ).trim();


  let targetUsername =
    String(
      data.toUsername ||
      data.targetUsername ||
      ""
    )
      .replace(/^@/, "")
      .trim()
      .toLowerCase();


  /*
    Username থাকলে
    username → phone
  */

  if (
    targetUsername
  ) {

    const foundPhone =
      findUserPhoneByUsername(
        targetUsername
      );


    if (foundPhone) {

      targetPhone =
        String(foundPhone);

    }

  }


  /*
    Call response-এর জন্য
    saved peer
  */

  if (
    !targetPhone &&
    ws.callPeerPhone
  ) {

    targetPhone =
      String(
        ws.callPeerPhone
      );

  }


  if (
    !targetPhone
  ) {

    return null;

  }


  const target =
    onlineUsers.get(
      targetPhone
    );


  if (
    !target ||
    target === ws ||
    !isOpen(target)
  ) {

    return null;

  }


  return target;

}


/* =========================================
   DIRECT RELAY
========================================= */

function directRelay(
  ws,
  data
) {

  const target =
    findTargetSocket(
      ws,
      data
    );


  if (!target) {

    sendSocket(
      ws,
      {

        type:
          "delivery-failed",

        originalType:
          data.type,

        message:
          "অন্য user এখন Offline"

      }
    );


    return false;

  }


  /*
    Offer পাঠানোর সময়
    দুই socket-এর মধ্যে
    call relationship save করি।
  */

  if (
    (
      data.type ===
        "video-call" ||
      data.type ===
        "audio-call"
    ) &&
    data.action ===
      "offer"
  ) {

    ws.callPeerPhone =
      target.phone;

    ws.callPeerUsername =
      target.username;


    target.callPeerPhone =
      ws.phone;

    target.callPeerUsername =
      ws.username;

  }


  /*
    Answer এও relationship নিশ্চিত করি
  */

  if (
    (
      data.type ===
        "video-call" ||
      data.type ===
        "audio-call"
    ) &&
    data.action ===
      "answer"
  ) {

    if (
      !ws.callPeerPhone
    ) {

      ws.callPeerPhone =
        target.phone;

    }


    if (
      !ws.callPeerUsername
    ) {

      ws.callPeerUsername =
        target.username;

    }

  }


  /*
    ICE candidate-এর জন্য
    sender information
  */

  const outgoing = {

    ...data,

    fromPhone:
      ws.phone || "",

    fromUsername:
      ws.username || "",

    sender:
      ws.username || ""

  };


  const delivered =
    sendSocket(
      target,
      outgoing
    );


  /*
    Reject / End হলে
    call relationship clear
  */

  if (
    (
      data.type ===
        "video-call" ||
      data.type ===
        "audio-call"
    ) &&
    (
      data.action ===
        "end" ||
      data.action ===
        "reject"
    )
  ) {

    ws.callPeerPhone =
      null;

    ws.callPeerUsername =
      null;


    target.callPeerPhone =
      null;

    target.callPeerUsername =
      null;

  }


  return delivered;

}


/* =========================================
   ROOM
========================================= */

function leaveRoom(ws) {

  if (!ws.room) {
    return;
  }


  const room =
    rooms.get(
      ws.room
    );


  if (room) {

    room.delete(
      ws
    );


    for (
      const peer of room
    ) {

      sendSocket(
        peer,
        {
          type:
            "peer-left"
        }
      );

    }


    if (
      room.size === 0
    ) {

      rooms.delete(
        ws.room
      );

    }

  }


  ws.room =
    null;

}


function joinRoom(
  ws,
  roomCode
) {

  leaveRoom(
    ws
  );


  const room =
    String(
      roomCode || ""
    )
      .trim()
      .toUpperCase();


  if (!room) {
    return;
  }


  if (
    !rooms.has(room)
  ) {

    rooms.set(
      room,
      new Set()
    );

  }


  const set =
    rooms.get(
      room
    );


  for (
    const peer of set
  ) {

    sendSocket(
      peer,
      {
        type:
          "peer-joined"
      }
    );

  }


  set.add(
    ws
  );


  ws.room =
    room;


  sendSocket(
    ws,
    {
      type:
        "joined",

      room
    }
  );

}


/* =========================================
   DIRECT TYPES
========================================= */

const DIRECT_TYPES =
  new Set([

    "chat",

    "feeling",

    "love-note",

    "couple-date",

    "our-story",

    "memory",

    "favorite",

    "video-call",

    "audio-call"

  ]);


/* =========================================
   WEBSOCKET CONNECTION
========================================= */

wss.on(
  "connection",
  ws => {

    ws.phone =
      null;

    ws.username =
      null;

    ws.room =
      null;

    ws.callPeerPhone =
      null;

    ws.callPeerUsername =
      null;


    /* ================================
       MESSAGE
    ================================= */

    ws.on(
      "message",
      raw => {

        let data;


        try {

          data =
            JSON.parse(
              raw.toString()
            );

        } catch {

          return;

        }


        /* ================================
           AUTH / JOIN
        ================================= */

        if (
          data.type === "join" ||
          data.type === "auth"
        ) {

          const user =
            authenticate(
              data.phone,
              data.pin
            );


          if (!user) {

            sendSocket(
              ws,
              {

                type:
                  "auth-error",

                message:
                  "Login authentication failed"

              }
            );

            return;

          }


          normalizeUser(
            user
          );


          const phone =
            String(
              user.phone
            );


          /*
            একই account অন্য device/socket
            থেকে connected থাকলে পুরোনো socket
            বন্ধ করা হবে।
          */

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
            user.username;


          onlineUsers.set(
            phone,
            ws
          );


          sendSocket(
            ws,
            {

              type:
                "joined",

              username:
                user.username

            }
          );


          /*
            নিজের profile
          */

          sendSocket(
            ws,
            {

              type:
                "profile",

              profile:
                publicUser(user)

            }
          );


          /*
            অন্য online users-কে
            presence জানানো
          */

          for (
            const [
              otherPhone,
              otherSocket
            ] of onlineUsers
          ) {

            if (
              otherSocket !== ws &&
              isOpen(otherSocket)
            ) {

              /*
                অন্য user-কে
                নতুন user online
              */

              sendSocket(
                otherSocket,
                {

                  type:
                    "presence",

                  online:
                    true,

                  username:
                    user.username,

                  phone:
                    phone

                }
              );


              /*
                নতুন user-কে
                অন্য user online
              */

              sendSocket(
                ws,
                {

                  type:
                    "presence",

                  online:
                    true,

                  username:
                    otherSocket.username,

                  phone:
                    otherPhone

                }
              );

            }

          }


          return;

        }


        /* ================================
           AUTH CHECK
        ================================= */

        if (!ws.phone) {

          sendSocket(
            ws,
            {

              type:
                "auth-error",

              message:
                "WebSocket authenticated নয়"

            }
          );

          return;

        }


        /* ================================
           ROOM CREATE
        ================================= */

        if (
          data.type ===
          "room-create"
        ) {

          let room =
            String(
              data.room || ""
            )
              .trim()
              .toUpperCase();


          if (!room) {

            room =
              Math.floor(
                100000 +
                Math.random() *
                900000
              )
              .toString();

          }


          joinRoom(
            ws,
            room
          );


          sendSocket(
            ws,
            {

              type:
                "room-created",

              room

            }
          );


          return;

        }


        /* ================================
           ROOM JOIN
        ================================= */

        if (
          data.type ===
          "room-join"
        ) {

          joinRoom(
            ws,
            data.room
          );

          return;

        }


        /* ================================
           ROOM MESSAGE
        ================================= */

        if (
          data.type ===
          "room-message"
        ) {

          const room =
            rooms.get(
              ws.room
            );


          if (room) {

            for (
              const peer of room
            ) {

              if (
                peer !== ws
              ) {

                sendSocket(
                  peer,
                  {

                    ...data,

                    from:
                      ws.username,

                    fromPhone:
                      ws.phone,

                    fromUsername:
                      ws.username

                  }
                );

              }

            }

          }


          return;

        }


        /* ================================
           PRESENCE
        ================================= */

        if (
          data.type ===
          "presence"
        ) {

          for (
            const [
              phone,
              socket
            ] of onlineUsers
          ) {

            if (
              socket !== ws &&
              isOpen(socket)
            ) {

              sendSocket(
                socket,
                {

                  type:
                    "presence",

                  online:
                    data.online !== false,

                  username:
                    ws.username,

                  phone:
                    ws.phone

                }
              );

            }

          }


          return;

        }


        /* ================================
           DIRECT CHAT / CALL
        ================================= */

        if (
          DIRECT_TYPES.has(
            data.type
          )
        ) {

          directRelay(
            ws,
            data
          );

          return;

        }


        /* ================================
           ICE CANDIDATE
        ================================= */

        if (
          data.type ===
          "ice-candidate"
        ) {

          /*
            ICE-এর target:
            toUsername থাকলে সেটা,
            না থাকলে callPeerPhone
          */

          directRelay(
            ws,
            {

              ...data,

              action:
                "ice-candidate"

            }
          );

          return;

        }


        /* ================================
           OTHER DIRECT SIGNAL
        ================================= */

        if (
          data.toPhone ||
          data.toUsername ||
          data.targetPhone ||
          data.targetUsername
        ) {

          directRelay(
            ws,
            data
          );

          return;

        }

      }
    );


    /* ================================
       CLOSE
    ================================= */

    ws.on(
      "close",
      () => {

        /*
          শুধু নিজের socket হলে
          onlineUsers থেকে remove করি।
        */

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


        leaveRoom(
          ws
        );


        /*
          Offline presence
        */

        for (
          const [
            phone,
            socket
          ] of onlineUsers
        ) {

          sendSocket(
            socket,
            {

              type:
                "presence",

              online:
                false,

              username:
                ws.username || "",

              phone:
                ws.phone || ""

            }
          );

        }

      }
    );


    ws.on(
      "error",
      error => {

        console.log(
          "WebSocket error:",
          error?.message || ""
        );

      }
    );

  }
);


/* =========================================
   START SERVER
========================================= */

server.listen(
  PORT,
  () => {

    console.log(
      `Dujon server running on port ${PORT}`
    );

  }
);