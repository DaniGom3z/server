const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
// Ajusta el origin según donde hagas pruebas local o despliegues
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
    // Crear sala si no existe
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        hp: 3000, 
        players: [],     // Array para mantener orden de llegada
        timer: null,     
        seconds: 0 
      };
    }

    const room = rooms[roomId];
    // Determinar si este socket es el primer jugador (host)
    const isFirst = room.players.length === 0;
    room.players.push(socket.id);
    socket.join(roomId);

    if (isFirst) {
      // Notificar a este socket que es el host
      socket.emit("youAreHost");
    }

    // Notificar a todos los jugadores la lista actualizada
    socket.to(roomId).emit("notification", "🔔 Un nuevo jugador ha entrado a la sala.");
    io.to(roomId).emit("playersUpdate", [...room.players]);
    // Enviar HP actual al recién llegado
    socket.emit("hpUpdate", room.hp);
  });

  socket.on("startTimer", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.timer || room.hp <= 0) return;

    // Solo el host (primer jugador en el array) puede iniciar
    if (socket.id !== room.players[0]) return;

    room.seconds = 0;
    room.timer = setInterval(() => {
      room.seconds++;
      io.to(roomId).emit("timer", room.seconds);
    }, 1000);

    // Avisar a todos que el cronómetro arrancó
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

      // Solo host ve el botón de reinicio
      const hostId = room.players[0];
      io.to(hostId).emit("showResetButton");
    }
  });

  socket.on("resetGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    clearInterval(room.timer);
    room.timer = null;
    room.seconds = 0;
    room.hp = 3000;

    // Reiniciar en todos los clientes
    io.to(roomId).emit("gameReset");
    io.to(roomId).emit("hpUpdate", room.hp);

    // Solo host vuelve a ver “Iniciar Tiempo” y, tras reinicio, resetBtn queda oculto
    const hostId = room.players[0];
    io.to(hostId).emit("youAreHost");
  });

  socket.on("disconnecting", () => {
    // Cuando un jugador se desconecta, lo removemos del array
    const roomIds = [...socket.rooms].filter((r) => r !== socket.id);
    roomIds.forEach((roomId) => {
      const room = rooms[roomId];
      if (room) {
        room.players = room.players.filter((id) => id !== socket.id);
        io.to(roomId).emit("playersUpdate", [...room.players]);

        // Si ya no quedan jugadores, eliminamos la sala
        if (room.players.length === 0) {
          clearInterval(room.timer);
          delete rooms[roomId];
        }
      }
    });
  });
});

// Puerto dinámico para Render o local
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor Socket.io corriendo en puerto ${PORT}`);
});
