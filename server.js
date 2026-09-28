const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, "users.json");

/* =========================
   USERS DATABASE
========================= */

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return { users: {} };
    }

    const data = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.log("Users database error:", error.message);
    return { users: {} };
  }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(data, null, 2)
    );
    return true;
  } catch (error) {
    console.log("Save users error:", error.message);
    return false;
  }
}

function hashPin(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

function findUserByPhone(users, phone) {
  const list = Object.values(users.users || {});
  return list.find(
    user => String(user.phone) === String(phone)
  );
}

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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });

  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function publicUser(user) {
  if (!user) return null;

  return {
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
    friends: user.friends || [],
    requests: user.requests || []
  };
}

/* =========================
   HTTP SERVER
========================= */

const httpServer = http.createServer(async (req, res) => {

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });

    res.end();
    return;
  }

  const parsedUrl = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const requestPath = parsedUrl.pathname;

  /* =========================
     HEALTH
  ========================= */

  if (requestPath === "/health") {
    sendJSON(res, 200, {
      ok: true,
      server: "Dujon",
      message: "Dujon Server OK"
    });

    return;
  }

  /* =========================
     CREATE / UPDATE PROFILE
  ========================= */

  if (
    requestPath === "/api/profile" &&
    req.method === "POST"
  ) {

    try {
      const body = await readBody(req);

      const phone = String(body.phone || "").trim();
      const pin = String(body.pin || "").trim();
      const username = String(
        body.username || ""
      ).trim().toLowerCase();

      const name = String(
        body.name || ""
      ).trim();

      const photo = String(
        body.photo || ""
      ).trim();

      if (!phone || !pin || !username) {
        sendJSON(res, 400, {
          ok: false,
          message: "Phone, PIN এবং Username প্রয়োজন।"
        });

        return;
      }

      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        sendJSON(res, 400, {
          ok: false,
          message:
            "Username 3-20 অক্ষরের হবে। শুধু a-z, 0-9 এবং _ ব্যবহার করুন।"
        });

        return;
      }

      const database = loadUsers();

      const oldUser = findUserByPhone(
        database,
        phone
      );