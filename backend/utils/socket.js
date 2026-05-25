const socketIo = require('socket.io');

let io = null;

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    
    // Join room based on user role or ID (e.g. doctor ID or 'doctors')
    socket.on('join', (room) => {
      socket.join(room);
      console.log(`🔌 Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIo = () => {
  return io;
};

module.exports = { initSocket, getIo };
