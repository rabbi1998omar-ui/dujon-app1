const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const USERS_FILE = path.join(ROOT, "users.json");

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
   USER DATABASE
========================= */

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(
        USERS_FILE,
        JSON.stringify({ users: {} }, null, 2)
      );
    }

    return JSON.parse(
      fs.readFileSync(USERS_FILE, "utf8")
    );
  } catch (error) {
    console.log("Users database error:", error.message);
    return { users: {} };
  }
}

let userDB = loadUsers();

function saveUsers() {
  try {
    fs.writeFileSync(
      USERS_FILE,
      JSON.stringify(userDB, null, 2)
    );
  } catch (error) {
    console.log("Save users error:", error.message);
  }
}

/* =========================
   HELPERS
========================= */

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

function validUsername(username) {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

function publicUser(user) {
  if (!user) return null;

  return {
    username: user.username,
    name: user.name || user.username,
    photo: user.photo || ""
  };
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
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
   AUTHENTICATION
========================= */

function findUserByPhone(phone) {

  const allUsers = Object.values(userDB.users);

  return allUsers.find(
    user => user.phone === String(phone)
  );
}

function checkLogin(phone, pin) {

  const user = findUserByPhone(phone);

  if (!user) return null;

  if (
    user.pinHash !==
    hashPin(pin)
  ) {
    return null;
  }

  return user;
}

/* =========================
   HTTP SERVER
========================= */

const httpServer = http.createServer(async (req, res) => {

  /* OPTIONS */

  if (req.method === "OPTIONS") {

    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    });

    res.end();
    return;
  }


  let requestPath = req.url.split("?")[0];

  /* =========================
     API: SAVE PROFILE
  ========================= */

  if (
    requestPath === "/api/profile" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const phone = String(
        body.phone || ""
      ).trim();

      const pin = String(
        body.pin || ""
      ).trim();

      const username =
        normalizeUsername(body.username);

      const name =
        String(body.name || "").trim();

      const photo =
        String(body.photo || "").trim();


      if (!phone || !pin) {

        sendJSON(res, 400, {
          ok: false,
          message: "Phone এবং PIN প্রয়োজন"
        });

        return;
      }


      if (!validUsername(username)) {

        sendJSON(res, 400, {
          ok: false,
          message:
            "Username 3-20 অক্ষরের হতে হবে। শুধু a-z, 0-9 এবং _ ব্যবহার করো।"
        });

        return;
      }


      let user = findUserByPhone(phone);


      /* নতুন user */

      if (!user) {

        if (userDB.users[username]) {

          sendJSON(res, 409, {
            ok: false,
            message: "এই Username আগে থেকেই আছে।"
          });

          return;
        }


        user = {
          username,
          phone,
          pinHash: hashPin(pin),
          name: name || username,
          photo,
          friends: [],
          requests: []
        };

        userDB.users[username] = user;

        saveUsers();


        sendJSON(res, 200, {
          ok: true,
          message: "Account profile তৈরি হয়েছে",
          user: publicUser(user)
        });

        return;
      }


      /* পুরনো user-এর PIN check */

      if (user.pinHash !== hashPin(pin)) {

        sendJSON(res, 401, {
          ok: false,
          message: "PIN ভুল"
        });

        return;
      }


      /* Username পরিবর্তন হলে */

      if (
        user.username !== username &&
        userDB.users[username]
      ) {

        sendJSON(res, 409, {
          ok: false,
          message: "এই Username আগে থেকেই ব্যবহার করা হয়েছে।"
        });

        return;
      }


      if (user.username !== username) {

        const oldUsername = user.username;

        delete userDB.users[oldUsername];

        user.username = username;

        userDB.users[username] = user;


        /* Friends update */

        Object.values(userDB.users).forEach(other => {

          if (other.friends.includes(oldUsername)) {

            other.friends =
              other.friends.map(
                x =>
                  x === oldUsername
                    ? username
                    : x
              );
          }


          if (other.requests.includes(oldUsername)) {

            other.requests =
              other.requests.map(
                x =>
                  x === oldUsername
                    ? username
                    : x
              );
          }

        });

      }


      user.name =
        name || user.name || username;

      user.photo = photo || user.photo || "";


      saveUsers();


      sendJSON(res, 200, {
        ok: true,
        message: "Profile saved",
        user: publicUser(user)
      });


    } catch (error) {

      sendJSON(res, 500, {
        ok: false,
        message: "Server error"
      });

    }

    return;
  }


  /* =========================
     API: SEARCH USER
  ========================= */

  if (
    requestPath === "/api/search" &&
    req.method === "GET"
  ) {

    const url =
      new URL(
        req.url,
        `http://${req.headers.host}`
      );

    const username =
      normalizeUsername(
        url.searchParams.get("username")
      );


    if (!username) {

      sendJSON(res, 400, {
        ok: false,
        message: "Username দাও"
      });

      return;
    }


    const user =
      userDB.users[username];


    if (!user) {

      sendJSON(res, 404, {
        ok: false,
        message: "এই Username পাওয়া যায়নি।"
      });

      return;
    }


    sendJSON(res, 200, {
      ok: true,
      user: publicUser(user)
    });

    return;
  }


  /* =========================
     API: GET SOCIAL DATA
  ========================= */

  if (
    requestPath === "/api/social" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const phone =
        String(body.phone || "").trim();

      const pin =
        String(body.pin || "").trim();


      const user =
        checkLogin(phone, pin);


      if (!user) {

        sendJSON(res, 401, {
          ok: false,
          message: "Login তথ্য ভুল"
        });

        return;
      }


      const friends =
        user.friends
          .map(username =>
            publicUser(
              userDB.users[username]
            )
          )
          .filter(Boolean);


      const requests =
        user.requests
          .map(username =>
            publicUser(
              userDB.users[username]
            )
          )
          .filter(Boolean);


      sendJSON(res, 200, {
        ok: true,
        user: publicUser(user),
        friends,
        requests
      });


    } catch {

      sendJSON(res, 500, {
        ok: false,
        message: "Server error"
      });

    }

    return;
  }


  /* =========================
     API: FRIEND REQUEST
  ========================= */

  if (
    requestPath === "/api/friend-request" &&
    req.method === "POST"
  ) {

    try {

      const body = await readBody(req);

      const phone =
        String(body.phone || "").trim();

      const pin =
        String(body.pin || "").trim();

      const toUsername =
        normalizeUsername(
          body.toUsername
        );


      const fromUser =
        checkLogin(phone, pin);


      if (!fromUser) {

        sendJSON(res, 401, {
          ok: false,
          message: "Login তথ্য ভুল"
        });

        return;
      }


      const target =
        userDB.users[toUsername];


      if (!target) {

        sendJSON(res, 404, {
          ok: false,
          message: "User পাওয়া যায়নি।"
        });

        return;
      }


      if (
        fromUser.username ===
        target.username
      ) {

        sendJSON(res, 400, {
          ok: false,
          message: "নিজেকে Friend Request পাঠানো যাবে না।"
        });

        return;
      }


      if (
        fromUser.friends.includes(
          target.username
        )
      ) {

        sendJSON(res,