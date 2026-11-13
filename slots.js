const JACKPOT_STORAGE_KEY = "tablewise-slots-jackpot";
const STARTING_JACKPOT = 1000;
const JACKPOT_CONTRIBUTION = 0.05;
const BONUS_SPINS = 10;
const SYMBOLS = ["7", "BAR", "🍒", "🍋", "🔔", "💎", "×2", "×3", "×5"];
const MULTIPLIERS = new Map([["×2", 2], ["×3", 3], ["×5", 5]]);
const SYMBOL_POOL = SYMBOLS.flatMap((symbol) => MULTIPLIERS.has(symbol) ? [symbol] : Array(5).fill(symbol));
const TRIPLE_PAYOUTS = new Map([
  ["7", 20],
  ["BAR", 10],
  ["🔔", 6],
  ["🍒", 4],
  ["🍋", 3],
]);
const PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];
const LINE_LENGTH_MULTIPLIERS = new Map([[3, 1], [4, 2], [5, 4]]);
const elements = {
  balance: document.querySelector("#chip-balance"),
  zeroCount: document.querySelector("#zero-count"),
  bet: document.querySelector("#bet-amount"),
  betError: document.querySelector("#bet-error"),
  allIn: document.querySelector("#all-in"),
  spin: document.querySelector("#spin-button"),
  jackpot: document.querySelector("#jackpot-amount"),
  grid: document.querySelector("#slots-grid"),
  cells: [],
  paylinePaths: [...document.querySelectorAll(".slots-payline")],
  wins: document.querySelector("#slots-wins"),
  bonusInfo: document.querySelector("#bonus-info"),
  message: document.querySelector("#slots-message"),
  end: document.querySelector("#end-game"),
};
const params = new URLSearchParams(window.location.search);

function readParam(name, fallback, min = 0) {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function formatChips(value) {
  return Number(value.toFixed(2)).toString();
}

function formatChipDisplay(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function readJackpot() {
  const saved = localStorage.getItem(JACKPOT_STORAGE_KEY);
  if (saved === null) {
    localStorage.setItem(JACKPOT_STORAGE_KEY, String(STARTING_JACKPOT));
    return STARTING_JACKPOT;
  }
  const jackpot = Number(saved);
  if (!Number.isFinite(jackpot) || jackpot < STARTING_JACKPOT) {
    throw new Error("The saved slots jackpot is invalid. Clear this site's saved data to reset it.");
  }
  return jackpot;
}

let jackpot = STARTING_JACKPOT;
let storageError = "";
try {
  jackpot = readJackpot();
} catch (error) {
  storageError = error.message;
}

const state = {
  balance: readParam("balance", 100, 0.01),
  bet: readParam("bet", 25, 0.01),
  zeroCount: Math.floor(readParam("zeros", 0)),
  jackpot,
  storageError,
  spinning: false,
  freeSpinsRemaining: 0,
  bonusMultiplier: 1,
  bonusBet: 0,
};
state.bet = Math.min(state.bet, state.balance);

function setMessage(message, type = "") {
  const icon = document.createElement("span");
  icon.className = "message-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = type === "result-win" ? "✦" : "♣";
  const text = document.createElement("span");
  text.textContent = message;
  elements.message.className = `round-message slots-message${type ? ` ${type}` : ""}`;
  elements.message.replaceChildren(icon, text);
}

function roundChips(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function render() {
  elements.balance.textContent = formatChipDisplay(state.balance);
  elements.zeroCount.textContent = state.zeroCount;
  elements.jackpot.textContent = formatChipDisplay(state.jackpot);
  elements.bet.max = formatChips(state.balance);
  elements.bet.disabled = state.spinning;
  elements.allIn.disabled = state.spinning || state.balance < 0.01;
  elements.spin.disabled = state.spinning || Boolean(state.storageError) || !isValidBet();
  elements.spin.textContent = state.spinning
    ? state.freeSpinsRemaining ? "Free spins…" : "Spinning…"
    : "Spin →";
  elements.end.disabled = state.spinning;
  elements.bonusInfo.textContent = state.freeSpinsRemaining
    ? `${state.freeSpinsRemaining} FREE SPINS · ×${formatMultiplier(state.bonusMultiplier)} BONUS`
    : "3 multiplier tokens trigger 10 free autoplay spins";
  elements.grid.setAttribute("aria-label", `Slot result grid, 3 rows by 5 reels. ${elements.cells.map((cell) => cell.querySelector("span").textContent).join(", ")}`);
}

function formatMultiplier(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function isValidBet() {
  const amount = Number(elements.bet.value);
  return Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance;
}

function updateBet() {
  const amount = Number(elements.bet.value);
  const valid = Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance;
  elements.betError.textContent = valid
    ? ""
    : `Enter a total bet from 0.01 to ${formatChipDisplay(state.balance)} chips in 0.01 steps.`;
  if (valid) state.bet = amount;
  render();
}

function drawGrid() {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)]),
  );
}

function tokenMultiplier(grid) {
  return grid.flat().reduce((product, symbol) => product * (MULTIPLIERS.get(symbol) ?? 1), 1);
}

function multiplierTokenCount(grid) {
  return grid.flat().filter((symbol) => MULTIPLIERS.has(symbol)).length;
}

function getWinningLines(grid, totalBet, jackpotAmount, winMultiplier) {
  const lineBet = totalBet / PAYLINES.length;
  const wins = [];

  PAYLINES.forEach((rows, lineIndex) => {
    const symbol = grid[rows[0]][0];
    if (MULTIPLIERS.has(symbol)) return;

    let matchCount = 1;
    for (let column = 1; column < rows.length; column += 1) {
      if (grid[rows[column]][column] !== symbol) break;
      matchCount += 1;
    }
    if (matchCount < 3) return;

    const positions = rows.slice(0, matchCount).map((row, column) => ({ row, column }));
    if (symbol === "💎") {
      wins.push({
        lineIndex,
        positions,
        symbol,
        matchCount,
        jackpot: true,
        lengthMultiplier: LINE_LENGTH_MULTIPLIERS.get(matchCount),
        amount: 0,
      });
      return;
    }

    const payout = TRIPLE_PAYOUTS.get(symbol);
    if (!payout) return;
    const lineAmount = roundChips(
      lineBet * payout * LINE_LENGTH_MULTIPLIERS.get(matchCount) * winMultiplier,
    );
    wins.push({
      lineIndex,
      positions,
      symbol,
      matchCount,
      jackpot: false,
      amount: lineAmount,
    });
  });

  const jackpotLines = wins.filter((win) => win.jackpot);
  const jackpotLine = jackpotLines.reduce(
    (best, win) => win.lengthMultiplier > (best?.lengthMultiplier ?? 0) ? win : best,
    null,
  );
  if (jackpotLine) {
    jackpotLine.amount = roundChips(
      jackpotAmount * winMultiplier * jackpotLine.lengthMultiplier,
    );
    jackpotLine.paysJackpot = true;
  }

  const amount = wins.reduce((total, win) => total + win.amount, 0);
  return { amount: roundChips(amount), wins, jackpotWon: Boolean(jackpotLine) };
}

function renderGrid(grid, winningLines = [], spinning = false) {
  elements.cells.forEach((cell, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    cell.querySelector("span").textContent = grid[row][column];
    cell.classList.toggle("is-spinning", spinning);
    cell.classList.toggle("is-multiplier", MULTIPLIERS.has(grid[row][column]));
    cell.classList.remove("is-winning");
  });
  elements.paylinePaths.forEach((path, index) => {
    path.classList.toggle("is-winning", winningLines.some((win) => win.lineIndex === index));
  });
  winningLines.forEach((win) => {
    win.positions.forEach(({ row, column }) => {
      elements.cells[row * 5 + column].classList.add("is-winning");
    });
  });
  elements.wins.replaceChildren();
  winningLines.forEach((win) => {
    const item = document.createElement("span");
    const paylineName = ["Top", "Middle", "Bottom", "Zigzag 1", "Zigzag 2"][win.lineIndex];
    const matchDescription = `${win.matchCount} ${win.symbol} symbols`;
    item.className = "slots-win-item";
    item.textContent = win.jackpot
      ? `${paylineName}: ${matchDescription} — ${win.paysJackpot ? `${formatChipDisplay(win.amount)} jackpot` : "included in jackpot award"}`
      : `${paylineName}: ${matchDescription} — ${formatChipDisplay(win.amount)} chips`;
    elements.wins.append(item);
  });
}

function buildGrid() {
  elements.cells = Array.from({ length: 15 }, (_, index) => {
    const cell = document.createElement("div");
    cell.className = "slot-cell";
    cell.setAttribute("aria-hidden", "true");
    const symbol = document.createElement("span");
    symbol.textContent = ["7", "🍒", "BAR", "🔔", "🍋"][index % 5];
    cell.append(symbol);
    return cell;
  });
  elements.grid.prepend(...elements.cells);
}

function startPaidSpin() {
  if (state.spinning) return;
  if (state.storageError) {
    setMessage(`The progressive jackpot cannot be used: ${state.storageError}`, "result-loss");
    return;
  }
  if (!isValidBet()) {
    updateBet();
    return;
  }
  state.bet = Number(elements.bet.value);
  runSpin(false);
}

function runSpin(isFreeSpin) {
  const wager = isFreeSpin ? state.bonusBet : state.bet;

  if (!isFreeSpin) {
    const nextJackpot = roundChips(state.jackpot + wager * JACKPOT_CONTRIBUTION);
    try {
      localStorage.setItem(JACKPOT_STORAGE_KEY, String(nextJackpot));
    } catch (error) {
      state.storageError = error.message;
      render();
      setMessage(`Could not save the progressive jackpot: ${error.message}`, "result-loss");
      return;
    }
    state.balance = roundChips(state.balance - wager);
    state.jackpot = nextJackpot;
  } else {
    state.freeSpinsRemaining -= 1;
  }

  state.spinning = true;
  const grid = drawGrid();
  renderGrid(grid, [], true);
  setMessage(isFreeSpin
    ? `Free autoplay spin in progress… ${state.freeSpinsRemaining} remaining after this spin.`
    : "The reels are spinning...");
  render();

  window.setTimeout(() => {
    const tokens = multiplierTokenCount(grid);
    const tokenBoost = tokenMultiplier(grid);
    const winMultiplier = (isFreeSpin ? state.bonusMultiplier : 1) * tokenBoost;
    const outcome = getWinningLines(grid, wager, state.jackpot, winMultiplier);
    const triggersBonus = tokens >= 3;

    if (outcome.jackpotWon) {
      try {
        localStorage.setItem(JACKPOT_STORAGE_KEY, String(STARTING_JACKPOT));
      } catch (error) {
        state.storageError = error.message;
        state.freeSpinsRemaining = 0;
        state.bonusMultiplier = 1;
        state.bonusBet = 0;
        if (!isFreeSpin) state.balance = roundChips(state.balance + wager);
        state.spinning = false;
        renderGrid(grid);
        render();
        setMessage(`Jackpot hit, but could not save the reset: ${error.message}. ${isFreeSpin ? "The bonus ended." : "Your bet was returned."}`, "result-loss");
        return;
      }
      state.jackpot = STARTING_JACKPOT;
    }

    state.balance = roundChips(state.balance + outcome.amount);
    if (triggersBonus) {
      if (isFreeSpin) {
        state.freeSpinsRemaining += BONUS_SPINS;
        state.bonusMultiplier *= tokenBoost;
      } else {
        state.freeSpinsRemaining = BONUS_SPINS;
        state.bonusMultiplier = tokenBoost;
        state.bonusBet = wager;
      }
    }

    if (!isFreeSpin && state.balance <= 0) {
      state.zeroCount += 1;
      state.balance = 25;
      state.bet = 25;
      elements.bet.value = formatChips(state.bet);
    } else if (!state.freeSpinsRemaining) {
      state.bet = Math.min(state.bet, state.balance);
    }

    const resultParts = [];
    if (outcome.jackpotWon) resultParts.push(`JACKPOT!`);
    if (outcome.amount > 0) {
      resultParts.push(`Won ${formatChipDisplay(outcome.amount)} chips on ${outcome.wins.length} payline${outcome.wins.length === 1 ? "" : "s"} at ×${formatMultiplier(winMultiplier)}.`);
    } else if (!triggersBonus) {
      resultParts.push("No paylines hit.");
    }
    if (triggersBonus) {
      resultParts.push(isFreeSpin
        ? `Multiplier tokens retriggered the bonus: 10 more free spins at ×${formatMultiplier(state.bonusMultiplier)}.`
        : `3+ multiplier tokens! 10 free spins at ×${formatMultiplier(state.bonusMultiplier)}.`);
    }

    renderGrid(grid, outcome.wins);
    if (state.freeSpinsRemaining > 0) {
      state.spinning = true;
      render();
      setMessage(resultParts.join(" "), outcome.amount > 0 || triggersBonus ? "result-win" : "result-loss");
      window.setTimeout(() => runSpin(true), 500);
      return;
    }

    state.spinning = false;
    state.bonusMultiplier = 1;
    state.bonusBet = 0;
    render();
    setMessage(resultParts.join(" ") || "Spin complete.", outcome.amount > 0 || triggersBonus ? "result-win" : "result-loss");
  }, 850);
}

function endGame() {
  if (state.spinning) return;
  const query = new URLSearchParams({
    balance: formatChips(state.balance),
    zeros: String(state.zeroCount),
    bet: formatChips(state.bet),
  });
  window.location.href = `mainpage.html?${query}`;
}

elements.bet.addEventListener("input", updateBet);
elements.allIn.addEventListener("click", () => {
  if (state.spinning || state.balance < 0.01) return;
  state.bet = state.balance;
  elements.bet.value = formatChips(state.bet);
  elements.betError.textContent = "";
  render();
});
elements.spin.addEventListener("click", startPaidSpin);
elements.end.addEventListener("click", endGame);
buildGrid();
elements.bet.value = formatChips(state.bet);
render();
if (state.storageError) {
  setMessage(`The progressive jackpot cannot be used: ${state.storageError}`, "result-loss");
}
