const params = new URLSearchParams(window.location.search);

function readAmount(key, fallback, minimum = 0) {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
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

const balance = readAmount("balance", 100, 0.01);
const zeroCount = Math.floor(readAmount("zeros", 0));
const bet = Math.min(readAmount("bet", 25, 0.01), balance);
const nextPageParams = new URLSearchParams({
  balance: formatChips(balance),
  zeros: String(zeroCount),
  bet: formatChips(bet),
});

document.querySelector("#menu-balance").textContent = formatChipDisplay(balance);
document.querySelector("#menu-balance-detail").textContent = formatChipDisplay(balance);
document.querySelector("#menu-zero-count").textContent = zeroCount;
document.querySelector("#blackjack-link").href = `index.html?${nextPageParams}`;
document.querySelector("#baccarat-link").href = `bacarat.html?${nextPageParams}`;
document.querySelector("#poker-link").href = `poker.html?${nextPageParams}`;
document.querySelector("#roulette-link").href = `roulette.html?${nextPageParams}`;
document.querySelector("#slots-link").href = `slots.html?${nextPageParams}`;
