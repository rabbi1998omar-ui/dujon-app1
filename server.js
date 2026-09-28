const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, "users.json");

/* =========================================================
   DATABASE
========================================================= */

let db = {
  users: {}
};

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase();
}

function hashPin(pin) {
  return crypto
    .createHash("sha256")
    .update(String(pin))
    .digest("hex");
}

function loadDatabase() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      db = { users: {} };

      try {
        fs.writeFileSync(
          USERS_FILE,
          JSON.stringify(db, null, 2)
        );
      } catch {}

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
      typeof parsed === "object" &&
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

loadDatabase();

console.log(
  "Database users:",
  Object.keys(db.users).length
);

/* =========================================================
   USER HELPERS
========================================================= */

function getUserByPhone(phone) {

  const targetPhone =
    String(phone || "").trim();

  return Object.values(
    db.users
  ).find(
    user =>
      String(user.phone || "").trim() ===
      targetPhone
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

function ensureUserArrays(user) {

  if (!user) return;

  if (!Array.isArray(user.friends)) {
    user.friends = [];
  }

  if (!Array.isArray(user.requests)) {
    user.requests = [];
  }
}

function publicUser(user) {

  if (!user) {
    return null;
  }

  ensureUserArrays(user);

  return {
    username: user.username || "",
    name: user.name || "",
    photo: user.photo || "",
    friends: [...user.friends],
    requests: [...user.requests]
  };
}

/* =========================================================
   HTTP HELPERS
========================================================= */

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

          body +=
            chunk.toString();

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

/* =========================================================
   MIME
========================================================= */

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

/* =========================================================
   HTTP SERVER
========================================================= */

const httpServer =
  http.createServer(
    async (req, res) => {

      const url =
        new URL(
          req.url,
          "http://localhost"
        );

      /* =====================================================
         CORS
      ===================================================== */

      if (
        req.method ===
        "OPTIONS"
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

      /* =====================================================
         HEALTH
      ===================================================== */

      if (
        url.pathname ===
        "/health"
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

      /* =====================================================
         PROFILE SAVE
      ===================================================== */

      if (
        url.pathname ===
          "/api/profile" &&
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

          /* ================================================
             OLD USER BY PHONE
          ================================================= */

          const oldUser =
            getUserByPhone(phone);

          /* ================================================
             USERNAME OWNER
          ================================================= */

          const usernameOwner =
            getUserByUsername(
              username
            );

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

          /* ================================================
             USERNAME CHANGE
          ================================================= */

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

                ensureUserArrays(
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

          /* ================================================
             CREATE / UPDATE USER
          ================================================= */

          const existing =
            oldUser || {};

          const user = {

            username,

            phone,

            pinHash:
              existing.pinHash ||
              hashPin(pin),

            name:
              name ||
              existing.name ||
              "আমি",

            photo:
              photo ||
              existing.photo ||
              "",

            friends:
              Array.isArray(
                existing.friends
              )
                ? existing.friends
                : [],

            requests:
              Array.isArray(
                existing.requests
              )
                ? existing.requests
                : []

          };

          db.users[
            username
          ] = user;

          /* ================================================
             SAVE
          ================================================= */

          const saved =
            saveDatabase();

          console.log(
            "PROFILE SAVED:",
            username,
            phone,
            "users:",
            Object.keys(
              db.users
            ).length
          );

          sendJSON(
            res,
            200,
            {

              ok: true,

              saved,

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

      /* =====================================================
         SEARCH USER
      ===================================================== */

      if (
        url.pathname ===
          "/api/search" &&
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

      /* =====================================================
         SOCIAL
      ===================================================== */

      if (
        url.pathname ===
          "/api/social" &&
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
            getUserByPhone(
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

          ensureUserArrays(
            user
          );

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

      /* =====================================================
         FRIEND REQUEST
      ===================================================== */

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

          /* ================================================
             FIND SENDER
          ================================================= */

          const sender =
            getUserByPhone(
              phone
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

          /* ================================================
             FIND TARGET
          ================================================= */

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

          ensureUserArrays(
            sender
          );

          ensureUserArrays(
            target
          );

          /* ================================================
             ALREADY FRIEND
          ================================================= */

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

          /* ================================================
             ALREADY REQUESTED
          ================================================= */

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

          /* ================================================
             SAVE REQUEST
          ================================================= */

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

      /* =====================================================
         ACCEPT FRIEND
      ===================================================== */

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

          /* ================================================
             FIND RECEIVER
          ================================================= */

          const receiver =
            getUserByPhone(
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

          ensureUserArrays(
            receiver
          );

          /* ================================================
             FIND REQUESTER
          ================================================= */

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

          ensureUserArrays(
            requester
          );

          /* ================================================
             CHECK REQUEST
          ================================================= */

          const requestIndex =
            receiver.requests.find