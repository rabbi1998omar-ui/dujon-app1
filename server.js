const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "users.json");

let users = {};


// ======================================================
// DATABASE
// ======================================================

function loadUsers(){

  try{

    if(fs.existsSync(DATA_FILE)){

      const data =
        fs.readFileSync(
          DATA_FILE,
          "utf8"
        );

      users =
        JSON.parse(data) || {};

    }else{

      users = {};

    }

  }catch(error){

    console.log(
      "Database Load Error:",
      error
    );

    users = {};

  }

}


function saveUsers(){

  try{

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        users,
        null,
        2
      )
    );

  }catch(error){

    console.log(
      "Database Save Error:",
      error
    );

  }

}


loadUsers();


// ======================================================
// HELPERS
// ======================================================

function sendJSON(
  res,
  statusCode,
  data
){

  res.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Access-Control-Allow-Origin":
        "*",

      "Access-Control-Allow-Headers":
        "Content-Type",

      "Access-Control-Allow-Methods":
        "GET,POST,OPTIONS"
    }
  );

  res.end(
    JSON.stringify(data)
  );

}


function readBody(req){

  return new Promise(
    (resolve,reject)=>{

      let body = "";

      req.on(
        "data",
        chunk => {

          body += chunk;

          // Prevent extremely large requests
          if(body.length > 2 * 1024 * 1024){

            reject(
              new Error(
                "Request body too large"
              )
            );

            req.destroy();

          }

        }
      );


      req.on(
        "end",
        ()=>{

          try{

            if(!body){

              resolve({});

              return;

            }


            resolve(
              JSON.parse(body)
            );

          }catch(error){

            reject(error);

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


function hashPIN(pin){

  return crypto
    .createHash("sha256")
    .update(
      String(pin)
    )
    .digest("hex");

}


function cleanUsername(username){

  return String(
    username || ""
  )
    .trim()
    .toLowerCase();

}


function ensureArrays(user){

  if(!user) return;

  if(!Array.isArray(user.friends)){

    user.friends = [];

  }

  if(!Array.isArray(user.requests)){

    user.requests = [];

  }

}


function findUserByUsername(username){

  const clean =
    cleanUsername(username);


  return Object.values(users)
    .find(
      user =>
        cleanUsername(
          user.username
        ) === clean
    );

}


function publicUser(user){

  if(!user){

    return null;

  }


  ensureArrays(user);


  return {

    username:
      user.username || "",

    name:
      user.name || "",

    photo:
      user.photo || "",

    friends:
      [...user.friends],

    requests:
      [...user.requests]

  };

}


// ======================================================
// HTTP SERVER
// ======================================================

const server =
  http.createServer(
    async (req,res)=>{

      // ==================================================
      // CORS / OPTIONS
      // ==================================================

      if(req.method === "OPTIONS"){

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
          `http://${req.headers.host || "localhost"}`
        );


      const pathname =
        url.pathname;


      // ==================================================
      // API
      // ==================================================

      if(
        pathname.startsWith(
          "/api/"
        )
      ){

        try{

          // ==================================================
          // REGISTER
          // ==================================================

          if(
            pathname === "/api/register" &&
            req.method === "POST"
          ){

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
              typeof body.name === "string"
                ? body.name.trim()
                : "আমি";


            const photo =
              typeof body.photo === "string"
                ? body.photo
                : "";


            // Phone

            if(!phone){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "মোবাইল নম্বর দিন"
                }
              );

            }


            // PIN

            if(
              !/^[0-9]{4,6}$/.test(
                pin
              )
            ){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "PIN ৪-৬ সংখ্যার হতে হবে"
                }
              );

            }


            // Username

            if(
              !/^[a-z0-9_]{3,20}$/.test(
                username
              )
            ){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "Username 3-20 অক্ষরের হতে হবে"
                }
              );

            }


            // Duplicate phone

            if(users[phone]){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "এই মোবাইল নম্বর দিয়ে Account আগে থেকেই আছে"
                }
              );

            }


            // Duplicate username

            const existing =
              findUserByUsername(
                username
              );


            if(existing){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "এই Username আগে থেকেই আছে"
                }
              );

            }


            // Create user

            users[phone] = {

              phone:
                phone,

              pinHash:
                hashPIN(pin),

              username:
                username,

              name:
                name || "আমি",

              photo:
                photo,

              friends:
                [],

              requests:
                [],

              createdAt:
                new Date().toISOString()

            };


            saveUsers();


            return sendJSON(
              res,
              201,
              {
                ok:true,

                message:
                  "Account তৈরি হয়েছে ❤️",

                user:
                  publicUser(
                    users[phone]
                  )
              }
            );

          }


          // ==================================================
          // SOCIAL
          // ==================================================

          if(
            pathname === "/api/social" &&
            req.method === "POST"
          ){

            const body =
              await readBody(req);


            const phone =
              String(
                body.phone || ""
              ).trim();


            const pin =
              String(
                body.pin || ""
              );


            const user =
              users[phone];


            if(!user){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "Account পাওয়া যায়নি"
                }
              );

            }


            if(
              user.pinHash !==
              hashPIN(pin)
            ){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

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
                ok:true,

                user:
                  publicUser(user)
              }
            );

          }


          // ==================================================
          // PROFILE
          // ==================================================

          if(
            pathname === "/api/profile" &&
            req.method === "POST"
          ){

            const body =
              await readBody(req);


            const phone =
              String(
                body.phone || ""
              ).trim();


            const pin =
              String(
                body.pin || ""
              );


            const user =
              users[phone];


            if(!user){

              return sendJSON(
                res,
                404,
                {
                  ok:false,

                  message:
                    "Account পাওয়া যায়নি"
                }
              );

            }


            if(
              user.pinHash !==
              hashPIN(pin)
            ){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "PIN ভুল"
                }
              );

            }


            ensureArrays(user);


            const oldUsername =
              user.username;


            const newUsername =
              cleanUsername(
                body.username ||
                user.username
              );


            if(!newUsername){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "Username দিন"
                }
              );

            }


            const existing =
              findUserByUsername(
                newUsername
              );


            if(
              existing &&
              existing !== user
            ){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "এই Username আগে থেকেই আছে"
                }
              );

            }


            user.username =
              newUsername;


            if(
              typeof body.name ===
              "string"
            ){

              user.name =
                body.name.trim();

            }


            if(
              typeof body.photo ===
              "string"
            ){

              user.photo =
                body.photo;

            }


            // Update friends and requests
            // if username changes

            if(
              oldUsername &&
              oldUsername !==
              newUsername
            ){

              Object.values(users)
                .forEach(
                  other => {

                    ensureArrays(
                      other
                    );


                    other.friends =
                      other.friends.map(
                        friend =>

                          cleanUsername(
                            friend
                          ) ===
                          cleanUsername(
                            oldUsername
                          )
                            ? newUsername
                            : friend
                      );


                    other.requests =
                      other.requests.map(
                        request =>

                          cleanUsername(
                            request
                          ) ===
                          cleanUsername(
                            oldUsername
                          )
                            ? newUsername
                            : request
                      );

                  }
                );

            }


            saveUsers();


            return sendJSON(
              res,
              200,
              {
                ok:true,

                message:
                  "Profile updated",

                user:
                  publicUser(user)
              }
            );

          }


          // ==================================================
          // SEARCH USER
          // GET:
          // /api/search?username=rabbi
          //
          // POST:
          // { username:"rabbi" }
          // ==================================================

          if(
            pathname === "/api/search" &&
            (
              req.method === "GET" ||
              req.method === "POST"
            )
          ){

            let username = "";


            // GET

            if(
              req.method === "GET"
            ){

              username =
                cleanUsername(
                  url.searchParams.get(
                    "username"
                  )
                );

            }


            // POST

            if(
              req.method === "POST"
            ){

              const body =
                await readBody(req);


              username =
                cleanUsername(
                  body.username
                );

            }


            if(!username){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "Username দিন"
                }
              );

            }


            const user =
              findUserByUsername(
                username
              );


            if(!user){

              return sendJSON(
                res,
                200,
                {
                  ok:true,

                  found:false,

                  user:null
                }
              );

            }


            return sendJSON(
              res,
              200,
              {
                ok:true,

                found:true,

                user:{

                  username:
                    user.username || "",

                  name:
                    user.name || "",

                  photo:
                    user.photo || ""

                }
              }
            );

          }


          // ==================================================
          // FRIEND REQUEST
          // ==================================================

          if(
            pathname === "/api/friend-request" &&
            req.method === "POST"
          ){

            const body =
              await readBody(req);


            const phone =
              String(
                body.phone || ""
              ).trim();


            const pin =
              String(
                body.pin || ""
              );


            const username =
              cleanUsername(
                body.username
              );


            const sender =
              users[phone];


            if(!sender){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "Account পাওয়া যায়নি"
                }
              );

            }


            if(
              sender.pinHash !==
              hashPIN(pin)
            ){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "PIN ভুল"
                }
              );

            }


            ensureArrays(
              sender
            );


            if(!username){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "Username দিন"
                }
              );

            }


            if(
              cleanUsername(
                sender.username
              ) === username
            ){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "নিজেকে Friend করা যাবে না"
                }
              );

            }


            const target =
              findUserByUsername(
                username
              );


            if(!target){

              return sendJSON(
                res,
                404,
                {
                  ok:false,

                  message:
                    "User পাওয়া যায়নি"
                }
              );

            }


            ensureArrays(
              target
            );


            // Already friend

            const alreadyFriend =
              target.friends.some(
                friend =>
                  cleanUsername(
                    friend
                  ) ===
                  cleanUsername(
                    sender.username
                  )
              );


            if(alreadyFriend){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "ইতিমধ্যে Friend"
                }
              );

            }


            // Already requested

            const alreadyRequested =
              target.requests.some(
                request =>
                  cleanUsername(
                    request
                  ) ===
                  cleanUsername(
                    sender.username
                  )
              );


            if(alreadyRequested){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "Friend Request আগে থেকেই পাঠানো হয়েছে"
                }
              );

            }


            target.requests.push(
              sender.username
            );


            saveUsers();


            return sendJSON(
              res,
              200,
              {
                ok:true,

                message:
                  "Friend Request পাঠানো হয়েছে ❤️"
              }
            );

          }


          // ==================================================
          // FRIEND ACCEPT
          // ==================================================

          if(
            pathname === "/api/friend-accept" &&
            req.method === "POST"
          ){

            const body =
              await readBody(req);


            const phone =
              String(
                body.phone || ""
              ).trim();


            const pin =
              String(
                body.pin || ""
              );


            const username =
              cleanUsername(
                body.username
              );


            const receiver =
              users[phone];


            if(!receiver){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "Account পাওয়া যায়নি"
                }
              );

            }


            if(
              receiver.pinHash !==
              hashPIN(pin)
            ){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "PIN ভুল"
                }
              );

            }


            ensureArrays(
              receiver
            );


            if(!username){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "Username পাওয়া যায়নি"
                }
              );

            }


            // Find requester

            const requester =
              findUserByUsername(
                username
              );


            if(!requester){

              return sendJSON(
                res,
                404,
                {
                  ok:false,

                  message:
                    "যে User Request পাঠিয়েছে তাকে পাওয়া যায়নি"
                }
              );

            }


            ensureArrays(
              requester
            );


            const receiverUsername =
              cleanUsername(
                receiver.username
              );


            const requesterUsername =
              cleanUsername(
                requester.username
              );


            // Check request

            const requestIndex =
              receiver.requests.findIndex(
                request =>
                  cleanUsername(
                    request
                  ) ===
                  requesterUsername
              );


            if(requestIndex === -1){

              return sendJSON(
                res,
                400,
                {
                  ok:false,

                  message:
                    "এই Friend Request পাওয়া যায়নি"
                }
              );

            }


            // Remove request

            receiver.requests.splice(
              requestIndex,
              1
            );


            // Receiver -> requester

            const receiverAlreadyFriend =
              receiver.friends.some(
                friend =>
                  cleanUsername(
                    friend
                  ) ===
                  requesterUsername
              );


            if(
              !receiverAlreadyFriend
            ){

              receiver.friends.push(
                requester.username
              );

            }


            // Requester -> receiver

            const requesterAlreadyFriend =
              requester.friends.some(
                friend =>
                  cleanUsername(
                    friend
                  ) ===
                  receiverUsername
              );


            if(
              !requesterAlreadyFriend
            ){

              requester.friends.push(
                receiver.username
              );

            }


            // Remove opposite request

            requester.requests =
              requester.requests.filter(
                request =>
                  cleanUsername(
                    request
                  ) !==
                  receiverUsername
              );


            saveUsers();


            return sendJSON(
              res,
              200,
              {
                ok:true,

                message:
                  "Friend হয়েছে ❤️",

                user:
                  publicUser(
                    receiver
                  ),

                friend:
                  publicUser(
                    requester
                  ),

                friends:
                  [
                    ...receiver.friends
                  ],

                requests:
                  [
                    ...receiver.requests
                  ]

              }
            );

          }


          // ==================================================
          // FRIEND REJECT
          // ==================================================

          if(
            pathname === "/api/friend-reject" &&
            req.method === "POST"
          ){

            const body =
              await readBody(req);


            const phone =
              String(
                body.phone || ""
              ).trim();


            const pin =
              String(
                body.pin || ""
              );


            const username =
              cleanUsername(
                body.username
              );


            const receiver =
              users[phone];


            if(!receiver){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "Account পাওয়া যায়নি"
                }
              );

            }


            if(
              receiver.pinHash !==
              hashPIN(pin)
            ){

              return sendJSON(
                res,
                401,
                {
                  ok:false,

                  message:
                    "PIN ভুল"
                }
              );

            }


            ensureArrays(
              receiver
            );


            receiver.requests =
              receiver.requests.filter(
                request =>
                  cleanUsername(
                    request
                  ) !== username
              );


            saveUsers();


            return sendJSON(
              res,
              200,
              {
                ok:true,

                message:
                  "Request বাতিল করা হয়েছে",

                user:
                  publicUser(
                    receiver
                  )
              }
            );

          }


          // ==================================================
          // UNKNOWN API
          // ==================================================

          return sendJSON(
            res,
            404,
            {
              ok:false,

              message:
                "API not found"
            }
          );


        }catch(error){

          console.log(
            "API Error:",
            error
          );


          return sendJSON(
            res,
            500,
            {
              ok:false,

              message:
                "Server error"
            }
          );

        }

      }


      // ======================================================
      // STATIC FILES
      // ======================================================

      let filePath;


      if(pathname === "/"){

        filePath =
          path.join(
            __dirname,
            "index.html"
          );

      }else{

        filePath =
          path.join(
            __dirname,
            pathname
          );

      }


      // Security

      const normalizedPath =
        path.resolve(
          filePath
        );


      const normalizedRoot =
        path.resolve(
          __dirname
        );


      if(
        normalizedPath !== normalizedRoot &&
        !normalizedPath.startsWith(
          normalizedRoot + path.sep
        )
      ){

        res.writeHead(
          403
        );

        res.end(
          "Forbidden"
        );

        return;

      }


      fs.readFile(
        filePath,
        (error,data)=>{

          if(error){

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
              filePath
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


// ======================================================
// WEBSOCKET
// ======================================================

const wss =
  new WebSocket.Server({
    server
  });


const rooms =
  new Map();


function generateRoomCode(){

  let code;


  do{

    code =
      Math.floor(
        100000 +
        Math.random() *
        900000
      ).toString();

  }while(
    rooms.has(code)
  );


  return code;

}


function sendWS(
  ws,
  data
){

  if(
    ws &&
    ws.readyState ===
    WebSocket.OPEN
  ){

    ws.send(
      JSON.stringify(data)
    );

  }

}


wss.on(
  "connection",
  ws => {

    console.log(
      "WebSocket connected"
    );


    ws.roomCode = null;


    ws.on(
      "message",
      raw => {

        try{

          const message =
            JSON.parse(
              raw.toString()
            );


          // ==================================================
          // CREATE ROOM
          // ==================================================

          if(
            message.type ===
            "create-room"
          ){

            const code =
              generateRoomCode();


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


          // ==================================================
          // JOIN ROOM
          // ==================================================

          if(
            message.type ===
            "join-room"
          ){

            const code =
              String(
                message.roomCode ||
                ""
              ).trim();


            if(!code){

              sendWS(
                ws,
                {
                  type:
                    "error",

                  message:
                    "Room Code দিন"
                }
              );

              return;

            }


            let room =
              rooms.get(code);


            if(!room){

              room =
                new Set();

              rooms.set(
                code,
                room
              );

            }


            if(room.size >= 2){

              sendWS(
                ws,
                {
                  type:
                    "error",

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


            room.forEach(
              peer => {

                if(
                  peer !== ws
                ){

                  sendWS(
                    peer,
                    {
                      type:
                        "peer-joined"
                    }
                  );

                }

              }
            );


            return;

          }


          // ==================================================
          // ROOM MESSAGE / WEBRTC SIGNAL
          // ==================================================

          if(
            ws.roomCode
          ){

            const room =
              rooms.get(
                ws.roomCode
              );


            if(room){

              room.forEach(
                peer => {

                  if(
                    peer !== ws
                  ){

                    sendWS(
                      peer,
                      message
                    );

                  }

                }
              );

            }

          }


        }catch(error){

          console.log(
            "WebSocket Message Error:",
            error
          );

        }

      }
    );


    // ==================================================
    // DISCONNECT
    // ==================================================

    ws.on(
      "close",
      ()=>{

        console.log(
          "WebSocket disconnected"
        );


        const code =
          ws.roomCode;


        if(!code) return;


        const room =
          rooms.get(
            code
          );


        if(!room) return;


        room.delete(ws);


        room.forEach(
          peer => {

            sendWS(
              peer,
              {
                type:
                  "peer-left"
              }
            );

          }
        );


        if(
          room.size === 0
        ){

          rooms.delete(
            code
          );

        }

      }
    );


  }
);


// ======================================================
// START SERVER
// ======================================================

server.listen(
  PORT,
  "0.0.0.0",
  ()=>{

    console.log(
      `Dujon server running on port ${PORT}`
    );

  }
);