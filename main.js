// =========================================================
// decay othello main.js（全文・安定版 + パス処理 + ゲーム終了）
// =========================================================
//
// 親   : accent !== null → 壊変する可能性あり
// 娘   : accent === null → 壊変しない
//
// ルール
// ① 親のみ確率で壊変
// ② 親が壊変 or 挟まれて反転すると娘になる
// ③ 娘が挟まれて反転すると親になる
//
// ＝ 反転が起きたら 親⇄娘 を必ず切り替える
//
// ＋ 壊変前点滅演出
// ＋ タイトル「o」周期色変化
// ＋ 置けるマスのヒント表示
// ＋ 盤外アクセス防止
// ＋ パス処理（操作不能バグ修正）
// ＋ ゲーム開始前：初期4石クリックでアクセント循環（★変更）
// =========================================================


// =====================
// Canvas / 定数
// =====================
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const SIZE = 8;
const CELL = 60;


// =====================
// アクセント・初期配置
// =====================
const ACCENTS = ["red", "yellow", "green", "blue"];
const INITIAL_STONES = [
  { x: 3, y: 3, base: -1 },
  { x: 4, y: 4, base: -1 },
  { x: 3, y: 4, base: 1 },
  { x: 4, y: 3, base: 1 },
];


// =====================
// 盤面
// =====================
// stone = {
//   base: 1|-1,
//   accent: string|null,     // 親なら色、娘なら null
//   parentAccent: string,    // 親だったときの記憶
//   _accentVisible?: boolean // 点滅用
// }
let board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));


// =====================
// 状態
// =====================
let turn = 1;
let selectedAccent = "red";
let started = false;
let isProcessing = false;
let isDecayPhase = false;


// =====================
// DOM
// =====================
const accentButtons = document.querySelectorAll(".accent-btn");
const turnText = document.getElementById("turnText");
const phaseText = document.getElementById("phaseText");
const countsBlack = document.getElementById("countsBlack");
const countsWhite = document.getElementById("countsWhite");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");


// =====================
// 在庫
// =====================
const INITIAL_COUNTS = { red: 12, yellow: 8, green: 8, blue: 4 };
let inventory = {
  1: { ...INITIAL_COUNTS },
  "-1": { ...INITIAL_COUNTS },
};

function resetInventory() {
  inventory[1] = { ...INITIAL_COUNTS };
  inventory["-1"] = { ...INITIAL_COUNTS };
  updateInventoryUI();
}

function updateInventoryUI() {
  const make = (p) =>
    ACCENTS.map(
      (a) => `
      <div class="count-row">
        <span class="badge">
          <span class="dot" style="background:${accentToCode(a)}"></span>
          ${a}
        </span>
        <span>${inventory[p][a]} 個</span>
      </div>`
    ).join("");
  countsBlack.innerHTML = make(1);
  countsWhite.innerHTML = make("-1");
}

function canUseAccent(p, a) {
  return inventory[p][a] > 0;
}

function consumeAccent(p, a, d) {
  inventory[p][a] += d;
  if (inventory[p][a] < 0) inventory[p][a] = 0;
  updateInventoryUI();
}

function accentToProbability(a) {
  return a === "red"
    ? 1 / 12
    : a === "yellow"
    ? 1 / 20
    : a === "green"
    ? 1 / 30
    : a === "blue"
    ? 1 / 100
    : 0;
}

function accentToCode(a) {
  return a === "red"
    ? "#e53935"
    : a === "yellow"
    ? "#fdd835"
    : a === "green"
    ? "#43a047"
    : "#1e88e5";
}


// =====================
// 安全ユーティリティ
// =====================
function inBounds(x, y) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

function getBase(x, y) {
  if (!inBounds(x, y)) return 0;
  return board[y][x] ? board[y][x].base : 0;
}


// =====================
// ★ Setup専用：初期4石クリックでアクセント循環（追加）
// =====================

// 初期4石かどうか
function isInitialPos(x, y) {
  return INITIAL_STONES.some((s) => s.x === x && s.y === y);
}

// 次に使えるアクセント色（在庫0はスキップ）
function nextAccent(current, owner) {
  const idx = ACCENTS.indexOf(current);
  for (let i = 1; i <= ACCENTS.length; i++) {
    const a = ACCENTS[(idx + i) % ACCENTS.length];
    if (inventory[owner][a] > 0) return a;
  }
  return current;
}

// Setup中：初期4石をクリックするたびに色が循環
function changeInitialStoneAccent(x, y) {
  const s = board[y][x];
  if (!s) return;
  if (!isInitialPos(x, y)) return;

  const owner = s.base;
  const oldAccent = s.accent;
  const next = nextAccent(oldAccent, owner);

  if (next === oldAccent) return;

  // 在庫調整
  consumeAccent(owner, oldAccent, +1);
  consumeAccent(owner, next, -1);

  // 親のまま色だけ変更
  s.accent = next;
  s.parentAccent = next;
}


// =====================
// 初期化
// =====================
function resetBoard() {
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (const s of INITIAL_STONES) {
    board[s.y][s.x] = {
      base: s.base,
      accent: "red",
      parentAccent: "red",
    };
  }
}


// =====================
// 表示更新
// =====================
function updateTurnText() {
  turnText.textContent = "Turn: " + (turn === 1 ? "Black" : "White");
}

function updatePhaseText() {
  phaseText.textContent = started
    ? "Playing"
    : "Setup: 初期4石をクリックして色を決めてください → Start";
}


// =====================
// スコア
// =====================
function countScore() {
  let black = 0, white = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const s = board[y][x];
    if (!s) continue;
    if (s.base === 1) black++;
    else white++;
  }
  return { black, white };
}


// =====================
// 描画
// =====================
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#800000";
  ctx.fillRect(0, 0, SIZE * CELL, SIZE * CELL);

  ctx.strokeStyle = "#000";
  for (let i = 0; i <= SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, SIZE * CELL);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL);
    ctx.lineTo(SIZE * CELL, i * CELL);
    ctx.stroke();
  }

  // ヒント（置けるマス）
  // Setup中は started=false なので表示されない
  if (started && !isProcessing && !isDecayPhase) {
    for (const [x, y] of getValidMoves(turn)) {
      const s = CELL * 0.18;
      ctx.fillStyle = "#c45a5a";
      ctx.fillRect(
        x * CELL + CELL / 2 - s / 2,
        y * CELL + CELL / 2 - s / 2,
        s,
        s
      );
    }
  }

  // 石
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const s = board[y][x];
      if (!s) continue;

      ctx.beginPath();
      ctx.arc(
        x * CELL + CELL / 2,
        y * CELL + CELL / 2,
        CELL * 0.4,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = s.base === 1 ? "#000" : "#fff";
      ctx.fill();

      if (s.base === -1) {
        ctx.strokeStyle = "#999";
        ctx.stroke();
      }

      // 親のみアクセント表示（点滅対応）
      if (s.accent && s._accentVisible !== false) {
        ctx.beginPath();
        ctx.arc(
          x * CELL + CELL / 2,
          y * CELL + CELL / 2,
          CELL * 0.18,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = accentToCode(s.accent);
        ctx.fill();
        ctx.strokeStyle = "#333";
        ctx.stroke();
      }
    }
}


// =====================
// オセロ基本
// =====================
function getFlips(x, y, color) {
  if (board[y][x]) return [];

  const d = [
    [1,0],[-1,0],[0,1],[0,-1],
    [1,1],[-1,-1],[1,-1],[-1,1],
  ];

  let f = [];
  for (const [dx, dy] of d) {
    let nx = x + dx, ny = y + dy, t = [];

    while (inBounds(nx, ny) && getBase(nx, ny) === -color) {
      t.push([nx, ny]);
      nx += dx; ny += dy;
    }

    if (t.length && inBounds(nx, ny) && getBase(nx, ny) === color) {
      f = f.concat(t);
    }
  }
  return f;
}

function getValidMoves(c) {
  const m = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (getFlips(x, y, c).length) m.push([x, y]);
  return m;
}

function hasMove(color) {
  return getValidMoves(color).length > 0;
}


// =====================
// 石を置く（親⇄娘トグル）
// =====================
function placeStoneImmediate(x, y) {
  if (!canUseAccent(turn, selectedAccent)) {
    alert("その色はもうないです");
    return false;
  }

  const flips = getFlips(x, y, turn);
  if (!flips.length) return false;

  // 新しく置く石は必ず「親」
  consumeAccent(turn, selectedAccent, -1);
  board[y][x] = {
    base: turn,
    accent: selectedAccent,
    parentAccent: selectedAccent,
  };

  // 挟まれて反転する石は「親⇄娘」を必ず切り替える
  for (const [fx, fy] of flips) {
    const old = board[fy][fx];
    const wasParent = old.accent !== null;

    board[fy][fx] = {
      base: turn,
      accent: wasParent ? null : old.parentAccent,
      parentAccent: old.parentAccent,
    };
  }

  return true;
}


// =====================
// 壊変（点滅 → 反転）
// =====================
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function blinkAccent(x, y, flashes = 3, interval = 200) {
  const s = board[y][x];
  if (!s || !s.accent) return; // 娘は点滅しない

  for (let i = 0; i < flashes; i++) {
    s._accentVisible = true;
    draw();
    await sleep(interval);

    s._accentVisible = false;
    draw();
    await sleep(interval);
  }
  s._accentVisible = undefined;
}

async function autoFlipAllStones() {
  isDecayPhase = true;
  draw();

  // 壊変対象は「親」だけ
  const targets = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const s = board[y][x];
      if (s && s.accent && Math.random() < accentToProbability(s.accent)) {
        targets.push([x, y]);
      }
    }

  for (const [x, y] of targets) {
    await blinkAccent(x, y, 3, 200);

    const s = board[y][x];
    if (!s) continue;

    // 親が壊変したら反転して娘になる
    s.base *= -1;
    s.accent = null;
    draw();
    await sleep(120);
  }

  isDecayPhase = false;
  draw();
}


// =====================
// パス処理（手番を進める）
// =====================
function resolvePassAndGameOver(showAlert = true) {
  // 現在手番が置けないならパス
  if (!hasMove(turn)) {
    turn *= -1;
    updateTurnText();
    draw();

    // 相手も置けないならゲーム終了
    if (!hasMove(turn)) {
      const sc = countScore();
      if (showAlert) {
        alert(`Game Over\nBlack: ${sc.black}\nWhite: ${sc.white}`);
      }
      return { gameOver: true, passed: true };
    }

    if (showAlert) alert("パスします");
    return { gameOver: false, passed: true };
  }
  return { gameOver: false, passed: false };
}


// =====================
// UI
// =====================

// ★ Setup中はアクセントボタンを「選ぶ」だけにしてもよいが、
// 今回の仕様では Setup中は初期石クリックで色が循環するため、
// Setup中のボタン操作は混乱を避けるため無効にする（★変更）
accentButtons.forEach((b) =>
  b.addEventListener("click", () => {
    if (isProcessing) return;
    if (!started) return; // ★ Setup中は無効

    if (!canUseAccent(turn, b.dataset.accent)) {
      alert("その色はもうないです");
      return;
    }

    accentButtons.forEach((x) => x.classList.remove("selected"));
    b.classList.add("selected");
    selectedAccent = b.dataset.accent;
  })
);
accentButtons[0].classList.add("selected");

startBtn.onclick = () => {
  started = true;
  updateTurnText();
  updatePhaseText();
  draw();

  // 開始直後に置けないならパス/終了判定（普通は起きないが保険）
  resolvePassAndGameOver(false);
};

resetBtn.onclick = () => {
  started = false;
  isProcessing = false;
  isDecayPhase = false;

  resetInventory();
  resetBoard();

  // 初期石 red を各プレイヤー2個分消費
  consumeAccent(1, "red", -2);
  consumeAccent("-1", "red", -2);

  turn = 1;
  selectedAccent = "red";
  accentButtons.forEach((x) => x.classList.remove("selected"));
  accentButtons[0].classList.add("selected");

  updateTurnText();
  updatePhaseText();
  draw();
};


// =====================
// クリック
// =====================
canvas.addEventListener("click", async (e) => {
  if (isProcessing) return;

  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / CELL);
  const y = Math.floor((e.clientY - r.top) / CELL);
  if (!inBounds(x, y)) return;

  // ★ Setupフェーズ：初期4石クリックで色循環
  if (!started) {
    changeInitialStoneAccent(x, y);
    draw();
    return;
  }

  // ★クリックのたびに「今の手番が置けるか」チェック
  // 置けないなら自動パス/ゲーム終了
  const pre = resolvePassAndGameOver(true);
  if (pre.gameOver) return;
  if (pre.passed) return;

  isProcessing = true;

  // 置く
  if (!placeStoneImmediate(x, y)) {
    // 置けないマスを押しただけ
    isProcessing = false;
    draw();
    return;
  }

  draw();

  // 壊変フェーズ
  await sleep(1000);
  await autoFlipAllStones();

  // 手番交代
  turn *= -1;
  updateTurnText();

  isProcessing = false;

  // ★交代後もパス/終了判定（壊変で盤面が変わるため）
  resolvePassAndGameOver(true);

  draw();
});


// =====================
// init
// =====================
(function init() {
  resetInventory();
  resetBoard();

  // 初期石 red を各プレイヤー2個分消費
  consumeAccent(1, "red", -2);
  consumeAccent("-1", "red", -2);

  turn = 1;
  started = false;

  updateTurnText();
  updatePhaseText();
  draw();
})();


// =========================================================
// タイトル「o」の壊変風アニメーション
// =========================================================
const blinkO = document.getElementById("blinkO");

function setOColor(hex) {
  if (!blinkO) return;
  blinkO.style.color = hex;
  blinkO.style.textShadow =
    hex.toLowerCase() === "#ffffff" ? "0 0 1px #000" : "none";
}

async function morphWithGray(from, to) {
  const gray = "#9e9e9e";
  const step = Math.round(1500 / 6);
  setOColor(from); await sleep(step);
  setOColor(gray); await sleep(step);
  setOColor(from); await sleep(step);
  setOColor(gray); await sleep(step);
  setOColor(from); await sleep(step);
  setOColor(gray); await sleep(step);
  setOColor(to);
}

async function runOTitleLoop() {
  if (!blinkO) return;
  while (true) {
    await morphWithGray("#000000", "#ffffff");
    await sleep(5000);
    await morphWithGray("#ffffff", "#000000");
    await sleep(5000);
  }
}

//if (blinkO) setOColor("#000000");
//runOTitleLoop();

// --- 初期状態：黒で固定 ---
if (blinkO) setOColor("#000000");

// --- ★ 15秒後に点滅開始 ---
setTimeout(() => {
  runOTitleLoop();
}, 15000);
