// Pusher
const pusher = new Pusher("4f7a40b6031d990f0233", { cluster: "ap4" });
const channel = pusher.subscribe("game-channel");

// DOM
const rollDiceButton = document.getElementById("rollDiceButton");
const rollDice = document.getElementById("rollDice");

const blueBoard = document.getElementById("blue-Board");
const redBoard = document.getElementById("red-Board");
const greenBoard = document.getElementById("green-Board");
const yellowBoard = document.getElementById("yellow-Board");

// path
const pathArray = [
  "r1","r2","r3","r4","r5","r6","r7","r8","r9","r10","r11","r12","r13",
  "g1","g2","g3","g4","g5","g6","g7","g8","g9","g10","g11","g12","g13",
  "y1","y2","y3","y4","y5","y6","y7","y8","y9","y10","y11","y12","y13",
  "b1","b2","b3","b4","b5","b6","b7","b8","b9","b10","b11","b12","b13"
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let numPlayers = 4;
let playerOrder = ["blue","red","green","yellow"].slice(0,numPlayers);
let currentPlayerTurnIndex = 0;
let currentPlayerTurnStatus = false;
let diceResult;

let gameCode = window.gameCode || "ABC123";
let yourColor = window.yourColor || "blue";

// Piece class
class PlayerPiece {
  constructor(team, id, homeEntry, gameEntry) {
    this.team = team;
    this.id = id;
    this.homeEntry = homeEntry;
    this.gameEntry = gameEntry;
    this.position = id + "_home";
    this.status = 0;
  }

  unlock() {
    this.status = 1;
    this.position = this.gameEntry;
    const el = document.querySelector(`[piece_id="${this.id}"]`);
    document.getElementById(this.gameEntry).appendChild(el);
  }

  update(pos) {
    this.position = pos;
  }
}

let playerPieces = [];

const boards = [
  { team:"blue", board:blueBoard, homeEntry:"y13", gameEntry:"b1" },
  { team:"red", board:redBoard, homeEntry:"b13", gameEntry:"r1" },
  { team:"green", board:greenBoard, homeEntry:"r13", gameEntry:"g1" },
  { team:"yellow", board:yellowBoard, homeEntry:"g13", gameEntry:"y1" }
];

boards.forEach(({team, board, homeEntry, gameEntry})=>{
  if (!playerOrder.includes(team)) return;
  const container = document.createElement("div");
  for(let i=0; i<4; i++){
    const span = document.createElement("span");
    const icon = document.createElement("i");
    icon.classList.add("fa-solid","fa-location-pin","piece",`${team}-piece`);
    icon.setAttribute("piece_id", `${team}${i}`);
    span.appendChild(icon);
    span.id = `${team}${i}_home`;
    container.appendChild(span);
    playerPieces.push(new PlayerPiece(team, `${team}${i}`, homeEntry, gameEntry));
  }
  board.appendChild(container);
});

// highlight
function updateHighlight(){
  playerOrder.forEach(color=>{
    document.getElementById(`${color}-Board`).style.border = "2px solid transparent";
  });
  document.getElementById(`${playerOrder[currentPlayerTurnIndex]}-Board`).style.border = "4px solid gold";
}

// next turn
function nextTurn(){
  currentPlayerTurnIndex = (currentPlayerTurnIndex + 1) % playerOrder.length;
  currentPlayerTurnStatus = playerOrder[currentPlayerTurnIndex] === yourColor;
  updateHighlight();
}

// APIs
async function movePieceAPI(pieceId, pos) {
  await fetch(`https://ludo21.pythonanywhere.com/api/move-piece/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      piece_id: pieceId,
      position: pos,
      game_code: gameCode
    }),
  });
}

// move
async function movePiece(piece, arr){
  arr.forEach((pos,i)=>{
    setTimeout(()=>{
      piece.update(pos);
      document.getElementById(pos).appendChild(
        document.querySelector(`[piece_id="${piece.id}"]`)
      );
    }, i*300);
  });
  await delay(arr.length*300);
}

// turn
async function turnForUser(e){
  if (!currentPlayerTurnStatus) return;

  const currentTeam = playerOrder[currentPlayerTurnIndex];
  const id = e.target.getAttribute("piece_id");
  const piece = playerPieces.find(p => p.id === id);

  if (!piece || piece.team !== currentTeam) return;

  // agar piece band hai
  if (piece.status === 0) {
    if (diceResult === 6) {
      piece.unlock();
      await movePieceAPI(piece.id, piece.gameEntry);

      // allow same player to roll again
      currentPlayerTurnStatus = true;
      return;
    } else {
      alert("Need 6 to unlock!");
      const next = playerOrder[(currentPlayerTurnIndex + 1) % playerOrder.length];
      channel.trigger("client-turn-changed", {
        currentPlayer: next,
      });
      nextTurn();
      return;
    }
  }

  // agar piece already open hai
  let idx = pathArray.indexOf(piece.position);
  if (idx === -1) return;

  let path = [];
  for (let i = 1; i <= diceResult; i++) {
    path.push(pathArray[(idx + i) % pathArray.length]);
  }

  await movePiece(piece, path);
  await movePieceAPI(piece.id, path[path.length - 1]);

  if (diceResult === 6) {
    // 6 ke baad chance again
    currentPlayerTurnStatus = true;
  } else {
    // ab turn doosre ko do
    const next = playerOrder[(currentPlayerTurnIndex + 1) % playerOrder.length];
    channel.trigger("client-turn-changed", {
      currentPlayer: next,
    });
    nextTurn();
  }
}


// dice button
rollDiceButton.addEventListener("click", async () => {
  if (!currentPlayerTurnStatus) {
    console.log("Not your turn!");
    return;
  }

  rollDice.src = "./Assets/rollDice.gif";
  await delay(600);
  diceResult = Math.floor(Math.random() * 6) + 1;
  console.log("Dice result (frontend):", diceResult);
  rollDice.src = `./Assets/Dice_${diceResult}.png`;

  // broadcast
  channel.trigger("client-dice-rolled", {
    dice: diceResult,
    player: yourColor
  });

  // no turn change here
});
 // <-- ye closing bracket zaroori thi


// piece clicks
document.addEventListener("click", e=>{
  if (e.target.classList.contains("piece")){
    turnForUser(e);
  }
});

// pusher events
channel.bind("client-dice-rolled", data=>{
  console.log("dice rolled received", data);
  diceResult = data.dice;
  rollDice.src = `./Assets/Dice_${diceResult}.png`;
  currentPlayerTurnStatus = (data.player === yourColor);
});

channel.bind("client-turn-changed", data=>{
  console.log("turn changed received", data);
  currentPlayerTurnIndex = playerOrder.indexOf(data.currentPlayer);
  currentPlayerTurnStatus = (data.currentPlayer === yourColor);
  updateHighlight();
  // currentPlayerTurnStatus = true; 
  
});

channel.bind("piece-moved", data=>{
  const pieceId = data.payload.pieceId;
  const pos = data.payload.position;
  const piece = playerPieces.find(p => p.id === pieceId);
  if (piece) {
    piece.update(pos);
    document.getElementById(pos).appendChild(
      document.querySelector(`[piece_id="${piece.id}"]`)
    );
  }
});

// highlight start
updateHighlight();
currentPlayerTurnStatus = playerOrder[currentPlayerTurnIndex] === yourColor;
currentPlayerTurnStatus = true; 
