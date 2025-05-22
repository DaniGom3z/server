const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors({ origin: "https://gorila-u7d1.onrender.com", credentials: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://gorila-u7d1.onrender.com",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const rooms = {};

io.on("connection", (socket) => {
  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { hp: 3000, players: new Set(), timer: null, seconds: 0 };
    }

    const room = rooms[roomId];
    room.players.add(socket.id);

    socket.to(roomId).emit("notification", "🔔 Un nuevo jugador ha entrado a la sala.");
    io.to(roomId).emit("playersUpdate", [...room.players]);
    socket.emit("hpUpdate", room.hp);
  });

  socket.on("startTimer", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.timer || room.hp <= 0) return;

    room.seconds = 0;
    room.timer = setInterval(() => {
      room.seconds++;
      io.to(roomId).emit("timer", room.seconds);
    }, 1000);

    io.to(roomId).emit("disableStartButton");
    io.to(roomId).emit("notification", "⏱ ¡El cronómetro ha iniciado!");
  });

  socket.on("attack", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    room.hp = Math.max(0, room.hp - 5);
    const message = room.hp > 0
      ? `Un jugador atacó al gorila. HP restante: ${room.hp}`
      : "¡El gorila ha sido derrotado!";

    io.to(roomId).emit("attack", message);
    io.to(roomId).emit("hpUpdate", room.hp);

    if (room.hp === 0 && room.timer) {
      clearInterval(room.timer);
      room.timer = null;
      io.to(roomId).emit("timerStopped", room.seconds);
    }
  });

  socket.on("resetGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    clearInterval(room.timer);
    room.timer = null;
    room.seconds = 0;
    room.hp = 3000;

    io.to(roomId).emit("gameReset");
    io.to(roomId).emit("hpUpdate", room.hp);
  });

  socket.on("disconnecting", () => {
    const roomIds = [...socket.rooms].filter((r) => r !== socket.id);
    roomIds.forEach((roomId) => {
      const room = rooms[roomId];
      if (room) {
        room.players.delete(socket.id);
        io.to(roomId).emit("playersUpdate", [...room.players]);

        if (room.players.size === 0) {
          clearInterval(room.timer);
          delete rooms[roomId];
        }
      }
    });
  });
});

// 🔧 Usa el puerto proporcionado por Render (o 3000 en local)
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor Socket.io corriendo en puerto ${PORT}`);
});
