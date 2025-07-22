const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// --- LUDO GAME CONSTANTS ---
const startPositions = { red: 0, green: 13, yellow: 26, blue: 39 };
const homeEntrances = { red: 51, green: 12, yellow: 25, blue: 38 };
const homePathStarts = { red: 52, green: 58, yellow: 64, blue: 70 };
const homePathEnds = { red: 57, green: 63, yellow: 69, blue: 75 };
const safeSpots = [0, 8, 13, 21, 26, 34, 39, 47];

let rooms = {};

app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/ludogame.html");
});

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // --- ROOM MANAGEMENT ---
    socket.on("createRoom", (playerCount) => {
        let roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        while (rooms[roomCode]) {
            roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        }

        const room = (rooms[roomCode] = {
            players: {},
            playerCount: parseInt(playerCount),
            hostId: socket.id,
            gameState: {
                turn: "red",
                diceValue: 0,
                diceRolled: false,
                playerData: {},
                activePlayers: [],
                winner: null,
            },
        });
        socket.join(roomCode);
        room.players[socket.id] = { color: "red" };
        socket.emit("roomCreated", { roomCode }); // Keep this to switch the creator's screen
        io.to(roomCode).emit("playerUpdate", {
            players: room.players,
            hostId: room.hostId,
            code: roomCode,
        }); // **FIX: Send code here**
        console.log(`Room ${roomCode} created by ${socket.id}`);
    });

    socket.on("joinRoom", (roomCode) => {
        const room = rooms[roomCode];
        if (!room) return socket.emit("error", "Room not found.");
        if (Object.keys(room.players).length >= room.playerCount)
            return socket.emit("error", "Room is full.");

        const assignedColors = Object.values(room.players).map((p) => p.color);
        const allColors = {
            2: ["red", "yellow"],
            3: ["red", "green", "yellow"],
            4: ["red", "green", "yellow", "blue"],
        }[room.playerCount];
        const availableColor = allColors.find(
            (c) => !assignedColors.includes(c),
        );
        if (!availableColor) return socket.emit("error", "No available slots.");

        socket.join(roomCode);
        room.players[socket.id] = { color: availableColor };
        socket.emit("joinedSuccessfully", roomCode); // Keep this to switch the joiner's screen
        io.to(roomCode).emit("playerUpdate", {
            players: room.players,
            hostId: room.hostId,
            code: roomCode,
        }); // **FIX: Send code here**
        console.log(
            `${socket.id} joined room ${roomCode} as ${availableColor}`,
        );
    });

    // --- GAME LOGIC ---
    socket.on("startGame", (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.hostId === socket.id) {
            const activePlayerColors = Object.values(room.players)
                .map((p) => p.color)
                .sort(
                    (a, b) =>
                        ["red", "green", "yellow", "blue"].indexOf(a) -
                        ["red", "green", "yellow", "blue"].indexOf(b),
                );
            room.gameState.activePlayers = activePlayerColors;
            room.gameState.turn = activePlayerColors[0];
            activePlayerColors.forEach((color) => {
                room.gameState.playerData[color] = {
                    tokens: Array(4)
                        .fill(null)
                        .map((_, i) => ({
                            id: `${color}-${i}`,
                            pos: -1,
                            state: "home",
                        })),
                };
            });
            io.to(roomCode).emit("gameStarted", room.gameState);
        }
    });

    socket.on("diceRoll", (roomCode) => {
        const room = rooms[roomCode];
        if (
            !room ||
            room.players[socket.id]?.color !== room.gameState.turn ||
            room.gameState.diceRolled
        )
            return;

        room.gameState.diceValue = Math.floor(Math.random() * 6) + 1;
        room.gameState.diceRolled = true;
        io.to(roomCode).emit("gameStateUpdate", room.gameState);
        const movable = getMovableTokens(room.gameState).length > 0;
        if (!movable) {
            setTimeout(() => {
                if (room.gameState.diceValue !== 6) switchTurn(roomCode);
                else resetTurn(roomCode);
            }, 1000);
        }
    });

    socket.on("moveToken", ({ roomCode, tokenId }) => {
        const room = rooms[roomCode];
        const playerColor = room.players[socket.id]?.color;
        if (
            !room ||
            playerColor !== room.gameState.turn ||
            !room.gameState.diceRolled
        )
            return;

        const tokenToMove = room.gameState.playerData[playerColor].tokens.find(
            (t) => t.id === tokenId,
        );
        if (!getMovableTokens(room.gameState).some((t) => t.id === tokenId))
            return;

        let capturedToken = false;
        const diceValue = room.gameState.diceValue;
        if (tokenToMove.state === "home" && diceValue === 6) {
            tokenToMove.state = "active";
            tokenToMove.pos = startPositions[playerColor];
        } else {
            const currentPos = tokenToMove.pos;
            const homeEntrance = homeEntrances[playerColor];
            if (
                (playerColor !== "red" &&
                    currentPos <= homeEntrance &&
                    currentPos + diceValue > homeEntrance) ||
                tokenToMove.pos >= homePathStarts[playerColor]
            ) {
                const newPos =
                    tokenToMove.pos >= homePathStarts[playerColor]
                        ? currentPos + diceValue
                        : homePathStarts[playerColor] +
                          (currentPos + diceValue - homeEntrance - 1);
                tokenToMove.pos = newPos;
            } else {
                tokenToMove.pos = (currentPos + diceValue) % 52;
            }
        }

        if (tokenToMove.pos === homePathEnds[playerColor])
            tokenToMove.state = "finished";
        if (
            tokenToMove.state === "active" &&
            !safeSpots.includes(tokenToMove.pos)
        ) {
            for (const color of room.gameState.activePlayers) {
                if (color === playerColor) continue;
                room.gameState.playerData[color].tokens.forEach((token) => {
                    if (token.pos === tokenToMove.pos) {
                        token.pos = -1;
                        token.state = "home";
                        capturedToken = true;
                    }
                });
            }
        }
        if (
            room.gameState.playerData[playerColor].tokens.every(
                (t) => t.state === "finished",
            )
        )
            room.gameState.winner = playerColor;
        if (
            diceValue === 6 ||
            capturedToken ||
            tokenToMove.state === "finished"
        )
            resetTurn(roomCode);
        else switchTurn(roomCode);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected:", socket.id);
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                const room = rooms[roomCode];
                delete room.players[socket.id];
                if (Object.keys(room.players).length === 0) {
                    delete rooms[roomCode];
                    console.log(`Room ${roomCode} deleted.`);
                } else {
                    if (room.hostId === socket.id)
                        room.hostId = Object.keys(room.players)[0];
                    io.to(roomCode).emit("playerUpdate", {
                        players: room.players,
                        hostId: room.hostId,
                        code: roomCode,
                    }); // **FIX: Send code here**
                }
                break;
            }
        }
    });
});

function switchTurn(roomCode) {
    const room = rooms[roomCode];
    if (room.gameState.winner) return;
    const { activePlayers, turn } = room.gameState;
    room.gameState.turn =
        activePlayers[(activePlayers.indexOf(turn) + 1) % activePlayers.length];
    resetTurn(roomCode);
}
function resetTurn(roomCode) {
    const room = rooms[roomCode];
    room.gameState.diceValue = 0;
    room.gameState.diceRolled = false;
    io.to(roomCode).emit("gameStateUpdate", room.gameState);
}
function getMovableTokens(gameState) {
    const { turn, diceValue, playerData } = gameState;
    const tokens = playerData[turn].tokens;
    return tokens.filter((token) => {
        if (token.state === "finished") return false;
        if (token.state === "home") return diceValue === 6;
        const homeEntrance = homeEntrances[turn];
        if (
            turn !== "red" &&
            token.pos <= homeEntrance &&
            token.pos + diceValue > homeEntrance
        ) {
            const stepsIntoHome = token.pos + diceValue - homeEntrance - 1;
            return homePathStarts[turn] + stepsIntoHome <= homePathEnds[turn];
        } else if (token.pos >= homePathStarts[turn])
            return token.pos + diceValue <= homePathEnds[turn];
        return true;
    });
}

const PORT = 3000;
server.listen(PORT, () =>
    console.log(`Ludo Server is running on port ${PORT}`),
);
