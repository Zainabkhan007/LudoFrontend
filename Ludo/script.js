const userSelectedColor = localStorage.getItem('playerColor') || 'blue';

const blue_Board = document.getElementById("blue-Board");
const green_Board = document.getElementById("green-Board");
const red_Board = document.getElementById("red-Board");
const yellow_Board = document.getElementById("yellow-Board");

const diceImages = {
    blue: document.getElementById('dice-blue'),
    red: document.getElementById('dice-red'),
    green: document.getElementById('dice-green'),
    yellow: document.getElementById('dice-yellow')
};

const rollButtons = {
    blue: createRollButton('blue'),
    red: createRollButton('red'),
    green: createRollButton('green'),
    yellow: createRollButton('yellow')
};

// Attach roll buttons under each dice
for (const color in rollButtons) {
    diceImages[color].parentElement.appendChild(rollButtons[color]);
}

function createRollButton(color) {
    const btn = document.createElement('button');
    btn.textContent = 'ROLL';
    btn.classList.add('team-roll-btn');
    btn.style.marginTop = '8px';
    btn.style.padding = '6px 12px';
    btn.disabled = true;
    btn.addEventListener('click', () => handleRoll(color));
    return btn;
}

let playerTurns = [];
let currentPlayerTurnIndex = 0;
let currentPlayerTurnStatus = true;
let teamHasBonus = false;
let diceResult;

const pathArray = [
    "b1", "b2", "b3", "b4", "b5", "b6",
    "b7", "b8", "b9", "b10", "b11", "b12", "b13",
    "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13",
    "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13",
    "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9", "y10", "y11", "y12", "y13"
];
const safePaths = ["b9", "r9", "g9", "y9"];

class Player_Piece {
    constructor(team, id, status, homeEntry, piece_id, entry) {
        this.team = team;
        this.id = id;
        this.status = status;
        this.homeEntry = homeEntry;
        this.position = null;
        this.piece_id = piece_id;
        this.entry = entry;
    }

    unlockPiece() {
        this.status = 1;
        this.position = this.entry;
        document.getElementById(this.entry).appendChild(document.querySelector(`[piece_id="${this.piece_id}"]`));
    }

    movePiece(array) {
        array.forEach((pos, idx) => {
            setTimeout(() => {
                const el = document.querySelector(`[piece_id="${this.piece_id}"]`);
                document.getElementById(pos).appendChild(el);
                this.position = pos;
            }, idx * 175);
        });
    }

    sentMeToBoard() {
        this.status = 0;
        this.position = null;
        const homeSpan = document.getElementById(this.id);
        const piece = document.querySelector(`[piece_id="${this.piece_id}"]`);
        if (homeSpan && piece) homeSpan.appendChild(piece);
    }
}

let playerPieces = [];
const boardDetails = [
    { boardColor: 'blue', board: blue_Board, homeEntry: 'y13', gameEntry: 'b1' },
    { boardColor: 'green', board: green_Board, homeEntry: 'r13', gameEntry: 'g1' },
    { boardColor: 'red', board: red_Board, homeEntry: 'b13', gameEntry: 'r1' },
    { boardColor: 'yellow', board: yellow_Board, homeEntry: 'g13', gameEntry: 'y1' }
];

for (let i = 0; i < boardDetails.length; i++) {
    const { boardColor, board, homeEntry, gameEntry } = boardDetails[i];
    const parentDiv = document.createElement('div');

    for (let j = 0; j < 4; j++) {
        const span = document.createElement('span');
        const icon = document.createElement('i');
        icon.classList.add('fa-solid', 'fa-location-pin', 'piece', `${boardColor}-piece`);
        icon.setAttribute('piece_id', `${boardColor}${j}`);

        if (boardColor === userSelectedColor) {
            icon.setAttribute('myPieceNum', j + 1);
            icon.addEventListener('click', (e) => turnForUser(e));
        }

        const player = new Player_Piece(boardColor, `${j}_${boardColor}`, 0, homeEntry, `${boardColor}${j}`, gameEntry);
        playerPieces.push(player);
        span.setAttribute('id', `${j}_${boardColor}`);
        span.append(icon);
        parentDiv.append(span);
    }

    board.append(parentDiv);
}

playerTurns = boardDetails.map(obj => obj.boardColor);
currentPlayerTurnIndex = playerTurns.indexOf(userSelectedColor);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const setPlayerTurn = (i) => {
    document.querySelectorAll('.board').forEach(b => b.classList.remove('active'));
    Object.keys(rollButtons).forEach(color => {
        rollButtons[color].disabled = color !== playerTurns[i];
    });

    const current = playerTurns[i];
    const boardObj = boardDetails.find(obj => obj.boardColor === current);
    boardObj?.board?.classList.add('active');
};

setPlayerTurn(currentPlayerTurnIndex);

const nextTeamTurn = async () => {
    currentPlayerTurnIndex = (currentPlayerTurnIndex + 1) % playerTurns.length;
    setPlayerTurn(currentPlayerTurnIndex);
    await delay(500);

    if (playerTurns[currentPlayerTurnIndex] !== userSelectedColor) {
        rollDiceButtonForBot();
    }
};

function giveArrayForMovingPath(piece) {
    const moveArray = [];

    if (piece.status === 0 && diceResult === 6) {
        moveArray.push(piece.entry);
        return moveArray;
    }

    if (piece.status === 1 && piece.position) {
        const currentIndex = pathArray.indexOf(piece.position);
        if (currentIndex === -1) return [];

        const targetIndex = currentIndex + diceResult;
        if (targetIndex >= pathArray.length) return [];

        for (let i = currentIndex + 1; i <= targetIndex; i++) {
            moveArray.push(pathArray[i]);
        }
    }

    return moveArray;
}

const turnForUser = async (e) => {
    const currentTeam = playerTurns[currentPlayerTurnIndex];
    if (currentTeam !== userSelectedColor || !currentPlayerTurnStatus) return;

    const piece = playerPieces.find(
        p => p.piece_id === e.target.getAttribute('piece_id') && p.team === currentTeam
    );

    if (!piece) return;

    const array = giveArrayForMovingPath(piece);
    if (array.length === 0) return;

    currentPlayerTurnStatus = false;

    const opponents = playerPieces.filter(p => p.team !== currentTeam && p.status === 1);
    const cut = opponents.find(p => p.position === array[array.length - 1] && !safePaths.includes(p.position));

    if (cut) {
        piece.movePiece(array);
        await delay(array.length * 175);
        cut.sentMeToBoard();
        currentPlayerTurnStatus = true;
        if (diceResult === 6) return;
        nextTeamTurn();
        return;
    }

    if (piece.status === 0 && diceResult === 6) {
        piece.unlockPiece();
        await delay(400);
        currentPlayerTurnStatus = true;
        return;
    }

    if (piece.status === 1 && array.length > 0) {
        piece.movePiece(array);
        await delay(array.length * 175);
        currentPlayerTurnStatus = true;
        if (diceResult !== 6) {
            nextTeamTurn();
        }
        return;
    }

    currentPlayerTurnStatus = true;
};

const rollDiceGif = new Image();
rollDiceGif.src = `./Assets/rollDice.gif`;

async function handleRoll(color) {
    const currentTeam = playerTurns[currentPlayerTurnIndex];
    if (color !== currentTeam || !currentPlayerTurnStatus) return;

    rollButtons[color].disabled = true;
    diceImages[color].src = rollDiceGif.src;

    diceResult = Math.floor(Math.random() * 6) + 1;
    teamHasBonus = (diceResult === 6);
    currentPlayerTurnStatus = true;

    setTimeout(async () => {
        diceImages[color].src = `./Assets/Dice_${diceResult}.png`;
        await delay(700);

        const totalUnlocked = playerPieces.filter(obj => obj.team === currentTeam && obj.status === 1);
        if (diceResult !== 6 && totalUnlocked.length === 0) {
            await delay(500);
            currentPlayerTurnStatus = true;
            nextTeamTurn();
        }
    }, 600);
}

function turnForBot() {
    const currentTeam = playerTurns[currentPlayerTurnIndex];
    const botPieces = playerPieces.filter(p => p.team === currentTeam);
    const unlockedPieces = botPieces.filter(p => p.status === 1);
    const lockedPieces = botPieces.filter(p => p.status === 0);

    if (diceResult === 6 && lockedPieces.length > 0) {
        const piece = lockedPieces[0];
        piece.unlockPiece();
        currentPlayerTurnStatus = true;
        setTimeout(() => rollDiceButtonForBot(), 700);
        return;
    }

    for (let piece of unlockedPieces) {
        const array = giveArrayForMovingPath(piece);
        if (array.length > 0) {
            piece.movePiece(array);
            currentPlayerTurnStatus = true;
            if (diceResult === 6) {
                setTimeout(() => rollDiceButtonForBot(), 1000);
            } else {
                nextTeamTurn();
            }
            return;
        }
    }

    currentPlayerTurnStatus = true;
    nextTeamTurn();
}

const rollDiceButtonForBot = () => {
    if (!currentPlayerTurnStatus) return;

    const team = playerTurns[currentPlayerTurnIndex];
    diceImages[team].src = rollDiceGif.src;

    diceResult = Math.floor(Math.random() * 6) + 1;
    currentPlayerTurnStatus = true;

    setTimeout(async () => {
        diceImages[team].src = `./Assets/Dice_${diceResult}.png`;
        await delay(700);
        turnForBot();
    }, 600);
};

document.addEventListener('keydown', (e) => {
    const currentTeam = playerTurns[currentPlayerTurnIndex];
    if (currentTeam !== userSelectedColor) return;

    const keyMap = {
        '1': '[myPieceNum="1"]',
        '2': '[myPieceNum="2"]',
        '3': '[myPieceNum="3"]',
        '4': '[myPieceNum="4"]',
        ' ': `.team-roll-btn`
    };

    const selector = keyMap[e.key] || keyMap[e.code === 'Space' ? ' ' : ''];
    if (selector) document.querySelector(selector)?.click();
});
