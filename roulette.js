const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const elements = {
  balance: document.querySelector("#chip-balance"),
  zeroCount: document.querySelector("#zero-count"),
  activeBet: document.querySelector("#active-bet"),
  bet: document.querySelector("#bet-amount"),
  betError: document.querySelector("#bet-error"),
  allIn: document.querySelector("#all-in"),
  clearBets: document.querySelector("#clear-bets"),
  numberGrid: document.querySelector("#roulette-number-grid"),
  betSpots: document.querySelectorAll(".roulette-spot"),
  spin: document.querySelector("#spin-button"),
  wheel: document.querySelector("#roulette-wheel"),
  dial: document.querySelector("#roulette-dial"),
  result: document.querySelector("#wheel-result"),
  centerBrand: document.querySelector("#wheel-center-brand"),
  caption: document.querySelector("#wheel-caption"),
  message: document.querySelector("#roulette-message"),
  fullscreen: document.querySelector("#fullscreen-toggle"),
  table: document.querySelector(".extra-game-panel"),
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

const state = {
  balance: readParam("balance", 100, 0.01),
  bet: readParam("bet", 25, 0.01),
  zeroCount: Math.floor(readParam("zeros", 0)),
  spinning: false,
  timer: null,
  bets: new Map(),
};
if (state.bet > state.balance) state.bet = state.balance;

function getWagerTotal() {
  return [...state.bets.values()].reduce((total, amount) => total + amount, 0);
}

function wagerKey(type, value) {
  return `${type}:${value}`;
}

function addNumberSpots() {
  for (let column = 0; column < 12; column += 1) {
    for (let row = 1; row <= 3; row += 1) {
      const number = column * 3 + row;
      const button = document.createElement("button");
      const color = getColor(number);
      button.className = `roulette-spot number-spot number-${color}`;
      button.type = "button";
      button.dataset.betType = "number";
      button.dataset.betValue = String(number);
      button.setAttribute("aria-label", `Bet on ${number}, ${color}, pays 35 to 1`);
      const numberLabel = document.createElement("span");
      numberLabel.textContent = String(number);
      const chipLabel = document.createElement("span");
      chipLabel.className = "roulette-chip";
      chipLabel.hidden = true;
      button.append(numberLabel, chipLabel);
      elements.numberGrid.append(button);
      button.addEventListener("click", () => placeBet("number", String(number)));
    }
  }
}

function wheelPoint(radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: 200 + radius * Math.sin(radians),
    y: 200 - radius * Math.cos(radians),
  };
}

function renderWheel() {
  const sliceAngle = 360 / WHEEL_ORDER.length;
  for (const [index, number] of WHEEL_ORDER.entries()) {
    const centerAngle = index * sliceAngle;
    const startAngle = centerAngle - sliceAngle / 2;
    const endAngle = centerAngle + sliceAngle / 2;
    const outerStart = wheelPoint(188, startAngle);
    const outerEnd = wheelPoint(188, endAngle);
    const innerStart = wheelPoint(122, startAngle);
    const innerEnd = wheelPoint(122, endAngle);

    const pocket = document.createElementNS(SVG_NAMESPACE, "path");
    pocket.classList.add("roulette-wheel-pocket", `pocket-${getColor(number)}`);
    pocket.setAttribute(
      "d",
      `M ${outerStart.x} ${outerStart.y} A 188 188 0 0 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 122 122 0 0 0 ${innerStart.x} ${innerStart.y} Z`,
    );
    elements.dial.append(pocket);

    const label = document.createElementNS(SVG_NAMESPACE, "text");
    const labelPoint = wheelPoint(177, centerAngle);
    label.classList.add("roulette-wheel-number");
    label.dataset.wheelNumber = String(number);
    label.setAttribute("x", String(labelPoint.x));
    label.setAttribute("y", String(labelPoint.y));
    label.textContent = String(number);
    elements.dial.append(label);
  }

  const innerRing = document.createElementNS(SVG_NAMESPACE, "circle");
  innerRing.classList.add("roulette-wheel-ring");
  innerRing.setAttribute("cx", "200");
  innerRing.setAttribute("cy", "200");
  innerRing.setAttribute("r", "120");
  elements.dial.append(innerRing);
}

function updateBet() {
  const amount = Number(elements.bet.value);
  const valid = Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance;
  elements.betError.textContent = valid ? "" : `Enter 0.01–${formatChipDisplay(state.balance)} chips.`;
  if (valid) state.bet = amount;
  renderWallet();
}

function renderWallet() {
  elements.balance.textContent = formatChipDisplay(state.balance);
  elements.zeroCount.textContent = state.zeroCount;
  const wagerTotal = getWagerTotal();
  elements.activeBet.textContent = formatChipDisplay(wagerTotal);
  elements.bet.max = formatChips(state.balance);
  if (!state.spinning && document.activeElement !== elements.bet && Number(elements.bet.value) !== state.bet) {
    elements.bet.value = formatChips(state.bet);
  }
  elements.bet.disabled = state.spinning;
  elements.allIn.disabled = state.spinning || state.balance < 0.01;
  elements.clearBets.disabled = state.spinning || wagerTotal === 0;
  elements.spin.disabled = state.spinning || wagerTotal === 0;
  elements.betSpots.forEach((spot) => {
    const key = wagerKey(spot.dataset.betType, spot.dataset.betValue);
    const amount = state.bets.get(key) ?? 0;
    const chipLabel = spot.querySelector(".roulette-chip");
    chipLabel.textContent = amount > 0 ? formatChipDisplay(amount) : "";
    chipLabel.hidden = amount === 0;
    spot.setAttribute("aria-pressed", String(amount > 0));
    spot.disabled = state.spinning;
  });
  elements.numberGrid.querySelectorAll(".roulette-spot").forEach((spot) => {
    const key = wagerKey(spot.dataset.betType, spot.dataset.betValue);
    const amount = state.bets.get(key) ?? 0;
    const chipLabel = spot.querySelector(".roulette-chip");
    chipLabel.textContent = amount > 0 ? formatChipDisplay(amount) : "";
    chipLabel.hidden = amount === 0;
    spot.setAttribute("aria-pressed", String(amount > 0));
    spot.disabled = state.spinning;
  });
}

function getColor(number) {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}

function setMessage(message, resultClass = "") {
  elements.message.className = `round-message roulette-message ${resultClass}`;
  const icon = document.createElement("span");
  icon.className = "message-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "✦";
  const text = document.createElement("span");
  text.textContent = message;
  elements.message.replaceChildren(icon, text);
}

function updateFullscreenButton() {
  const active = document.fullscreenElement === elements.table;
  elements.fullscreen.textContent = active ? "Exit full screen" : "Full screen";
  elements.fullscreen.setAttribute("aria-pressed", String(active));
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (elements.table.requestFullscreen) {
      await elements.table.requestFullscreen();
    } else {
      setMessage("Full screen mode is not supported by this browser.");
      return;
    }
  } catch (error) {
    setMessage(`Could not change full screen mode: ${error.message}`);
  }
}

function placeBet(type, value) {
  if (state.spinning) return;
  const amount = Number(elements.bet.value);
  const valid = Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance;
  if (!valid) {
    elements.betError.textContent = `Enter 0.01–${formatChipDisplay(state.balance)} chips before choosing a spot.`;
    return;
  }
  const key = wagerKey(type, value);
  state.balance = Math.round((state.balance - amount) * 100) / 100;
  state.bet = amount;
  state.bets.set(key, Math.round(((state.bets.get(key) ?? 0) + amount) * 100) / 100);
  elements.betError.textContent = "";
  setMessage(`Placed ${formatChipDisplay(amount)} chips on ${value}.`);
  renderWallet();
}

function settle(returnedWinnings, message, resultClass) {
  state.balance = Math.round((state.balance + returnedWinnings) * 100) / 100;
  if (state.balance <= 0) {
    state.zeroCount += 1;
    state.balance = 25;
    state.bet = 25;
    message += " Balance reached zero; 25 chips added.";
  } else if (state.bet > state.balance) {
    state.bet = state.balance;
  }
  state.spinning = false;
  state.timer = null;
  state.bets.clear();
  renderWallet();
  setMessage(message, resultClass);
}

function spinWheel() {
  if (state.spinning || state.bets.size === 0) return;

  const number = Math.floor(Math.random() * 37);
  const color = getColor(number);
  const winningPocketIndex = WHEEL_ORDER.indexOf(number);
  const wagerTotal = getWagerTotal();
  let returnedWinnings = 0;
  let winningBets = 0;
  for (const [key, amount] of state.bets) {
    const [type, value] = key.split(":");
    const won = type === "number"
      ? number === Number(value)
      : getColor(number) === value;
    if (won) {
      returnedWinnings += amount * (type === "number" || value === "green" ? 36 : 2);
      winningBets += 1;
    }
  }
  returnedWinnings = Math.round(returnedWinnings * 100) / 100;
  const net = Math.round((returnedWinnings - wagerTotal) * 100) / 100;
  const message = winningBets
    ? `${number} ${color}. ${winningBets} bet${winningBets === 1 ? "" : "s"} won; ${formatChipDisplay(returnedWinnings)} chips returned (${net >= 0 ? "+" : ""}${formatChipDisplay(net)} net).`
    : `${number} ${color}. No bets won; you lost ${formatChipDisplay(wagerTotal)} chips.`;

  state.spinning = true;
  elements.result.textContent = "";
  elements.result.parentElement.className = "wheel-center";
  elements.centerBrand.hidden = false;
  const startAngle = Math.random() * 360;
  const fullTurns = 6 + Math.floor(Math.random() * 4);
  const ballTrack = document.querySelector("#roulette-ball-track");
  elements.wheel.classList.remove("has-result");
  ballTrack.style.setProperty("--ball-start-angle", `${startAngle}deg`);
  ballTrack.style.setProperty("--ball-end-angle", `${-fullTurns * 360}deg`);
  const wheelStartAngle = Math.random() * 360;
  const wheelEndAngle = fullTurns * 360 - winningPocketIndex * (360 / WHEEL_ORDER.length);
  elements.dial.style.setProperty("--wheel-start-angle", `${wheelStartAngle}deg`);
  elements.dial.style.setProperty("--wheel-end-angle", `${wheelEndAngle}deg`);
  elements.dial.style.transform = `rotate(${wheelStartAngle}deg)`;
  elements.caption.textContent = "The wheel is spinning…";
  elements.wheel.classList.remove("is-spinning");
  void elements.wheel.offsetWidth;
  elements.wheel.classList.add("is-spinning");
  setMessage("Good luck!");
  renderWallet();

  state.timer = window.setTimeout(() => {
    elements.wheel.classList.remove("is-spinning");
    elements.wheel.classList.add("has-result");
    elements.dial.style.transform = `rotate(${wheelEndAngle}deg)`;
    elements.result.textContent = String(number);
    elements.centerBrand.hidden = true;
    elements.result.parentElement.classList.add(`result-${color}`);
    elements.caption.textContent = `${number} · ${color.toUpperCase()}`;
    settle(returnedWinnings, message, net > 0 ? "result-win" : net < 0 ? "result-loss" : "");
  }, 5000);
}

function endGame() {
  if (state.timer !== null) {
    window.clearTimeout(state.timer);
    settle(0, "Spin ended early.", "result-loss");
  } else if (state.bets.size > 0) {
    state.balance = Math.round((state.balance + getWagerTotal()) * 100) / 100;
    state.bets.clear();
    renderWallet();
  }
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
  renderWallet();
});
elements.clearBets.addEventListener("click", () => {
  if (state.spinning) return;
  state.balance = Math.round((state.balance + getWagerTotal()) * 100) / 100;
  state.bets.clear();
  setMessage("Bets cleared and chips returned to your balance.");
  renderWallet();
});
elements.betSpots.forEach((spot) => {
  spot.addEventListener("click", () => placeBet(spot.dataset.betType, spot.dataset.betValue));
});
elements.spin.addEventListener("click", spinWheel);
elements.end.addEventListener("click", endGame);
elements.fullscreen.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
renderWheel();
addNumberSpots();
elements.bet.value = formatChips(state.bet);
renderWallet();
updateFullscreenButton();
