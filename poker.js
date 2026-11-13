const SUITS = [
  { symbol: "♠", color: "black", name: "spades" },
  { symbol: "♥", color: "red", name: "hearts" },
  { symbol: "♦", color: "red", name: "diamonds" },
  { symbol: "♣", color: "black", name: "clubs" },
];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES = Object.fromEntries(RANKS.map((rank, index) => [rank, index + 2]));
const HAND_NAMES = [
  "High card", "One pair", "Two pair", "Three of a kind", "Straight",
  "Flush", "Full house", "Four of a kind", "Straight flush", "Royal flush",
];
const elements = {
  houseCards: document.querySelector("#house-cards"),
  communityCards: document.querySelector("#community-cards"),
  playerCards: document.querySelector("#player-cards"),
  houseRank: document.querySelector("#house-rank"),
  playerRank: document.querySelector("#player-rank"),
  street: document.querySelector("#street-label"),
  pot: document.querySelector("#pot-value"),
  message: document.querySelector("#poker-message"),
  balance: document.querySelector("#chip-balance"),
  zeroCount: document.querySelector("#zero-count"),
  activeBet: document.querySelector("#active-bet"),
  bet: document.querySelector("#bet-amount"),
  betError: document.querySelector("#bet-error"),
  allIn: document.querySelector("#all-in"),
  deal: document.querySelector("#deal-hand"),
  check: document.querySelector("#check-action"),
  raise: document.querySelector("#raise-action"),
  fold: document.querySelector("#fold-action"),
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
  roundActive: false,
  shoe: [],
  timer: null,
  streetIndex: -1,
  board: [],
  playerCards: [],
  houseCards: [],
  playerContribution: 0,
  awaitingHouseCall: false,
};
if (state.bet > state.balance) state.bet = state.balance;

function createDeck() {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function renderCard(card, index, hidden = false) {
  const node = document.createElement("div");
  node.className = `playing-card is-dealing${hidden ? " is-hidden" : ""}`;
  node.style.setProperty("--deal-delay", `${index * 100}ms`);
  node.setAttribute("aria-label", hidden ? "House face-down card" : `${card.rank} of ${card.suit.name}`);
  node.innerHTML = `<span class="card-inner"><span class="card-face card-front ${card.suit.color === "red" ? "red-card" : ""}" aria-hidden="true"><span class="card-corner">${card.rank}<span>${card.suit.symbol}</span></span><span class="card-suit">${card.suit.symbol}</span><span class="card-corner card-corner-bottom">${card.rank}<span>${card.suit.symbol}</span></span></span><span class="card-face card-back" aria-hidden="true"><span class="card-back-pattern">✦</span></span></span>`;
  node.addEventListener("animationend", () => node.classList.remove("is-dealing"), { once: true });
  return node;
}

function renderCards(container, cards, hidden = false) {
  container.replaceChildren();
  cards.forEach((card, index) => container.append(renderCard(card, index, hidden)));
}

function combinations(cards, size) {
  const result = [];
  function visit(start, selection) {
    if (selection.length === size) {
      result.push(selection);
      return;
    }
    for (let index = start; index <= cards.length - (size - selection.length); index += 1) {
      visit(index + 1, [...selection, cards[index]]);
    }
  }
  visit(0, []);
  return result;
}

function straightHigh(ranks) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique[index] - unique[index + 4] === 4) return unique[index];
  }
  return 0;
}

function evaluateFive(cards) {
  const ranks = cards.map((card) => RANK_VALUES[card.rank]).sort((a, b) => b - a);
  const counts = new Map();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(ranks);
  if (flush && straight === 14) return [9, 14];
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) return [3, groups[0][0], ...groups.slice(1).map(([rank]) => rank)];
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return [2, groups[0][0], groups[1][0], groups[2][0]];
  }
  if (groups[0][1] === 2) return [1, groups[0][0], ...groups.slice(1).map(([rank]) => rank)];
  return [0, ...ranks];
}

function evaluateSeven(cards) {
  return combinations(cards, 5)
    .map(evaluateFive)
    .sort(compareHands)[0];
}

function compareHands(first, second) {
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const difference = (second[index] ?? 0) - (first[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function updateBet() {
  const amount = Number(elements.bet.value);
  const valid = Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance;
  elements.betError.textContent = valid ? "" : `Enter 0.01–${formatChipDisplay(state.balance)} chips.`;
  if (valid) state.bet = amount;
  elements.deal.disabled = state.roundActive || !valid;
  elements.raise.disabled = !state.roundActive || state.awaitingHouseCall || !valid;
}

function renderWallet() {
  elements.balance.textContent = formatChipDisplay(state.balance);
  elements.zeroCount.textContent = state.zeroCount;
  elements.activeBet.textContent = state.roundActive ? formatChipDisplay(state.playerContribution) : "0.00";
  elements.bet.max = formatChips(state.balance);
  if (!state.roundActive && Number(elements.bet.value) !== state.bet) {
    elements.bet.value = formatChips(state.bet);
  }
  const validRaise = Number.isFinite(Number(elements.bet.value))
    && Number(elements.bet.value) >= 0.01
    && Math.abs(Number(elements.bet.value) * 100 - Math.round(Number(elements.bet.value) * 100)) < 1e-8
    && Number(elements.bet.value) <= state.balance;
  elements.bet.disabled = false;
  elements.allIn.disabled = state.balance < 0.01;
  elements.deal.hidden = state.roundActive;
  elements.check.hidden = !state.roundActive;
  elements.raise.hidden = !state.roundActive;
  elements.fold.hidden = !state.roundActive;
  elements.check.disabled = !state.roundActive || state.awaitingHouseCall;
  elements.raise.disabled = !state.roundActive || state.awaitingHouseCall || !validRaise;
  elements.fold.disabled = !state.roundActive || state.awaitingHouseCall;
  elements.deal.disabled = state.roundActive || Number(elements.bet.value) !== state.bet || state.bet > state.balance;
  elements.street.textContent = state.roundActive
    ? ["PRE-FLOP", "FLOP", "TURN", "RIVER"][state.streetIndex]
    : state.streetIndex === 4 ? "SHOWDOWN" : state.streetIndex === 5 ? "FOLDED" : "WAITING TO DEAL";
  elements.pot.textContent = formatChipDisplay(state.playerContribution * 2);
}

function settle(net, message, resultClass, folded = false) {
  state.balance = Math.round((state.balance + net) * 100) / 100;
  if (state.balance <= 0) {
    state.zeroCount += 1;
    state.balance = 25;
    state.bet = 25;
    message += " Balance reached zero; 25 chips added.";
  } else if (state.bet > state.balance) {
    state.bet = state.balance;
  }
  state.roundActive = false;
  state.awaitingHouseCall = false;
  state.timer = null;
  state.streetIndex = folded ? 5 : 4;
  renderWallet();
  elements.message.className = `round-message ${resultClass}`;
  elements.message.textContent = message;
}

function renderCurrentCards(revealHouse = false) {
  renderCards(elements.playerCards, state.playerCards);
  renderCards(elements.houseCards, revealHouse ? state.houseCards : [], !revealHouse);
  renderCards(elements.communityCards, state.board);
}

function showDecision(message) {
  elements.message.className = "round-message";
  elements.message.textContent = message;
  renderWallet();
}

function advanceStreet() {
  state.timer = null;
  state.awaitingHouseCall = false;
  state.streetIndex += 1;
  if (state.streetIndex === 1) {
    state.board.push(...state.shoe.splice(-3));
    renderCurrentCards();
    showDecision("The flop is out. Check, raise, or fold.");
    return;
  }
  if (state.streetIndex === 2 || state.streetIndex === 3) {
    state.board.push(state.shoe.pop());
    renderCurrentCards();
    showDecision(state.streetIndex === 2
      ? "The turn is out. Check, raise, or fold."
      : "The river is out. Check, raise, or fold.");
    return;
  }
  resolveShowdown();
}

function resolveShowdown() {
  const playerHand = evaluateSeven([...state.playerCards, ...state.board]);
  const houseHand = evaluateSeven([...state.houseCards, ...state.board]);
  elements.playerRank.textContent = HAND_NAMES[playerHand[0]];
  elements.houseRank.textContent = HAND_NAMES[houseHand[0]];
  renderCurrentCards(true);

  const comparison = compareHands(playerHand, houseHand);
  if (comparison < 0) {
    settle(
      state.playerContribution * 2,
      `You win with ${HAND_NAMES[playerHand[0]]}. The ${formatChipDisplay(state.playerContribution * 2)}-chip pot is yours.`,
      "result-win",
    );
  } else if (comparison > 0) {
    settle(
      0,
      `House wins with ${HAND_NAMES[houseHand[0]]}. You lose ${formatChipDisplay(state.playerContribution)} chips.`,
      "result-loss",
    );
  } else {
    settle(
      state.playerContribution,
      `Split pot. Your ${formatChipDisplay(state.playerContribution)}-chip contribution is returned.`,
      "",
    );
  }
}

function dealHand() {
  if (state.roundActive) return;
  updateBet();
  if (Number(elements.bet.value) !== state.bet || state.bet > state.balance) return;

  state.roundActive = true;
  state.awaitingHouseCall = false;
  state.streetIndex = 0;
  state.playerContribution = state.bet;
  state.balance = Math.round((state.balance - state.bet) * 100) / 100;
  elements.playerRank.textContent = "";
  elements.houseRank.textContent = "";
  if (state.shoe.length < 9) state.shoe = createDeck();
  state.playerCards = [state.shoe.pop(), state.shoe.pop()];
  state.houseCards = [state.shoe.pop(), state.shoe.pop()];
  state.board = [];
  renderCurrentCards();
  elements.street.textContent = "PRE-FLOP";
  elements.pot.textContent = formatChipDisplay(state.playerContribution * 2);
  elements.message.className = "round-message";
  elements.message.textContent = "Pre-flop: check, raise, or fold.";
  renderWallet();
}

function checkHand() {
  if (!state.roundActive || state.awaitingHouseCall) return;
  advanceStreet();
}

function raiseHand() {
  if (!state.roundActive || state.awaitingHouseCall) return;
  const raiseAmount = Number(elements.bet.value);
  const valid = Number.isFinite(raiseAmount)
    && raiseAmount >= 0.01
    && Math.abs(raiseAmount * 100 - Math.round(raiseAmount * 100)) < 1e-8
    && raiseAmount <= state.balance;
  if (!valid) {
    elements.betError.textContent = `Enter a raise from 0.01 to ${formatChipDisplay(state.balance)} chips.`;
    return;
  }
  state.balance = Math.round((state.balance - raiseAmount) * 100) / 100;
  state.playerContribution = Math.round((state.playerContribution + raiseAmount) * 100) / 100;
  elements.betError.textContent = "";
  state.awaitingHouseCall = true;
  elements.message.className = "round-message";
  elements.message.textContent = `You raise ${formatChipDisplay(raiseAmount)} chips. House calls.`;
  renderWallet();
  state.timer = window.setTimeout(() => {
    state.awaitingHouseCall = false;
    advanceStreet();
  }, 550);
}

function foldHand() {
  if (!state.roundActive || state.awaitingHouseCall) return;
  state.roundActive = false;
  settle(0, `You fold. You lose ${formatChipDisplay(state.playerContribution)} chips.`, "result-loss", true);
}

function endGame() {
  if (state.timer !== null) {
    window.clearTimeout(state.timer);
    state.timer = null;
    state.roundActive = false;
    settle(0, `Game ended early. You lose ${formatChipDisplay(state.playerContribution)} chips.`, "result-loss");
  } else if (state.roundActive) {
    state.roundActive = false;
    settle(0, `Game ended early. You lose ${formatChipDisplay(state.playerContribution)} chips.`, "result-loss");
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
  state.bet = state.balance;
  elements.bet.value = formatChips(state.bet);
  elements.betError.textContent = "";
  renderWallet();
});
elements.deal.addEventListener("click", dealHand);
elements.check.addEventListener("click", checkHand);
elements.raise.addEventListener("click", raiseHand);
elements.fold.addEventListener("click", foldHand);
elements.end.addEventListener("click", endGame);
elements.bet.value = formatChips(state.bet);
renderWallet();
