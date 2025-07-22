document.addEventListener("DOMContentLoaded", () => {
    const socket = io();

    // UI Elements
    const screens = {
        home: document.getElementById("home-screen"),
        lobby: document.getElementById("lobby-screen"),
        game: document.getElementById("game-screen"),
    };
    const modals = {
        join: document.getElementById("join-room-modal"),
        winner: document.getElementById("winner-modal"),
    };
    const lobbyCodeDisplay = document.getElementById("lobby-code");
    const playerList = document.getElementById("player-list");
    const startGameBtn = document.getElementById("start-game-btn");
    const boardElement = document.getElementById("ludo-board");
    const diceElement = document.getElementById("dice");
    const turnIndicator = document.getElementById("turn-indicator");
    const gameMessage = document.getElementById("game-message");

    // Local State
    let myColor = null;
    let roomCode = null;

    // --- EVENT LISTENERS ---
    document
        .querySelectorAll("[data-players]")
        .forEach((button) =>
            button.addEventListener("click", () =>
                socket.emit("createRoom", button.dataset.players),
            ),
        );
    document
        .getElementById("join-room-btn-home")
        .addEventListener("click", () =>
            modals.join.classList.remove("hidden"),
        );
    modals.join
        .querySelector(".close-button")
        .addEventListener("click", () => modals.join.classList.add("hidden"));
    document.getElementById("submit-join-btn").addEventListener("click", () => {
        const codeInput = document.getElementById("room-code-input");
        if (codeInput.value) {
            socket.emit("joinRoom", codeInput.value.toUpperCase());
            codeInput.value = "";
        }
    });
    startGameBtn.addEventListener("click", () =>
        socket.emit("startGame", roomCode),
    );
    diceElement.addEventListener("click", () => {
        if (diceElement.style.cursor === "pointer")
            socket.emit("diceRoll", roomCode);
    });
    document
        .getElementById("main-menu-btn")
        .addEventListener("click", () => window.location.reload());

    // --- SOCKET.IO HANDLERS ---
    socket.on("roomCreated", (data) => {
        myColor = "red";
        roomCode = data.roomCode;
    });
    socket.on("joinedSuccessfully", (code) => {
        roomCode = code;
        modals.join.classList.add("hidden");
    });

    // **DEFINITIVE FIX: This handler now controls showing and updating the lobby.**
    socket.on("playerUpdate", (data) => {
        showScreen("lobby"); // Show the lobby screen ONLY when we have all data.
        lobbyCodeDisplay.textContent = data.code; // Update the code.

        if (!myColor) {
            const me = Object.entries(data.players).find(
                ([id]) => id === socket.id,
            );
            if (me) myColor = me[1].color;
        }

        playerList.innerHTML = Object.entries(data.players)
            .map(
                ([id, player]) =>
                    `<div class="player-item" style="background-color: var(--${player.color}-color);">${player.color.charAt(0).toUpperCase() + player.color.slice(1)} ${id === data.hostId ? "(Host)" : ""}</div>`,
            )
            .join("");

        const isHost = socket.id === data.hostId;
        const canStart = Object.keys(data.players).length >= 2;
        startGameBtn.disabled = !isHost || !canStart;
        if (isHost)
            startGameBtn.textContent = canStart
                ? "Start Game"
                : "Waiting for players...";
    });

    socket.on("gameStarted", (gameState) => {
        showScreen("game");
        createBoard();
        renderGameState(gameState);
    });
    socket.on("gameStateUpdate", (gameState) => renderGameState(gameState));
    socket.on("error", (message) => alert(`Error: ${message}`));

    // --- RENDER & HELPER FUNCTIONS (No changes needed below this line) ---
    function showScreen(screenName) {
        Object.values(screens).forEach((s) => s.classList.add("hidden"));
        screens[screenName].classList.remove("hidden");
    }
    function renderGameState(gameState) {
        const {
            turn,
            diceValue,
            diceRolled,
            playerData,
            winner,
            activePlayers,
        } = gameState;
        turnIndicator.textContent = `${turn.charAt(0).toUpperCase() + turn.slice(1)}'s Turn`;
        turnIndicator.style.backgroundColor = `var(--${turn}-color)`;
        diceElement.textContent = diceValue || "?";
        if (myColor === turn && !diceRolled) {
            diceElement.style.cursor = "pointer";
            diceElement.style.borderColor = `var(--${myColor}-color)`;
            gameMessage.textContent = "Roll the dice!";
        } else {
            diceElement.style.cursor = "not-allowed";
            diceElement.style.borderColor = "transparent";
            gameMessage.textContent =
                myColor === turn
                    ? "Click a token to move!"
                    : `Waiting for ${turn}...`;
        }
        boardElement.querySelectorAll(".token").forEach((t) => t.remove());
        const movableTokens =
            myColor === turn && diceRolled
                ? getMovableTokensClient(gameState)
                : [];
        for (const color of activePlayers) {
            playerData[color].tokens.forEach((token, index) => {
                const parentEl = getParentCellForToken(token, index);
                const tokenEl = document.createElement("div");
                tokenEl.id = token.id;
                tokenEl.className = `token ${color} ${token.state === "home" ? "in-home" : ""}`;
                if (movableTokens.some((t) => t.id === token.id)) {
                    tokenEl.classList.add("movable");
                    tokenEl.addEventListener("click", () =>
                        socket.emit("moveToken", {
                            roomCode,
                            tokenId: token.id,
                        }),
                    );
                }
                parentEl.appendChild(tokenEl);
            });
        }
        if (winner) {
            modals.winner.classList.remove("hidden");
            modals.winner.querySelector("#winner-message").textContent =
                `${winner.charAt(0).toUpperCase() + winner.slice(1)} Wins!`;
        }
    }
    function createBoard() {
        boardElement.innerHTML = "";
        for (let r = 1; r <= 15; r++)
            for (let c = 1; c <= 15; c++) {
                const cell = document.createElement("div");
                cell.className = "cell";
                cell.dataset.pos = `${r}-${c}`;
                cell.style.gridArea = `${r}/${c}`;
                boardElement.appendChild(cell);
            }
        ["red", "green", "yellow", "blue"].forEach((color) => {
            const base = document.createElement("div");
            base.className = `base base-${color}`;
            base.innerHTML = `<div class="yard">${[...Array(4)].map((_, i) => `<div class="start-circle" data-pos="${color}-start-${i}"></div>`).join("")}</div>`;
            boardElement.appendChild(base);
        });
        boardElement.appendChild(document.createElement("div")).className =
            "center-triangle";
        const safeSpots = [0, 8, 13, 21, 26, 34, 39, 47];
        pathCoords.main.forEach((coord, i) => {
            if (safeSpots.includes(i))
                boardElement
                    .querySelector(`[data-pos='${coord.r}-${coord.c}']`)
                    .classList.add("safe-spot");
        });
        Object.keys(pathCoords).forEach((color) => {
            if (color !== "main")
                pathCoords[color].forEach((coord) =>
                    boardElement
                        .querySelector(`[data-pos='${coord.r}-${coord.c}']`)
                        .classList.add(`path-${color}`),
                );
        });
    }
    const pathCoords = {
        main: [
            { r: 7, c: 2 },
            { r: 7, c: 3 },
            { r: 7, c: 4 },
            { r: 7, c: 5 },
            { r: 7, c: 6 },
            { r: 6, c: 7 },
            { r: 5, c: 7 },
            { r: 4, c: 7 },
            { r: 3, c: 7 },
            { r: 2, c: 7 },
            { r: 1, c: 7 },
            { r: 1, c: 8 },
            { r: 1, c: 9 },
            { r: 2, c: 9 },
            { r: 3, c: 9 },
            { r: 4, c: 9 },
            { r: 5, c: 9 },
            { r: 6, c: 9 },
            { r: 7, c: 10 },
            { r: 7, c: 11 },
            { r: 7, c: 12 },
            { r: 7, c: 13 },
            { r: 7, c: 14 },
            { r: 7, c: 15 },
            { r: 8, c: 15 },
            { r: 9, c: 15 },
            { r: 9, c: 14 },
            { r: 9, c: 13 },
            { r: 9, c: 12 },
            { r: 9, c: 11 },
            { r: 9, c: 10 },
            { r: 10, c: 9 },
            { r: 11, c: 9 },
            { r: 12, c: 9 },
            { r: 13, c: 9 },
            { r: 14, c: 9 },
            { r: 15, c: 9 },
            { r: 15, c: 8 },
            { r: 15, c: 7 },
            { r: 14, c: 7 },
            { r: 13, c: 7 },
            { r: 12, c: 7 },
            { r: 11, c: 7 },
            { r: 10, c: 7 },
            { r: 9, c: 6 },
            { r: 9, c: 5 },
            { r: 9, c: 4 },
            { r: 9, c: 3 },
            { r: 9, c: 2 },
            { r: 9, c: 1 },
            { r: 8, c: 1 },
        ],
        red: Array.from({ length: 6 }, (_, i) => ({ r: 8, c: i + 2 })),
        green: Array.from({ length: 6 }, (_, i) => ({ r: i + 2, c: 8 })),
        yellow: Array.from({ length: 6 }, (_, i) => ({ r: 8, c: 14 - i })),
        blue: Array.from({ length: 6 }, (_, i) => ({ r: 14 - i, c: 8 })),
    };
    const homePathStarts = { red: 52, green: 58, yellow: 64, blue: 70 };
    function getParentCellForToken(token, tokenIndex) {
        const color = token.id.split("-")[0];
        if (token.state === "home")
            return boardElement.querySelector(
                `[data-pos='${color}-start-${tokenIndex}']`,
            );
        const path =
            token.pos >= homePathStarts[color]
                ? pathCoords[color]
                : pathCoords.main;
        const indexInPath =
            token.pos >= homePathStarts[color]
                ? token.pos - homePathStarts[color]
                : token.pos;
        const { r, c } = path[indexInPath];
        return boardElement.querySelector(`[data-pos='${r}-${c}']`);
    }
    function getMovableTokensClient(gameState) {
        const { turn, diceValue, playerData } = gameState;
        if (turn !== myColor) return [];
        const homeEntrances = { red: 51, green: 12, yellow: 25, blue: 38 },
            homePathEnds = { red: 57, green: 63, yellow: 69, blue: 75 };
        return playerData[turn].tokens.filter((token) => {
            if (token.state === "finished") return false;
            if (token.state === "home") return diceValue === 6;
            const homeEntrance = homeEntrances[turn];
            if (
                (turn !== "red" &&
                    token.pos <= homeEntrance &&
                    token.pos + diceValue > homeEntrance) ||
                (turn === "red" && token.pos > 40 && token.pos + diceValue > 51)
            ) {
                const stepsIntoHome = (token.pos + diceValue) % 52;
                return (
                    homePathStarts[turn] + stepsIntoHome <= homePathEnds[turn]
                );
            } else if (token.pos >= homePathStarts[turn])
                return token.pos + diceValue <= homePathEnds[turn];
            return true;
        });
    }
});
