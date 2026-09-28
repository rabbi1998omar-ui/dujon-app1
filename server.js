const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const DATA_FILE = path.join(ROOT, "users.json");

/* =========================
   DATA STORAGE
========================= */

let users = {};

function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      users = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    }
  } catch (error) {
    console.log("Could not load users:", error.message);
    users = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(users, null, 2),
      "utf8"
    );
  } catch (error) {
    console.log("Could not save users:", error.message);
  }
}

loadUsers();

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
   HTTP HELPERS
========================= */

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });

  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

/* =========================
   HTTP SERVER
========================= */

const httpServer = http.createServer(async (req, res) => {

  let requestPath = req.url.split("?")[0];

  /* OPTIONS */
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });

    res.end();
    return;
  }

  /* =========================
     HEALTH
  ========================= */

  if (requestPath === "/health") {
    sendJSON(res, 200, {
      ok: true,
      server: "Dujon Server",
      users: Object.keys(users).length
    });

    return;
  }

  /* =========================
     CREATE USER
  ========================= */

  if (
    requestPath === "/api/user/create" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const userId = String(
        body.userId || ""
      ).trim();

      const username = String(
        body.username || ""
      )
        .trim()
        .toLowerCase()
        .replace(/^@/, "");

      const name = String(
        body.name || ""
      ).trim();

      if (!userId) {
        sendJSON(res, 400, {
          ok: false,
          message: "User ID required"
        });

        return;
      }

      if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
        sendJSON(res, 400, {
          ok: false,
          message:
            "Username 3-20 characters হতে হবে"
        });

        return;
      }

      /* Username already used? */

      for (const id in users) {

        if (
          id !== userId &&
          users[id].username === username
        ) {

          sendJSON(res, 409, {
            ok: false,
            message: "এই Username ইতিমধ্যে নেওয়া হয়েছে"
          });

          return;
        }
      }

      if (!users[userId]) {

        users[userId] = {
          userId,
          username,
          name: name || username,
          photo: "",
          friends: [],
          incomingRequests: [],
          outgoingRequests: [],
          createdAt: Date.now()
        };

      } else {

        users[userId].username = username;

        if (name) {
          users[userId].name = name;
        }

      }

      saveUsers();

      sendJSON(res, 200, {
        ok: true,
        user: users[userId]
      });

      console.log(
        "User created:",
        username
      );

      return;

    } catch (error) {

      sendJSON(res, 400, {
        ok: false,
        message: "Invalid request"
      });

      return;
    }
  }

  /* =========================
     SEARCH USER
  ========================= */

  if (
    requestPath === "/api/user/search" &&
    req.method === "GET"
  ) {

    const url = new URL(
      req.url,
      `http://${req.headers.host}`
    );

    const username = String(
      url.searchParams.get("username") || ""
    )
      .trim()
      .toLowerCase()
      .replace(/^@/, "");

    const currentUserId =
      url.searchParams.get("userId") || "";

    let found = null;

    for (const id in users) {

      if (
        users[id].username === username
      ) {

        if (id === currentUserId) {
          found = null;
        } else {

          found = {
            userId: users[id].userId,
            username: users[id].username,
            name: users[id].name,
            photo: users[id].photo || ""
          };

        }

        break;
      }
    }

    if (!found) {

      sendJSON(res, 404, {
        ok: false,
        message: "User পাওয়া যায়নি"
      });

      return;
    }

    sendJSON(res, 200, {
      ok: true,
      user: found
    });

    return;
  }

  /* =========================
     SEND FRIEND REQUEST
  ========================= */

  if (
    requestPath === "/api/friend/request" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const fromId =
        String(body.fromId || "").trim();

      const toId =
        String(body.toId || "").trim();

      if (
        !fromId ||
        !toId ||
        !users[fromId] ||
        !users[toId]
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "User পাওয়া যায়নি"
        });

        return;
      }

      if (fromId === toId) {

        sendJSON(res, 400, {
          ok: false,
          message: "নিজেকে Friend করা যাবে না"
        });

        return;
      }

      const fromUser = users[fromId];
      const toUser = users[toId];

      if (
        fromUser.friends.includes(toId)
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "তোমরা ইতিমধ্যে Friend"
        });

        return;
      }

      if (
        fromUser.outgoingRequests.includes(toId)
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "Friend Request আগেই পাঠানো হয়েছে"
        });

        return;
      }

      if (
        toUser.incomingRequests.includes(fromId)
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "Friend Request আগেই পাঠানো হয়েছে"
        });

        return;
      }

      fromUser.outgoingRequests.push(toId);
      toUser.incomingRequests.push(fromId);

      saveUsers();

      sendJSON(res, 200, {
        ok: true,
        message: "Friend Request পাঠানো হয়েছে"
      });

      console.log(
        "Friend request:",
        fromUser.username,
        "->",
        toUser.username
      );

      return;

    } catch {

      sendJSON(res, 400, {
        ok: false,
        message: "Invalid request"
      });

      return;
    }
  }

  /* =========================
     ACCEPT FRIEND REQUEST
  ========================= */

  if (
    requestPath === "/api/friend/accept" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const userId =
        String(body.userId || "").trim();

      const requesterId =
        String(body.requesterId || "").trim();

      if (
        !users[userId] ||
        !users[requesterId]
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "User পাওয়া যায়নি"
        });

        return;
      }

      const user = users[userId];
      const requester = users[requesterId];

      if (
        !user.incomingRequests.includes(
          requesterId
        )
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "Friend Request পাওয়া যায়নি"
        });

        return;
      }

      user.incomingRequests =
        user.incomingRequests.filter(
          id => id !== requesterId
        );

      requester.outgoingRequests =
        requester.outgoingRequests.filter(
          id => id !== userId
        );

      if (!user.friends.includes(requesterId)) {
        user.friends.push(requesterId);
      }

      if (!requester.friends.includes(userId)) {
        requester.friends.push(userId);
      }

      saveUsers();

      sendJSON(res, 200, {
        ok: true,
        message: "Friend Request Accept হয়েছে"
      });

      console.log(
        "Friend accepted:",
        user.username,
        "<->",
        requester.username
      );

      return;

    } catch {

      sendJSON(res, 400, {
        ok: false,
        message: "Invalid request"
      });

      return;
    }
  }

  /* =========================
     REJECT FRIEND REQUEST
  ========================= */

  if (
    requestPath === "/api/friend/reject" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const userId =
        String(body.userId || "").trim();

      const requesterId =
        String(body.requesterId || "").trim();

      if (
        !users[userId] ||
        !users[requesterId]