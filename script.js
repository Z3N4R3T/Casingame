const SUITS = [
  { symbol: "♠", color: "black", name: "spades" },
  { symbol: "♥", color: "red", name: "hearts" },
  { symbol: "♦", color: "red", name: "diamonds" },
  { symbol: "♣", color: "black", name: "clubs" },
];
const MAX_BET = 20000;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DECK_COUNT = 6;

const elements = {
  dealerCards: document.querySelector("#dealer-cards"),
  playerCards: document.querySelector("#player-cards"),
  dealerLabel: document.querySelector("#dealer-label"),
  playerLabel: document.querySelector("#player-label"),
  tableName: document.querySelector("#table-name"),
  dealerTotal: document.querySelector("#dealer-total"),
  playerTotal: document.querySelector("#player-total"),
  handProgress: document.querySelector("#hand-progress"),
  runningCount: document.querySelector("#running-count"),
  trueCount: document.querySelector("#true-count"),
  decksRemaining: document.querySelector("#decks-remaining"),
  bustProbability: document.querySelector("#bust-probability"),
  bustDescription: document.querySelector("#bust-description"),
  cardsRemaining: document.querySelector("#cards-remaining"),
  cardsSeen: document.querySelector("#cards-seen"),
  countedCards: document.querySelector("#counted-cards"),
  countDescription: document.querySelector("#count-description"),
  roundMessage: document.querySelector("#round-message"),
  dealButton: document.querySelector("#deal-button"),
  splitButton: document.querySelector("#split-button"),
  doubleButton: document.querySelector("#double-button"),
  hitButton: document.querySelector("#hit-button"),
  standButton: document.querySelector("#stand-button"),
  chipBalance: document.querySelector("#chip-balance"),
  zeroCount: document.querySelector("#zero-count"),
  activeBet: document.querySelector("#active-bet"),
  betAmount: document.querySelector("#bet-amount"),
  allInButton: document.querySelector("#all-in-button"),
  betError: document.querySelector("#bet-error"),
  endGameButton: document.querySelector("#end-game-button"),
  brand: document.querySelector(".brand"),
  baccaratWagers: document.querySelector("#baccarat-wagers"),
  wagerButtons: [...document.querySelectorAll(".wager-button")],
  blackjackActions: [...document.querySelectorAll(".blackjack-action")],
  topNote: document.querySelector(".top-note"),
  gameTitle: document.querySelector("#game-title"),
  gameDescription: document.querySelector("#game-description"),
  shoeBadge: document.querySelector("#shoe-badge"),
  counterFootnote: document.querySelector("#counter-footnote"),
  blackjackLesson: document.querySelector("#blackjack-lesson"),
  counterTitle: document.querySelector("#counter-title"),
  countCaption: document.querySelector(".count-caption"),
};

const cardElements = new WeakMap();
const pageParams = new URLSearchParams(window.location.search);

function getStartingValue(key, fallback, minimum = 0) {
  const rawValue = pageParams.get(key);
  if (rawValue === null) return fallback;
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

const state = {
  game: document.body.dataset.game === "baccarat" ? "baccarat" : "blackjack",
  baccaratWager: "player",
  shoe: [],
  dealer: [],
  player: [],
  playerHands: [],
  handBets: [],
  finishedHands: [],
  activeHandIndex: 0,
  runningCount: 0,
  exposedCards: [],
  roundActive: false,
  holeCardRevealed: false,
  balance: getStartingValue("balance", 100, 0.01),
  bet: getStartingValue("bet", 25, 0.01),
  currentBet: 0,
  zeroCount: Math.floor(getStartingValue("zeros", 0)),
  hasSplit: false,
  splitAces: false,
};
state.bet = Math.min(state.bet, state.balance, MAX_BET);

function createShoe() {
  const cards = [];
  for (let deck = 0; deck < DECK_COUNT; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit, countValue: getCountValue(rank) });
      }
    }
  }

  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
  }
  return cards;
}

function getCountValue(rank) {
  if (["2", "3", "4", "5", "6"].includes(rank)) return 1;
  if (["10", "J", "Q", "K", "A"].includes(rank)) return -1;
  return 0;
}

function cardValue(rank) {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Number(rank);
}

function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + cardValue(card.rank), 0);
  let aces = hand.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function getHandTotalLabel(hand) {
  const total = handValue(hand);
  const lowTotal = hand.reduce(
    (sum, card) => sum + (card.rank === "A" ? 1 : cardValue(card.rank)),
    0,
  );
  const hasUsableAce = hand.some((card) => card.rank === "A") && lowTotal + 10 <= 21;
  const score = hasUsableAce ? `${total} (soft)` : String(total);
  return `${score} · ${hand.length} ${hand.length === 1 ? "card" : "cards"}`;
}

function baccaratScore(hand) {
  return hand.reduce((total, card) => total + (cardValue(card.rank) === 11 ? 1 : cardValue(card.rank) === 10 ? 0 : cardValue(card.rank)), 0) % 10;
}

function formatChips(amount) {
  return Number(amount.toFixed(2)).toString();
}

function formatChipDisplay(amount) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getBustProbability() {
  if (state.game !== "blackjack" || !state.roundActive || state.player.length === 0 || state.shoe.length === 0) {
    return null;
  }

  const bustingCards = state.shoe.filter(
    (card) => handValue([...state.player, card]) > 21,
  ).length;
  return bustingCards / state.shoe.length;
}

function drawCard() {
  if (state.shoe.length === 0) {
    state.shoe = createShoe();
    state.runningCount = 0;
    state.exposedCards = [];
  }
  return state.shoe.pop();
}

function exposeCard(card) {
  state.runningCount += card.countValue;
  state.exposedCards.push(card);
}

function revealHoleCard() {
  if (!state.holeCardRevealed && state.dealer.length > 1) {
    state.holeCardRevealed = true;
    exposeCard(state.dealer[1]);
  }
}

function renderCard(card, hidden = false, index = 0) {
  const cardElement = document.createElement("div");
  cardElement.className = `playing-card${hidden ? " is-hidden" : ""} is-dealing`;
  cardElement.style.setProperty("--deal-delay", `${index * 90}ms`);
  cardElement.setAttribute("aria-label", hidden ? "Face-down card" : `${card.rank} of ${card.suit.name}`);
  cardElement.innerHTML = `
    <span class="card-inner">
      <span class="card-face card-front ${card.suit.color === "red" ? "red-card" : ""}" aria-hidden="true">
        <span class="card-corner">${card.rank}<span>${card.suit.symbol}</span></span>
        <span class="card-suit" aria-hidden="true">${card.suit.symbol}</span>
        <span class="card-corner card-corner-bottom" aria-hidden="true">${card.rank}<span>${card.suit.symbol}</span></span>
      </span>
      <span class="card-face card-back" aria-hidden="true">
        <span class="card-back-pattern" aria-hidden="true">✦</span>
      </span>
    </span>`;
  cardElement.dataset.cardRank = card.rank;
  cardElement.dataset.hidden = String(hidden);
  cardElement.addEventListener("animationend", () => {
    cardElement.classList.remove("is-dealing");
  }, { once: true });
  cardElements.set(card, cardElement);
  return cardElement;
}

function renderHand(container, hand, hideHoleCard = false) {
  container.replaceChildren();
  hand.forEach((card, index) => {
    const hidden = hideHoleCard && index === 1;
    let cardElement = cardElements.get(card);
    if (!cardElement) {
      cardElement = renderCard(card, hidden, index);
    } else {
      cardElement.classList.toggle("is-hidden", hidden);
      cardElement.dataset.hidden = String(hidden);
      cardElement.setAttribute("aria-label", hidden ? "Face-down card" : `${card.rank} of ${card.suit.name}`);
    }
    container.append(cardElement);
  });
}

function renderCountedCards() {
  const recent = state.exposedCards.slice(-8);
  elements.countedCards.replaceChildren();
  if (recent.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-cards";
    empty.textContent = "Cards appear here as they’re revealed";
    elements.countedCards.append(empty);
  } else {
    recent.forEach((card) => {
      const chip = document.createElement("span");
      chip.className = `mini-card ${card.suit.color === "red" ? "red-card" : ""}`;
      chip.setAttribute("aria-label", `${card.rank} of ${card.suit.name}, count ${card.countValue > 0 ? "+1" : card.countValue}`);
      chip.innerHTML = `${card.rank}<span>${card.suit.symbol}</span>`;
      elements.countedCards.append(chip);
    });
  }
}

function setMessage(message, type = "") {
  elements.roundMessage.className = `round-message${type ? ` ${type}` : ""}`;
  elements.roundMessage.innerHTML = `<span class="message-icon" aria-hidden="true">${type === "result-win" ? "✦" : "♣"}</span><span>${message}</span>`;
}

function render() {
  const isBlackjack = state.game === "blackjack";
  const hideHoleCard = isBlackjack && state.roundActive && !state.holeCardRevealed;
  renderHand(elements.dealerCards, state.dealer, hideHoleCard);
  renderHand(elements.playerCards, state.player);

  elements.dealerTotal.textContent = state.dealer.length
    ? hideHoleCard
      ? `Upcard ${state.dealer[0].rank} · hole card hidden`
      : (isBlackjack ? getHandTotalLabel(state.dealer) : baccaratScore(state.dealer)).toString()
    : "";
  elements.playerTotal.textContent = state.player.length
    ? (isBlackjack ? getHandTotalLabel(state.player) : baccaratScore(state.player)).toString()
    : "";
  elements.dealerLabel.textContent = isBlackjack ? "DEALER" : "BANKER";
  elements.playerLabel.textContent = isBlackjack ? "YOU" : "PLAYER";
  elements.tableName.textContent = isBlackjack ? "BLACKJACK" : "BACCARAT";
  document.title = isBlackjack ? "Blackjack Count Trainer" : "Baccarat | Tablewise";
  document.querySelector("#table-panel").setAttribute(
    "aria-label",
    isBlackjack ? "Blackjack table" : "Baccarat table",
  );
  elements.gameTitle.innerHTML = isBlackjack
    ? 'Blackjack, <span>with a sharper eye.</span>'
    : 'Baccarat, <span>place your bet.</span>';
  elements.gameDescription.textContent = isBlackjack
    ? "Play a hand while keeping a Hi-Lo count. The counter updates as cards are revealed, so you can see the method in action."
    : "Choose Player, Banker, or Tie, then watch the cards play out using standard baccarat drawing rules.";
  elements.shoeBadge.innerHTML = '<span aria-hidden="true">✦</span> 6-DECK SHOE';
  elements.counterFootnote.textContent = isBlackjack
    ? "The dealer’s face-down card is not counted until it’s revealed."
    : "All baccarat cards are visible. Hi-Lo is shown for practice; it is not a standard baccarat betting system.";
  elements.blackjackLesson.hidden = !isBlackjack;
  elements.counterTitle.textContent = isBlackjack ? "The count" : "Card count";
  elements.countCaption.textContent = isBlackjack ? "RUNNING COUNT" : "HI-LO PRACTICE COUNT";
  elements.topNote.innerHTML = `<span class="live-dot"></span> ${isBlackjack ? "BLACKJACK COUNT TRAINER" : "BACCARAT TABLE"}`;
  elements.baccaratWagers.hidden = isBlackjack;
  elements.blackjackActions.forEach((button) => {
    button.hidden = !isBlackjack;
  });
  elements.wagerButtons.forEach((button) => {
    button.disabled = state.roundActive;
    button.classList.toggle("is-selected", button.dataset.wager === state.baccaratWager);
  });
  elements.handProgress.textContent = state.playerHands.length > 1
    ? `HAND ${state.activeHandIndex + 1} OF ${state.playerHands.length}`
    : "";

  const decksLeft = state.shoe.length / 52;
  const trueCount = decksLeft > 0 ? state.runningCount / decksLeft : 0;
  elements.runningCount.textContent = state.runningCount > 0 ? `+${state.runningCount}` : state.runningCount;
  elements.trueCount.textContent = trueCount > 0 ? `+${trueCount.toFixed(1)}` : trueCount.toFixed(1);
  elements.decksRemaining.textContent = decksLeft.toFixed(1);
  const bustProbability = getBustProbability();
  elements.bustProbability.closest(".bust-risk").hidden = !isBlackjack;
  elements.bustProbability.textContent = bustProbability === null
    ? "—"
    : `${(bustProbability * 100).toFixed(1)}%`;
  elements.bustDescription.textContent = bustProbability === null
    ? "Deal a hand to calculate the chance your next card takes you over 21."
    : `${Math.round(bustProbability * state.shoe.length)} of ${state.shoe.length} cards left would bust this hand.`;
  elements.cardsRemaining.textContent = state.shoe.length;
  elements.cardsSeen.textContent = `${state.exposedCards.length} seen`;
  elements.countDescription.textContent = state.exposedCards.length
    ? `${state.exposedCards.length} visible cards added to the count.`
    : "Start at zero. Count every card you can see.";
  renderCountedCards();

  elements.hitButton.disabled = !isBlackjack || !state.roundActive;
  elements.standButton.disabled = !isBlackjack || !state.roundActive;
  const canActOnTwoCards = isBlackjack
    && state.roundActive
    && state.player.length === 2
    && !state.splitAces;
  elements.splitButton.disabled = !canActOnTwoCards
    || state.hasSplit
    || state.player[0].rank !== state.player[1].rank
    || !canAddWager(state.currentBet);
  elements.doubleButton.disabled = !canActOnTwoCards
    || !canAddWager(state.currentBet);
  elements.dealButton.textContent = state.roundActive
    ? isBlackjack ? "Hand in play" : "Round in play"
    : isBlackjack ? "Deal hand →" : "Deal round →";
  elements.chipBalance.textContent = formatChipDisplay(state.balance);
  elements.zeroCount.textContent = state.zeroCount;
  elements.activeBet.textContent = formatChipDisplay(
    isBlackjack ? state.handBets.reduce((total, bet) => total + bet, 0) : state.currentBet,
  );
  elements.betAmount.max = formatChips(Math.min(state.balance, MAX_BET));
  if (Number(elements.betAmount.value) !== state.bet) {
    elements.betAmount.value = state.bet;
  }
  elements.betAmount.disabled = state.roundActive;
  elements.allInButton.disabled = state.roundActive || state.balance === 0;
  elements.dealButton.disabled = state.roundActive || !isValidBet();
}

function canAddWager(amount) {
  const committed = state.handBets.reduce((total, bet) => total + bet, 0);
  return state.balance >= committed + amount && committed + amount <= MAX_BET;
}

function isValidBet() {
  const amount = Number(elements.betAmount.value);
  return Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance
    && amount <= MAX_BET;
}

function updateBet() {
  const amount = Number(elements.betAmount.value);
  const valid = Number.isFinite(amount)
    && amount >= 0.01
    && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8
    && amount <= state.balance
    && amount <= MAX_BET;
  elements.betError.textContent = valid
    ? ""
    : `Enter a chip amount from 0.01 to ${formatChipDisplay(Math.min(state.balance, MAX_BET))} in 0.01 steps.`;
  elements.dealButton.disabled = state.roundActive || !valid;
  if (valid) state.bet = amount;
}

function finishRound(message, type = "", balanceChange = 0) {
  revealHoleCard();
  state.balance = Math.round((state.balance + balanceChange) * 100) / 100;
  state.currentBet = 0;
  state.playerHands = [];
  state.handBets = [];
  state.finishedHands = [];
  if (state.balance <= 0) {
    state.zeroCount += 1;
    state.balance = 25;
    state.bet = 25;
    message += " Your balance hit zero—25 chips added.";
  } else if (state.bet > Math.min(state.balance, MAX_BET)) {
    state.bet = Math.min(state.balance, MAX_BET);
  }
  state.roundActive = false;
  render();
  setMessage(message, type);
}

function setActiveHand(index) {
  state.activeHandIndex = index;
  state.player = state.playerHands[index];
  state.currentBet = state.handBets[index];
}

function finishPlayerHand(message) {
  state.finishedHands[state.activeHandIndex] = true;
  const nextHand = state.finishedHands.findIndex((finished) => !finished);
  if (nextHand !== -1) {
    setActiveHand(nextHand);
    render();
    if (state.splitAces) {
      finishPlayerHand("Split aces stand after one card.");
      return;
    }
    setMessage(`Hand ${nextHand + 1} of ${state.playerHands.length}. ${message}`);
    render();
    return;
  }
  resolveDealerAndHands();
}

function resolveDealerAndHands() {
  revealHoleCard();
  while (handValue(state.dealer) < 17) {
    const card = drawCard();
    state.dealer.push(card);
    exposeCard(card);
  }

  const dealerTotal = handValue(state.dealer);
  let wonBets = 0;
  let lostBets = 0;
  let pushedBets = 0;
  state.playerHands.forEach((hand, index) => {
    const playerTotal = handValue(hand);
    const bet = state.handBets[index];
    if (playerTotal > 21 || (dealerTotal <= 21 && playerTotal < dealerTotal)) {
      lostBets += bet;
    } else if (playerTotal === dealerTotal && dealerTotal <= 21) {
      pushedBets += bet;
    } else {
      wonBets += bet;
    }
  });

  const outcomes = [];
  if (wonBets > 0) outcomes.push(`won ${formatChipDisplay(wonBets)} chips`);
  if (lostBets > 0) outcomes.push(`lost ${formatChipDisplay(lostBets)} chips`);
  if (pushedBets > 0) outcomes.push(`${formatChipDisplay(pushedBets)} chips pushed`);
  const message = `${outcomes.join(", ")}. Winning bets return twice their amount.`;
  const type = wonBets > 0 && lostBets === 0
    ? "result-win"
    : lostBets > 0 && wonBets === 0
      ? "result-loss"
      : "";
  finishRound(message, type, wonBets - lostBets);
}

function endGame() {
  if (state.roundActive) {
    const activeWagers = state.game === "blackjack"
      ? state.handBets.reduce((total, bet) => total + bet, 0)
      : state.currentBet;
    finishRound("Game ended. Active bets lost.", "result-loss", -activeWagers);
  }
  const menuParams = new URLSearchParams({
    balance: formatChips(state.balance),
    zeros: String(state.zeroCount),
    bet: formatChips(state.bet),
  });
  window.location.href = `mainpage.html?${menuParams.toString()}`;
}

function shouldBankerDraw(bankerScore, playerThirdCard) {
  if (playerThirdCard === null) return bankerScore <= 5;
  if (bankerScore <= 2) return true;
  if (bankerScore === 3) return playerThirdCard !== 8;
  if (bankerScore === 4) return playerThirdCard >= 2 && playerThirdCard <= 7;
  if (bankerScore === 5) return playerThirdCard >= 4 && playerThirdCard <= 7;
  if (bankerScore === 6) return playerThirdCard === 6 || playerThirdCard === 7;
  return false;
}

function baccaratCardValue(card) {
  const value = cardValue(card.rank);
  return value === 11 ? 1 : value === 10 ? 0 : value;
}

function startBaccaratRound() {
  if (state.shoe.length < 20) {
    state.shoe = createShoe();
    state.runningCount = 0;
    state.exposedCards = [];
  }
  state.player = [];
  state.dealer = [];
  state.playerHands = [];
  state.handBets = [];
  state.finishedHands = [];
  state.currentBet = state.bet;
  state.roundActive = true;
  state.holeCardRevealed = true;

  const firstFour = [drawCard(), drawCard(), drawCard(), drawCard()];
  state.player.push(firstFour[0], firstFour[2]);
  state.dealer.push(firstFour[1], firstFour[3]);
  firstFour.forEach(exposeCard);

  let playerScore = baccaratScore(state.player);
  let bankerScore = baccaratScore(state.dealer);
  let playerThirdCard = null;
  const natural = playerScore >= 8 || bankerScore >= 8;

  if (!natural && playerScore <= 5) {
    const thirdCard = drawCard();
    state.player.push(thirdCard);
    exposeCard(thirdCard);
    playerThirdCard = baccaratCardValue(thirdCard);
    playerScore = baccaratScore(state.player);
  }
  if (!natural && shouldBankerDraw(bankerScore, playerThirdCard)) {
    const thirdCard = drawCard();
    state.dealer.push(thirdCard);
    exposeCard(thirdCard);
    bankerScore = baccaratScore(state.dealer);
  }

  render();
  const result = playerScore === bankerScore
    ? "tie"
    : playerScore > bankerScore ? "player" : "banker";
  const bet = state.currentBet;
  let balanceChange;
  let resultMessage;
  let resultType = "";

  if (state.baccaratWager === "tie") {
    balanceChange = result === "tie" ? bet * 8 : -bet;
    resultMessage = result === "tie"
      ? `Tie bet wins ${formatChipDisplay(balanceChange)} chips at 8 to 1.`
      : `No tie: you lost ${formatChipDisplay(bet)} chips.`;
    resultType = result === "tie" ? "result-win" : "result-loss";
  } else if (result === "tie") {
    balanceChange = 0;
    resultMessage = `Tie game. Your ${formatChipDisplay(bet)}-chip ${state.baccaratWager} bet is returned.`;
  } else if (result === state.baccaratWager) {
    balanceChange = state.baccaratWager === "banker"
      ? Math.round(bet * 0.95 * 100) / 100
      : bet;
    resultMessage = `${result === "player" ? "Player" : "Banker"} wins. You won ${formatChipDisplay(balanceChange)} chips${state.baccaratWager === "banker" ? " after the 5% commission" : ""}.`;
    resultType = "result-win";
  } else {
    balanceChange = -bet;
    resultMessage = `${result === "player" ? "Player" : "Banker"} wins. You lost ${formatChipDisplay(bet)} chips.`;
    resultType = "result-loss";
  }

  finishRound(`Player ${playerScore} — Banker ${bankerScore}. ${resultMessage}`, resultType, balanceChange);
}

function startRound() {
  if (state.roundActive || !isValidBet()) {
    updateBet();
    return;
  }
  if (state.game === "baccarat") {
    startBaccaratRound();
    return;
  }
  if (state.shoe.length < 20) {
    state.shoe = createShoe();
    state.runningCount = 0;
    state.exposedCards = [];
    setMessage("New shoe shuffled. The count resets to zero.");
  }

  state.player = [];
  state.playerHands = [];
  state.handBets = [];
  state.finishedHands = [];
  state.activeHandIndex = 0;
  state.hasSplit = false;
  state.splitAces = false;
  state.dealer = [];
  state.holeCardRevealed = false;
  state.currentBet = state.bet;
  state.roundActive = true;

  const playerFirst = drawCard();
  const dealerUp = drawCard();
  const playerSecond = drawCard();
  const dealerHole = drawCard();
  state.player.push(playerFirst, playerSecond);
  state.playerHands = [state.player];
  state.handBets = [state.currentBet];
  state.finishedHands = [false];
  state.dealer.push(dealerUp, dealerHole);
  exposeCard(playerFirst);
  exposeCard(dealerUp);
  exposeCard(playerSecond);

  render();
  const playerBlackjack = handValue(state.player) === 21;
  const dealerBlackjack = handValue(state.dealer) === 21;
  if (playerBlackjack || dealerBlackjack) {
    revealHoleCard();
    if (playerBlackjack && dealerBlackjack) {
      finishRound("Both have blackjack. Push; your bet is returned.", "", 0);
    } else if (playerBlackjack) {
      finishRound(`Blackjack! You won ${state.currentBet} chips.`, "result-win", state.currentBet);
    } else {
      finishRound(`Dealer has blackjack. You lost ${state.currentBet} chips.`, "result-loss", -state.currentBet);
    }
    return;
  }
  setMessage("Your move. The count only includes cards that are face up.");
  render();
}

function hit() {
  if (!state.roundActive) return;
  const card = drawCard();
  state.player.push(card);
  exposeCard(card);
  render();
  const total = handValue(state.player);
  if (total > 21) finishPlayerHand(`Hand ${state.activeHandIndex + 1} busts with ${total}.`);
  else if (total === 21) finishPlayerHand(`Hand ${state.activeHandIndex + 1} stands on 21.`);
  else setMessage(`Hand ${state.activeHandIndex + 1} of ${state.playerHands.length}. Your move.`);
  render();
}

function stand() {
  if (!state.roundActive) return;
  finishPlayerHand(`Hand ${state.activeHandIndex + 1} stands on ${handValue(state.player)}.`);
}

function splitPair() {
  if (elements.splitButton.disabled) return;
  const [first, second] = state.player;
  const handIndex = state.activeHandIndex;
  const isSplittingAces = first.rank === "A";
  const firstHand = [first, drawCard()];
  const secondHand = [second, drawCard()];

  state.playerHands[handIndex] = firstHand;
  state.playerHands.splice(handIndex + 1, 0, secondHand);
  state.handBets.splice(handIndex + 1, 0, state.handBets[handIndex]);
  state.finishedHands.splice(handIndex + 1, 0, false);
  state.player = firstHand;
  state.hasSplit = true;
  state.splitAces = isSplittingAces;
  exposeCard(firstHand[1]);
  exposeCard(secondHand[1]);
  render();

  if (isSplittingAces) {
    finishPlayerHand("Split aces receive one card each.");
  } else {
    setMessage("Pair split. Play each hand in turn.");
    render();
  }
}

function doubleDown() {
  if (elements.doubleButton.disabled) return;
  const handIndex = state.activeHandIndex;
  state.handBets[handIndex] *= 2;
  state.currentBet = state.handBets[handIndex];
  const card = drawCard();
  state.player.push(card);
  exposeCard(card);
  render();
  const total = handValue(state.player);
  if (total > 21) finishPlayerHand(`Hand ${handIndex + 1} busts with ${total} after doubling.`);
  else finishPlayerHand(`Hand ${handIndex + 1} doubles and stands on ${total}.`);
}

state.shoe = createShoe();
elements.betAmount.addEventListener("input", updateBet);
elements.allInButton.addEventListener("click", () => {
  state.bet = Math.min(state.balance, MAX_BET);
  elements.betAmount.value = state.bet;
  elements.betError.textContent = "";
  render();
});
elements.endGameButton.addEventListener("click", endGame);
elements.brand.addEventListener("click", (event) => {
  event.preventDefault();
  endGame();
});
elements.wagerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (state.roundActive) return;
    state.baccaratWager = button.dataset.wager;
    render();
  });
});
elements.dealButton.addEventListener("click", startRound);
elements.splitButton.addEventListener("click", splitPair);
elements.doubleButton.addEventListener("click", doubleDown);
elements.hitButton.addEventListener("click", hit);
elements.standButton.addEventListener("click", stand);
render();
