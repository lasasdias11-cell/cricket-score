import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  enableMultiTabIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaA5DXo3JkWGqGdjFBMPnKj5PlwAbCT-Y",
  authDomain: "thursday-cricket.firebaseapp.com",
  projectId: "thursday-cricket",
  storageBucket: "thursday-cricket.appspot.com",
  messagingSenderId: "752945537542",
  appId: "1:752945537542:web:84be60617247fc045fd987"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Consolidated from effects.js
let modalResolver;
let modalReturnFocus;
let modalKeyHandler;

function initRippleSystem() {
  const layer = document.getElementById("ripple-layer");
  if (!layer) throw new Error("Ripple layer is missing.");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const isInteractive = target.closest("[data-ripple], button, .btn, .run-btn, .nav-btn, .mode-option, .theme-card, .prow, .innings-tab, .team-chip, .card, .glass-card, .icon");
    const isEmptyBackground = target === document.body || target.matches(".bg, .content, section:empty, #app");
    if (!isInteractive && !isEmptyBackground) return;

    const ripple = document.createElement("span");
    ripple.className = "ripple tc-water-wave";
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    layer.append(ripple);
    if (reducedMotion.matches) {
      requestAnimationFrame(() => ripple.remove());
    } else {
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    }
  }, { passive: true });
}

function attachRippleEffect() {
  initRippleSystem();
}

function finishModal(result) {
  const modal = document.getElementById("glass-modal");
  if (!modal || !modalResolver) return;
  const resolve = modalResolver;
  modalResolver = undefined;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modal.replaceChildren();
  if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
  modalKeyHandler = undefined;
  resolve(result);
  modalReturnFocus?.focus?.();
  modalReturnFocus = undefined;
}

function closeGlassModal(result = "close") {
  finishModal(result);
}

function openGlassModal({ title, body = "", actions = [] }) {
  const modal = document.getElementById("glass-modal");
  if (!modal) return Promise.reject(new Error("Glass modal container is missing."));
  if (modalResolver) finishModal("replaced");
  modalReturnFocus = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "glass-modal__backdrop";
  backdrop.addEventListener("click", () => finishModal("backdrop"));
  const panel = document.createElement("section");
  panel.className = "glass-modal__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "glass-modal-title");

  const header = document.createElement("div");
  header.className = "glass-modal__header";
  const heading = document.createElement("h2");
  heading.id = "glass-modal-title";
  heading.textContent = String(title ?? "Thursday Cricket");
  const close = document.createElement("button");
  close.className = "glass-modal__close";
  close.type = "button";
  close.setAttribute("aria-label", "Close dialog");
  close.textContent = "×";
  close.addEventListener("click", () => finishModal("close"));
  header.append(heading, close);

  const content = document.createElement("div");
  content.className = "glass-modal__body";
  if (body instanceof Node) content.append(body);
  else content.innerHTML = String(body);

  const actionBar = document.createElement("div");
  actionBar.className = "glass-modal__actions";
  for (const action of actions) {
    const button = document.createElement("button");
    button.className = `glass-modal__action${action.primary ? " is-primary" : ""}`;
    button.type = "button";
    button.textContent = String(action.label ?? action.id);
    button.addEventListener("click", async () => {
      try {
        if (typeof action.onClick === "function") {
          const shouldClose = await action.onClick();
          if (shouldClose === false) return;
        }
        finishModal(action.id);
      } catch (error) {
        let errorMessage = content.querySelector("[data-modal-error]");
        if (!errorMessage) {
          errorMessage = document.createElement("p");
          errorMessage.dataset.modalError = "true";
          errorMessage.className = "inline-error";
          errorMessage.setAttribute("role", "alert");
          content.append(errorMessage);
        }
        errorMessage.textContent = error instanceof Error ? error.message : String(error);
      }
    });
    actionBar.append(button);
  }
  panel.append(header, content, actionBar);
  modal.replaceChildren(backdrop, panel);
  modalResolver = undefined;
  const resultPromise = new Promise((resolve) => { modalResolver = resolve; });
  modalKeyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finishModal("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", modalKeyHandler);
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    modal.classList.add("is-open");
    (panel.querySelector("button") ?? panel).focus();
  });
  return resultPromise;
}


// Consolidated from firebase-config.js
// ⚠️ SECURITY: Do not commit this file to a public repository.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCaA5DXo3JkWGqGdjFBMPnKj5PlwAbCT-Y",
  authDomain: "thursday-cricket.firebaseapp.com",
  projectId: "thursday-cricket",
  storageBucket: "thursday-cricket.appspot.com",
  messagingSenderId: "752945537542",
  appId: "1:752945537542:web:84be60617247fc045fd987"
};


// Consolidated from seed.js
const SQUAD_TEAMS = {
  whiteTigers: {
    id: "white-tigers",
    name: "White Tigers",
    code: "White@tiger",
    domain: "whitetigers.cricket",
    color: "#f5f5f5",
    accent: "#e8e8e8",
    players: ["Dilusha", "Isala", "Anuk"]
  },
  blackPanthers: {
    id: "black-panthers",
    name: "Black Panthers",
    code: "Black@panthers",
    domain: "blackpanthers.cricket",
    color: "#1a1a1a",
    accent: "#2d2d2d",
    players: ["Jevon", "Lasas", "Shenal"]
  }
};

const SEED_PLAYERS = [
  { username: "Dilusha", teamKey: "whiteTigers", role: "Batter", tags: ["Captain", "Opener"] },
  { username: "Isala", teamKey: "whiteTigers", role: "All-Rounder", tags: ["Vice-Captain"] },
  { username: "Anuk", teamKey: "whiteTigers", role: "Bowler", tags: ["Death Specialist"] },
  { username: "Jevon", teamKey: "blackPanthers", role: "All-Rounder", tags: ["Captain", "Finisher"] },
  { username: "Lasas", teamKey: "blackPanthers", role: "Batter", tags: ["Opener"] },
  { username: "Shenal", teamKey: "blackPanthers", role: "Bowler", tags: ["Spinner"] }
];

function resolveEmail(username, teamKey) {
  const team = SQUAD_TEAMS[teamKey];
  if (!team) throw new Error("Unknown team");
  return `${String(username).toLowerCase()}@${team.domain}`;
}

function resolvePassword(teamKey) {
  const team = SQUAD_TEAMS[teamKey];
  if (!team) throw new Error("Unknown team");
  return team.code;
}

function findSeedPlayer(username) {
  return SEED_PLAYERS.find((player) => player.username === username) ?? null;
}

function seedTeamsAsAppTeams() {
  return Object.values(SQUAD_TEAMS).map((team) => ({
    id: team.id,
    name: team.name,
    tag: team.id === "white-tigers" ? "WT" : "BP",
    code: team.code,
    secretCode: team.code,
    domain: team.domain,
    color: team.color,
    accent: team.accent,
    roster: SEED_PLAYERS.filter((player) => player.teamKey === Object.keys(SQUAD_TEAMS).find((key) => SQUAD_TEAMS[key].id === team.id)).map((player) => ({
      id: player.username.toLowerCase(),
      name: player.username,
      role: player.role,
      tags: [...player.tags]
    }))
  }));
}


// Consolidated from state.js

const STORAGE_KEY = "tc_state_v1";

const DEFAULT_TEAMS = seedTeamsAsAppTeams().map((team) => ({
  ...team,
  roster: team.roster.map((player) => ({ ...player }))
}));
/*
const LEGACY_DEFAULT_TEAMS = [
  { id: "white-tigers", name: "White Tigers", tag: "WT", color: "#e8f4f2", secretCode: "White@tiger", roster: [
    { id: "wt-aryan", name: "Aryan Sharma", role: "Batter" }, { id: "wt-kabir", name: "Kabir Singh", role: "All-rounder" },
    { id: "wt-dev", name: "Dev Patel", role: "Bowler" }, { id: "wt-arjun", name: "Arjun Rao", role: "Wicket-keeper" }
  ] },
  { id: "black-panthers", name: "Black Panthers", tag: "BP", color: "#8eb8ff", secretCode: "Black@panthers", roster: [
    { id: "bp-rohan", name: "Rohan Mehta", role: "Batter" }, { id: "bp-zain", name: "Zain Khan", role: "All-rounder" },
    { id: "bp-vihaan", name: "Vihaan Das", role: "Bowler" }, { id: "bp-neil", name: "Neil Joseph", role: "Wicket-keeper" }
  ] }
];
*/

function createInitialState() {
  return {
    currentUser: null,
    currentPage: "dashboard",
    teams: DEFAULT_TEAMS.map((team) => ({ ...team, roster: team.roster.map((player) => ({ ...player })) })),
    players: [],
    matches: [],
    activeMatchId: null
  };
}

function createStore(initialState = createInitialState()) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState() { return state; },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A state listener must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(updater) {
      const nextState = typeof updater === "function" ? updater(state) : { ...state, ...updater };
      if (!nextState || typeof nextState !== "object" || Array.isArray(nextState)) {
        throw new TypeError("A store update must produce a state object.");
      }
      state = nextState;
      for (const listener of listeners) listener(state);
      return state;
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return state;
    },
    load() {
      const serialized = localStorage.getItem(STORAGE_KEY);
      if (serialized === null) return state;
      let parsed;
      try {
        parsed = JSON.parse(serialized);
      } catch (error) {
        throw new Error(`Saved scoreboard data is invalid: ${error.message}`);
      }
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.matches)) {
        throw new TypeError("Saved scoreboard data has an unsupported shape.");
      }
      if (parsed.players !== undefined && !Array.isArray(parsed.players)) {
        throw new TypeError("Saved player data has an unsupported shape.");
      }
      state = { ...createInitialState(), ...parsed };
      for (const listener of listeners) listener(state);
      return state;
    }
  };
}


// Consolidated from analysis.js
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const teamFor = (match, id) => [match?.teamA, match?.teamB].find((team) => team?.id === id);

function mergePlayer(target, id, stats) {
  if (!id) return;
  const key = String(id);
  if (!target[key]) target[key] = { playerId: key, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, conceded: 0, bowlingBalls: 0 };
  for (const field of ["runs", "balls", "fours", "sixes", "wickets", "conceded", "bowlingBalls"]) {
    target[key][field] += asNumber(stats?.[field]);
  }
}

function matchStats(match) {
  const teams = {};
  const players = {};
  for (const team of [match?.teamA, match?.teamB]) {
    if (team?.id) teams[team.id] = { id: team.id, name: team.name || team.id, runs: 0, wickets: 0, matches: 0 };
  }
  for (const innings of match?.innings ?? []) {
    const team = teams[innings.battingTeamId] ?? { id: innings.battingTeamId, name: teamFor(match, innings.battingTeamId)?.name ?? innings.battingTeamId, runs: 0, wickets: 0, matches: 0 };
    team.runs += asNumber(innings.score);
    team.wickets += asNumber(innings.wickets);
    team.matches += 1;
    teams[team.id] = team;
    for (const [id, stats] of Object.entries(innings.batsmen ?? {})) mergePlayer(players, id, stats);
    for (const [id, stats] of Object.entries(innings.bowlers ?? {})) mergePlayer(players, id, stats);
  }
  for (const [id, stats] of Object.entries(match?.retrospectiveStats ?? {})) mergePlayer(players, id, stats);
  return { teams: Object.values(teams), players: Object.values(players) };
}

function aggregate(matches = []) {
  const teamMap = new Map();
  const playerMap = new Map();
  for (const match of matches.filter(Boolean)) {
    const current = matchStats(match);
    for (const team of current.teams) {
      const previous = teamMap.get(team.id) ?? { ...team, runs: 0, wickets: 0, matches: 0 };
      previous.runs += team.runs;
      previous.wickets += team.wickets;
      previous.matches += team.matches;
      teamMap.set(team.id, previous);
    }
    for (const player of current.players) {
      const previous = playerMap.get(player.playerId) ?? { ...player, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, conceded: 0, bowlingBalls: 0 };
      for (const key of ["runs", "balls", "fours", "sixes", "wickets", "conceded", "bowlingBalls"]) previous[key] += player[key];
      playerMap.set(player.playerId, previous);
    }
  }
  return { matches, teams: [...teamMap.values()], players: [...playerMap.values()] };
}

function buildSeriesTotals(matches = []) {
  return aggregate(matches);
}

function buildThisWeekMatch(matches = []) {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return aggregate(matches.filter((match) => {
    const date = new Date(match.createdAt);
    return Number.isFinite(date.getTime()) && date >= start;
  }));
}

function buildLastMatch(matches = []) {
  return aggregate(matches.length ? [matches.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]] : []);
}

function buildPerMatch(matchId, matches = []) {
  return aggregate(matches.filter((match) => match.id === matchId));
}

function computeAwards(matchOrSeries) {
  const series = Array.isArray(matchOrSeries)
    ? aggregate(matchOrSeries)
    : matchOrSeries?.players && matchOrSeries?.teams
      ? matchOrSeries
      : matchStats(matchOrSeries);
  const players = series.players ?? [];
  const names = new Map();
  for (const match of series.matches ?? (Array.isArray(matchOrSeries) ? matchOrSeries : [matchOrSeries])) {
    for (const team of [match?.teamA, match?.teamB]) {
      for (const player of team?.roster ?? []) names.set(String(player.id ?? player.playerId ?? player), player.name ?? player.displayName ?? String(player.id ?? player));
    }
  }
  const ranked = (selector, sort) => players.slice().sort(sort).find((player) => selector(player)) ?? null;
  const byRuns = (a, b) => b.runs - a.runs || a.playerId.localeCompare(b.playerId);
  const byWickets = (a, b) => b.wickets - a.wickets || a.conceded - b.conceded || a.playerId.localeCompare(b.playerId);
  const batter = ranked((player) => player.runs > 0, byRuns);
  const bowler = ranked((player) => player.wickets > 0 || player.bowlingBalls > 0, byWickets);
  const wicketTaker = ranked((player) => player.wickets > 0, byWickets);
  const strikeRate = ranked((player) => player.balls > 0, (a, b) => (b.runs / b.balls) - (a.runs / a.balls) || byRuns(a, b));
  const economy = ranked((player) => player.bowlingBalls > 0, (a, b) => (a.conceded / a.bowlingBalls) - (b.conceded / b.bowlingBalls) || b.wickets - a.wickets);
  const playerOfMatch = ranked((player) => player.runs > 0 || player.wickets > 0,
    (a, b) => (b.runs + b.wickets * 25) - (a.runs + a.wickets * 25) || byRuns(a, b));
  const show = (player, value) => ({ player: player ? names.get(player.playerId) ?? player.playerId : "—", value: player ? value : "No stats yet", playerId: player?.playerId ?? null });
  return [
    { title: "Best Batter", ...show(batter, `${batter?.runs ?? 0} runs`) },
    { title: "Best Bowler", ...show(bowler, `${bowler?.wickets ?? 0} wickets · ${bowler?.conceded ?? 0} runs`) },
    { title: "Best Wicket-Taker", ...show(wicketTaker, `${wicketTaker?.wickets ?? 0} wickets`) },
    { title: "Player of the Match", ...show(playerOfMatch, `${playerOfMatch?.runs ?? 0} runs · ${playerOfMatch?.wickets ?? 0} wickets`) },
    { title: "Highest Strike Rate", ...show(strikeRate, `${((strikeRate?.runs ?? 0) / Math.max(1, strikeRate?.balls ?? 0) * 100).toFixed(1)} SR`) },
    { title: "Best Economy", ...show(economy, `${((economy?.conceded ?? 0) / Math.max(1, (economy?.bowlingBalls ?? 0) / 6)).toFixed(2)} runs/over`) }
  ];
}


// Consolidated from scoring.js

class ScoringError extends Error {
  constructor(message, code = "INVALID_MATCH") {
    super(message);
    this.name = "ScoringError";
    this.code = code;
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const teamInfo = (team) => {
  if (typeof team === "string" && team.trim()) return { id: team.trim(), name: team.trim(), roster: [] };
  if (!team || typeof team !== "object" || !team.id || !team.name) {
    throw new ScoringError("Both teams need an id and name.", "INVALID_TEAM");
  }
  return { id: String(team.id), name: String(team.name), roster: Array.isArray(team.roster) ? team.roster : [] };
};
const ensureMatch = (match) => {
  if (!match || typeof match !== "object" || !Array.isArray(match.innings) || match.innings.length === 0) {
    throw new ScoringError("A valid match with at least one innings is required.", "INVALID_MATCH");
  }
};
const currentInnings = (match) => match.innings[match.activeInnings];
const playerStats = (record, playerId) => {
  const key = String(playerId);
  if (!record[key]) record[key] = { playerId: key, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, conceded: 0, bowlingBalls: 0 };
  return record[key];
};
const ballsToOvers = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

function createMatch({ teamA, teamB, overs, toss, mode, format = "limited-overs", days = 1, maxInnings } = {}) {
  const a = teamInfo(teamA);
  const b = teamInfo(teamB);
  if (a.id === b.id) throw new ScoringError("Choose two different teams.", "DUPLICATE_TEAM");
  if (!["limited-overs", "multi-day"].includes(format)) throw new ScoringError("Choose a supported match format.", "INVALID_FORMAT");
  const limit = format === "multi-day" ? null : Number(overs);
  if (format === "limited-overs" && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    throw new ScoringError("Overs must be a whole number from 1 to 50.", "INVALID_OVERS");
  }
  const matchDays = Number(days);
  if (!Number.isInteger(matchDays) || matchDays < 1 || matchDays > 5) throw new ScoringError("Match days must be a whole number from 1 to 5.", "INVALID_DAYS");
  const inningsLimit = Number(maxInnings ?? (format === "multi-day" ? 4 : 2));
  if (!Number.isInteger(inningsLimit) || inningsLimit < 2 || inningsLimit > (format === "multi-day" ? 4 : 2)) {
    throw new ScoringError("The maximum innings is invalid for this match format.", "INVALID_INNINGS_LIMIT");
  }
  const validModes = ["quick", "live", "retrospective", "multi-innings"];
  if (!validModes.includes(mode)) throw new ScoringError("Choose a supported match mode.", "INVALID_MODE");
  const tossInfo = typeof toss === "object" && toss ? { ...toss } : { winnerId: a.id, decision: "bat" };
  if (!["bat", "bowl"].includes(tossInfo.decision ?? "bat")) throw new ScoringError("Toss decision must be bat or bowl.", "INVALID_TOSS");
  if (tossInfo.winnerId && ![a.id, b.id].includes(String(tossInfo.winnerId))) throw new ScoringError("Toss winner must be one of the selected teams.", "INVALID_TOSS");
  const tossWinner = tossInfo.winnerId === b.id ? b : a;
  const firstBats = tossInfo.decision === "bowl" ? (tossWinner.id === a.id ? b : a) : tossWinner;
  const firstBowl = firstBats.id === a.id ? b : a;
  const makeInnings = (batting, bowling, target = null, targetType = null) => ({
    battingTeamId: batting.id, bowlingTeamId: bowling.id, target, targetType, score: 0, wickets: 0,
    legalBalls: 0, closed: false, endReason: null, strikerId: null, nonStrikerId: null, bowlerId: null,
    batsmen: {}, bowlers: {}, balls: [], history: []
  });
  return {
    id: crypto.randomUUID?.() ?? `match-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    teamA: a, teamB: b, overs: limit, format, days: matchDays, maxInnings: inningsLimit,
    followOnEnforced: false, followOnOffered: false, toss: tossInfo, tossWinner: tossWinner.id,
    tossDecision: tossInfo.decision ?? "bat", mode,
    venue: "", createdAt: new Date().toISOString(), finishedAt: null, completed: false,
    activeInnings: 0, innings: [makeInnings(firstBats, firstBowl)], result: null, retrospectiveStats: {}
  };
}

function wicketsToAllOut(match, innings) {
  const battingTeam = [match.teamA, match.teamB].find((team) => team.id === innings.battingTeamId);
  const playerCount = Array.isArray(battingTeam?.roster) && battingTeam.roster.length
    ? battingTeam.roster.length
    : 11;
  return Math.max(1, playerCount - 1);
}

function closeInningsIfNeeded(match, innings) {
  if (innings.wickets >= wicketsToAllOut(match, innings)) innings.endReason = "all-out";
  else if (innings.targetType === "chase" && innings.target !== null && innings.score >= innings.target) innings.endReason = "target";
  else if (match.format !== "multi-day" && Number.isInteger(match.overs) && innings.legalBalls >= match.overs * 6) innings.endReason = "overs";
  if (innings.endReason) innings.closed = true;
}

function addBall(match, { runs = 0, wicket = false, extra = null, strikerId, nonStrikerId, bowlerId } = {}) {
  ensureMatch(match);
  const innings = currentInnings(match);
  if (!innings || innings.closed || match.completed) throw new ScoringError("This innings is already closed.", "INNINGS_CLOSED");
  if (!Number.isInteger(runs) || runs < 0 || runs > 6) throw new ScoringError("Runs must be a whole number from 0 to 6.", "INVALID_RUNS");
  if (typeof wicket !== "boolean") throw new ScoringError("Wicket must be true or false.", "INVALID_WICKET");
  if (extra !== null && extra !== "wide" && extra !== "no-ball") throw new ScoringError("Extra must be wide, no-ball, or empty.", "INVALID_EXTRA");
  if (extra === "wide" && runs !== 0) throw new ScoringError("Wide deliveries cannot score batter runs in this scorer.", "INVALID_EXTRA_RUNS");
  const batter = strikerId ?? innings.strikerId;
  const bowler = bowlerId ?? innings.bowlerId;
  const partner = nonStrikerId ?? innings.nonStrikerId;
  if (!batter || !bowler) throw new ScoringError("Choose a striker and bowler before recording a ball.", "MISSING_PLAYERS");
  if (String(batter) === String(partner)) throw new ScoringError("Striker and non-striker must be different players.", "DUPLICATE_BATTER");
  if (match.format !== "multi-day" && Number.isInteger(match.overs) && innings.legalBalls >= match.overs * 6) {
    innings.closed = true;
    innings.endReason = "overs";
    throw new ScoringError("The over limit has been reached. The innings has ended.", "OVERS_COMPLETE");
  }

  innings.strikerId = String(batter);
  innings.nonStrikerId = partner ? String(partner) : null;
  innings.bowlerId = String(bowler);
  const legal = extra === null;
  const extraRuns = extra ? 1 : 0;
  const total = runs + extraRuns;
  const strikerStats = playerStats(innings.batsmen, batter);
  const bowlerStats = playerStats(innings.bowlers, bowler);
  const snapshot = {
    score: innings.score, wickets: innings.wickets, legalBalls: innings.legalBalls,
    batsmen: clone(innings.batsmen), bowlers: clone(innings.bowlers), ballsLength: innings.balls.length,
    strikerId: innings.strikerId, nonStrikerId: innings.nonStrikerId, bowlerId: innings.bowlerId
  };
  innings.history.push(snapshot);
  innings.score += total;
  if (legal) innings.legalBalls += 1;
  strikerStats.runs += runs;
  if (legal) strikerStats.balls += 1;
  if (runs === 4) strikerStats.fours += 1;
  if (runs === 6) strikerStats.sixes += 1;
  bowlerStats.conceded += total;
  if (legal) bowlerStats.bowlingBalls += 1;
  if (wicket) {
    innings.wickets += 1;
    bowlerStats.wickets += 1;
  }
  innings.balls.push({ runs, wicket, extra, total, legal, batterId: String(batter), bowlerId: String(bowler), at: new Date().toISOString() });
  if (innings.nonStrikerId && runs % 2 === 1 && !extra) [innings.strikerId, innings.nonStrikerId] = [innings.nonStrikerId, innings.strikerId];
  if (legal && innings.legalBalls % 6 === 0 && innings.nonStrikerId) [innings.strikerId, innings.nonStrikerId] = [innings.nonStrikerId, innings.strikerId];
  closeInningsIfNeeded(match, innings);
  return match;
}

function undoLastBall(match) {
  ensureMatch(match);
  if (match.completed) throw new ScoringError("A completed match cannot be changed.", "MATCH_COMPLETE");
  const innings = currentInnings(match);
  if (!innings?.history?.length) throw new ScoringError("There is no ball to undo.", "NOTHING_TO_UNDO");
  const previous = innings.history.pop();
  innings.score = previous.score;
  innings.wickets = previous.wickets;
  innings.legalBalls = previous.legalBalls;
  innings.batsmen = previous.batsmen;
  innings.bowlers = previous.bowlers;
  innings.balls.length = previous.ballsLength;
  innings.strikerId = previous.strikerId;
  innings.nonStrikerId = previous.nonStrikerId;
  innings.bowlerId = previous.bowlerId;
  innings.closed = false;
  innings.endReason = null;
  return match;
}

function swapStrike(match) {
  ensureMatch(match);
  const innings = currentInnings(match);
  if (innings.closed) throw new ScoringError("Strike cannot be changed after the innings ends.", "INNINGS_CLOSED");
  if (!innings.strikerId || !innings.nonStrikerId) throw new ScoringError("Choose both batters before swapping strike.", "MISSING_PLAYERS");
  [innings.strikerId, innings.nonStrikerId] = [innings.nonStrikerId, innings.strikerId];
  return match;
}

function endInnings(match, reason = "declared") {
  ensureMatch(match);
  const innings = currentInnings(match);
  if (innings.closed) throw new ScoringError("This innings is already closed.", "INNINGS_CLOSED");
  if (!["declared", "all-out", "overs", "target"].includes(reason)) throw new ScoringError("Unknown innings end reason.", "INVALID_END_REASON");
  innings.closed = true;
  innings.endReason = reason;
  return match;
}

function computeTarget(innings1) {
  if (!innings1 || !Number.isInteger(innings1.score) || innings1.score < 0) {
    throw new ScoringError("First-innings score is missing or invalid.", "INVALID_INNINGS");
  }
  return innings1.score + 1;
}

function startSecondInnings(match) {
  return startNextInnings(match);
}

function aggregateScore(match, teamId) {
  return match.innings.reduce((total, innings) => total + (innings.battingTeamId === teamId ? innings.score : 0), 0);
}

function startNextInnings(match) {
  ensureMatch(match);
  const previous = currentInnings(match);
  const inningsIndex = match.innings.length;
  const inningsLimit = match.maxInnings ?? (match.format === "multi-day" ? 4 : 2);
  if (!previous?.closed) throw new ScoringError("Finish the active innings before starting the next one.", "INNINGS_ACTIVE");
  if (previous.endReason === "target") throw new ScoringError("The target has been reached; the match is decided.", "TARGET_REACHED");
  if (inningsIndex >= inningsLimit || match.completed) {
    throw new ScoringError("The match has reached its maximum number of innings.", "INNINGS_LIMIT");
  }
  const battingId = inningsIndex === 2 && match.followOnEnforced
    ? match.innings[1].battingTeamId
    : previous.bowlingTeamId;
  const batting = [match.teamA, match.teamB].find((team) => team.id === battingId);
  const bowling = batting.id === match.teamA.id ? match.teamB : match.teamA;
  const target = Math.max(0, aggregateScore(match, bowling.id) - aggregateScore(match, batting.id) + 1);
  const targetType = inningsIndex === 1 || inningsIndex === 3 ? "chase" : "lead";
  match.innings.push({
    battingTeamId: batting.id, bowlingTeamId: bowling.id, target, targetType, score: 0, wickets: 0,
    legalBalls: 0, closed: false, endReason: null, strikerId: null, nonStrikerId: null, bowlerId: null,
    batsmen: {}, bowlers: {}, balls: [], history: []
  });
  match.activeInnings = inningsIndex;
  return match;
}

function addRetrospectiveStats(match, { playerId, bowlerId = playerId, runs, balls, fours = 0, sixes = 0, wickets = 0, bowlingBalls = 0, conceded = 0, inningsIndex = match?.activeInnings } = {}) {
  ensureMatch(match);
  if (!playerId) throw new ScoringError("Choose a player for the scorecard.", "MISSING_PLAYER");
  const values = { runs, balls, fours, sixes, wickets, bowlingBalls, conceded };
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isInteger(value) || value < 0) throw new ScoringError(`${key} must be a non-negative whole number.`, "INVALID_STATS");
  }
  const innings = match.innings[inningsIndex];
  if (!innings || match.completed) throw new ScoringError("Choose an innings in an unfinished match.", "INNINGS_CLOSED");
  const batting = playerStats(innings.batsmen, playerId);
  const bowling = playerStats(innings.bowlers, bowlerId);
  for (const key of ["runs", "balls", "fours", "sixes"]) batting[key] += values[key];
  for (const key of ["wickets", "conceded", "bowlingBalls"]) bowling[key] += values[key];
  innings.score += runs;
  innings.wickets += wickets;
  innings.legalBalls = Math.max(
    Object.values(innings.batsmen).reduce((sum, player) => sum + player.balls, 0),
    Object.values(innings.bowlers).reduce((sum, player) => sum + player.bowlingBalls, 0)
  );
  closeInningsIfNeeded(match, innings);
  return match;
}

function finalizeMatch(match) {
  ensureMatch(match);
  if (match.completed) throw new ScoringError("This match has already been finalized.", "MATCH_COMPLETE");
  const innings = currentInnings(match);
  if (!innings.closed) innings.closed = true;
  let winner;
  let margin;
  if (match.innings.length < 2) {
    throw new ScoringError("Start and complete the second innings before finalizing.", "SECOND_INNINGS_REQUIRED");
  }
  const totals = new Map([
    [match.teamA.id, aggregateScore(match, match.teamA.id)],
    [match.teamB.id, aggregateScore(match, match.teamB.id)]
  ]);
  const difference = Math.abs(totals.get(match.teamA.id) - totals.get(match.teamB.id));
  const decisiveChase = [...match.innings].reverse().find((item) => item.endReason === "target");
  if (decisiveChase) {
    const winningTeam = [match.teamA, match.teamB].find((team) => team.id === decisiveChase.battingTeamId);
    winner = winningTeam.name;
    margin = `${Math.max(0, wicketsToAllOut(match, decisiveChase) - decisiveChase.wickets)} wickets`;
  } else if (difference === 0) {
    winner = match.innings.length >= (match.maxInnings ?? 2) ? "Tie" : "Draw";
    margin = winner === "Tie" ? "scores level" : "match drawn";
  } else {
    winner = totals.get(match.teamA.id) > totals.get(match.teamB.id) ? match.teamA.name : match.teamB.name;
    margin = `${difference} runs`;
  }
  match.completed = true;
  match.finishedAt = new Date().toISOString();
  match.result = { winner, margin };
  const awards = computeAwards(match);
  return { winner, margin, potm: awards.find((award) => award.title === "Player of the Match")?.player ?? "—", awards };
}




// Consolidated from voting.js
const VOTE_STORAGE_KEY = "tc_votes_v1";

function readVotes() {
  const raw = localStorage.getItem(VOTE_STORAGE_KEY);
  if (!raw) return { captain: {}, codes: [] };
  const value = JSON.parse(raw);
  return { captain: value.captain ?? {}, codes: Array.isArray(value.codes) ? value.codes : [] };
}

function saveVotes(value) {
  localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify(value));
}

function castCaptainVote({ voterId, teamId, candidateId } = {}) {
  if (!voterId || !teamId || !candidateId) throw new TypeError("Voter, team and candidate are required.");
  const votes = readVotes();
  const teamVotes = votes.captain[teamId] ?? [];
  const vote = { id: String(voterId), voterId: String(voterId), teamId: String(teamId), candidateId: String(candidateId), at: new Date().toISOString() };
  votes.captain[teamId] = [...teamVotes.filter((item) => item.voterId !== vote.voterId), vote];
  saveVotes(votes);
  return vote;
}

function tallyCaptainVotes(teamId, votes = readVotes().captain[teamId] ?? []) {
  const counts = {};
  for (const vote of votes) {
    if (vote.teamId === teamId && vote.candidateId) counts[vote.candidateId] = (counts[vote.candidateId] ?? 0) + 1;
  }
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { teamId, counts, winner: winner && winner[1] > total / 2 ? winner[0] : null, votes: total };
}

function castCodeVote({ voterId, teamId = "general", code } = {}) {
  if (!voterId || !teamId || typeof code !== "string" || !code.trim()) throw new TypeError("Voter, team and secret code are required.");
  const votes = readVotes();
  const vote = { id: `${Date.now()}-${String(voterId)}`, voterId: String(voterId), teamId: String(teamId), code: code.trim(), at: new Date().toISOString() };
  votes.codes = [...votes.codes.filter((item) => item.voterId !== vote.voterId || item.teamId !== vote.teamId), vote];
  saveVotes(votes);
  return vote;
}

function tallyCodeVotes(votes = readVotes().codes, secretCode) {
  const records = Array.isArray(votes) ? votes : [];
  const total = records.length;
  const matching = records.filter((vote) => vote.code === secretCode).length;
  return { total, matching, majority: total > 0 && matching > total / 2, counts: records.reduce((counts, vote) => {
    const key = String(vote.code);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}) };
}

function getVotes() {
  return readVotes();
}

function mergeRemoteVotes(records = []) {
  if (!Array.isArray(records)) throw new TypeError("Remote votes must be a list.");
  const votes = readVotes();
  for (const record of records) {
    if (record.kind === "captain" && record.teamId && record.voterId && record.candidateId) {
      const current = votes.captain[record.teamId] ?? [];
      votes.captain[record.teamId] = [
        ...current.filter((vote) => vote.voterId !== record.voterId),
        { ...record, id: String(record.voterId) }
      ];
    } else if (record.kind === "code" && record.teamId && record.voterId && record.code) {
      votes.codes = [
        ...votes.codes.filter((vote) => !(vote.voterId === record.voterId && vote.teamId === record.teamId)),
        record
      ];
    }
  }
  saveVotes(votes);
  return votes;
}


// Consolidated from report.js

const escapeReportHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const overs = (balls) => `${Math.floor((balls ?? 0) / 6)}.${(balls ?? 0) % 6}`;

function buildPrintReport(match) {
  if (!match || !Array.isArray(match.innings)) throw new TypeError("A match scorecard is required to build a report.");
  const teamName = (id) => [match.teamA, match.teamB].find((team) => team.id === id)?.name ?? id ?? "Team";
  const playerName = new Map();
  for (const team of [match.teamA, match.teamB]) {
    for (const player of team?.roster ?? []) {
      const id = String(player.id ?? player.playerId ?? player);
      playerName.set(id, player.name ?? player.displayName ?? id);
    }
  }
  const innings = match.innings.map((inn, index) => {
    const batterRows = Object.values(inn.batsmen ?? {}).map((player) => `<tr><td>${escapeReportHTML(playerName.get(player.playerId) ?? player.playerId)}</td><td>${player.runs}</td><td>${player.balls}</td><td>${player.fours}</td><td>${player.sixes}</td></tr>`).join("");
    const bowlerRows = Object.values(inn.bowlers ?? {}).map((player) => `<tr><td>${escapeReportHTML(playerName.get(player.playerId) ?? player.playerId)}</td><td>${overs(player.bowlingBalls)}</td><td>${player.conceded}</td><td>${player.wickets}</td></tr>`).join("");
    return `<section class="report-innings"><h2>Innings ${index + 1} · ${escapeReportHTML(teamName(inn.battingTeamId))}</h2><p><strong>${inn.score}/${inn.wickets}</strong> in ${overs(inn.legalBalls)} overs${inn.target ? ` · target ${inn.target}` : ""}</p>
      <h3>Batting</h3><table><thead><tr><th>Player</th><th>Runs</th><th>Balls</th><th>4s</th><th>6s</th></tr></thead><tbody>${batterRows || "<tr><td colspan='5'>No batting entries</td></tr>"}</tbody></table>
      <h3>Bowling</h3><table><thead><tr><th>Player</th><th>Overs</th><th>Runs</th><th>Wickets</th></tr></thead><tbody>${bowlerRows || "<tr><td colspan='4'>No bowling entries</td></tr>"}</tbody></table></section>`;
  }).join("");
  const awards = computeAwards(match).map((award) => `<li><strong>${escapeReportHTML(award.title)}:</strong> ${escapeReportHTML(award.player)} — ${escapeReportHTML(award.value)}</li>`).join("");
  return `<article class="print-report"><p>THURSDAY CRICKET · MATCH REPORT</p><h1>${escapeReportHTML(match.teamA.name)} vs ${escapeReportHTML(match.teamB.name)}</h1>
    <p>${escapeReportHTML(match.venue || "Venue not recorded")} · ${new Date(match.createdAt).toLocaleDateString()}</p>
    ${match.result ? `<h2>${escapeReportHTML(match.result.winner)} · ${escapeReportHTML(match.result.margin)}</h2>` : ""}
    ${innings}<section><h2>Match awards</h2><ul>${awards}</ul></section></article>`;
}

function triggerPrint() {
  window.print();
}


// Consolidated from teams.js

const TEAM_KEY = "tc_custom_teams_v1";
const PLAYER_KEY = "tc_players_v1";

function readArray(key, label) {
  const value = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(value)) throw new TypeError(`Saved ${label} data is invalid.`);
  return value;
}

function createCustomTeam({ name, tag, color, roster = [] } = {}) {
  const teamName = String(name ?? "").trim();
  const shortTag = String(tag ?? "").trim().toUpperCase();
  if (teamName.length < 2 || teamName.length > 40) throw new TypeError("Team name must be between 2 and 40 characters.");
  if (!/^[A-Z0-9]{2,5}$/.test(shortTag)) throw new TypeError("Team tag must contain 2–5 letters or numbers.");
  if (!/^#[0-9a-f]{6}$/i.test(String(color))) throw new TypeError("Choose a valid six-digit hex color.");
  if (!Array.isArray(roster)) throw new TypeError("Team roster must be a list of players.");
  const teams = readArray(TEAM_KEY, "team");
  if (teams.some((team) => team.name.toLowerCase() === teamName.toLowerCase() || team.tag === shortTag)) {
    throw new TypeError("A team with that name or tag already exists.");
  }
  const team = { id: `custom-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`, name: teamName, tag: shortTag, color: String(color), roster: roster.map((player) => typeof player === "string" ? { id: player, name: player } : player) };
  teams.push(team);
  localStorage.setItem(TEAM_KEY, JSON.stringify(teams));
  return team;
}

function updatePlayerProfile(playerId, { name, tags = [], role, teamId } = {}) {
  if (!playerId) throw new TypeError("A player id is required.");
  const playerName = String(name ?? "").trim();
  const rawRole = String(role ?? "").trim();
  const selectedRole = rawRole === "All-Rounder" ? "All-rounder" : rawRole;
  if (!playerName || playerName.length > 40) throw new TypeError("Player name must be between 1 and 40 characters.");
  if (!["Batter", "Bowler", "All-rounder", "Wicket-keeper"].includes(selectedRole)) throw new TypeError("Choose a valid player role.");
  const cleanTags = (Array.isArray(tags) ? tags : String(tags).split(",")).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 10);
  const players = readArray(PLAYER_KEY, "player");
  const profile = { id: String(playerId), name: playerName, tags: cleanTags, role: selectedRole, teamId: String(teamId ?? ""), updatedAt: new Date().toISOString() };
  const index = players.findIndex((player) => player.id === profile.id);
  if (index < 0) players.push(profile);
  else players[index] = { ...players[index], ...profile };
  localStorage.setItem(PLAYER_KEY, JSON.stringify(players));
  return profile;
}

function listPlayers(teamId) {
  const customTeams = readArray(TEAM_KEY, "team");
  const players = readArray(PLAYER_KEY, "player");
  const roster = customTeams.find((team) => team.id === teamId)?.roster ?? [];
  const ids = new Set(roster.map((player) => String(player.id ?? player)));
  return players.filter((player) => player.teamId === teamId || ids.has(player.id));
}

function listCustomTeams() {
  return readArray(TEAM_KEY, "team");
}

async function openCustomTeamBuilder() {
  let created;
  const body = `<p>Create a side for your next match. Roster names are optional and comma-separated.</p>
    <label class="modal-field">Team name<input id="modal-team-name" maxlength="40" type="text" required></label>
    <label class="modal-field">Short tag<input id="modal-team-tag" maxlength="5" type="text" required></label>
    <label class="modal-field">Team color<input id="modal-team-color" type="color" value="#70e1c0"></label>
    <label class="modal-field">Roster names<input id="modal-team-roster" type="text" maxlength="400"></label>
    <p id="modal-team-error" class="inline-error" role="status"></p>`;
  const result = await openGlassModal({
    title: "Create custom team",
    body,
    actions: [
      { id: "cancel", label: "Cancel" },
      {
        id: "save", label: "Create team", primary: true,
        onClick: () => {
          try {
            const name = document.getElementById("modal-team-name").value;
            const tag = document.getElementById("modal-team-tag").value;
            const color = document.getElementById("modal-team-color").value;
            const roster = document.getElementById("modal-team-roster").value.split(",").map((player) => player.trim()).filter(Boolean);
            created = createCustomTeam({ name, tag, color, roster });
            return true;
          } catch (error) {
            document.getElementById("modal-team-error").textContent = error.message;
            return false;
          }
        }
      }
    ]
  });
  return result === "save" ? created : null;
}


// Consolidated from ui.js
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function setInlineStatus(element, message = "", kind = "info") {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("inline-error", kind === "error");
  element.setAttribute("role", kind === "error" ? "alert" : "status");
}

function renderRouter(page) {
  const pageIds = {
    dashboard: "dashboard-section",
    "match-setup": "match-setup-section",
    "live-scoring": "scoreboard-section",
    analysis: "analysis-section",
    settings: "settings-section"
  };
  const targetId = pageIds[page] ?? page;
  const sections = [...document.querySelectorAll(".page-section")];
  const target = sections.find((section) => section.id === targetId);
  if (!target) throw new TypeError(`Unknown app page: ${page}`);
  for (const section of sections) section.classList.toggle("hidden", section !== target);
  for (const tab of document.querySelectorAll("#main-nav [data-page]")) {
    const active = tab.dataset.page === target.id;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  }
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}


// Consolidated from firebase.js
// Firebase is loaded dynamically so the app can still start in local-only mode offline.
const FIREBASE_PROJECT_ID = "thursday-cricket";

const services = {
  app: null,
  auth: null,
  db: null,
  modules: null,
  online: navigator.onLine,
  configured: false,
  configurationError: null,
  ready: Promise.resolve(false)
};

function readConfig(configOverride) {
  if (configOverride) return configOverride;
  if (window.__TC_FIREBASE_CONFIG__) return window.__TC_FIREBASE_CONFIG__;
  try {
    return JSON.parse(localStorage.getItem("tc_firebase_config") ?? "null");
  } catch (error) {
    console.warn("The stored Firebase configuration is invalid.", error);
    return null;
  }
}

function updateOnlineStatus() {
  services.online = navigator.onLine;
}

function initFirebase(configOverride, loadModules) {
  const config = readConfig(configOverride);
  if (!config) {
    services.configured = false;
    services.configurationError = null;
    services.ready = Promise.resolve(false);
    return services;
  }
  if (config.projectId !== FIREBASE_PROJECT_ID) {
    const error = new Error(`Firebase must be configured for project "${FIREBASE_PROJECT_ID}".`);
    services.configured = false;
    services.configurationError = error;
    services.ready = Promise.resolve(false);
    return services;
  }
  if (typeof config.apiKey !== "string" || !config.apiKey.trim() || typeof config.appId !== "string" || !config.appId.trim()) {
    const error = new Error("Provide the Firebase web app apiKey and appId for project thursday-cricket.");
    services.configured = false;
    services.configurationError = error;
    services.ready = Promise.resolve(false);
    return services;
  }
  if (typeof loadModules !== "function") {
    const error = new TypeError("A Firebase modular SDK loader is required.");
    services.configured = false;
    services.configurationError = error;
    services.ready = Promise.resolve(false);
    return services;
  }

  services.configured = true;
  services.configurationError = null;
  services.ready = (async () => {
    const modules = await loadModules();
    const existingApp = modules.getApps().find((item) => item.name === "[DEFAULT]");
    services.app = existingApp ?? modules.initializeApp(config);
    services.auth = modules.getAuth(services.app);
    services.db = modules.getFirestore(services.app);
    services.modules = modules;
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    try {
      await modules.enableMultiTabIndexedDbPersistence(services.db);
    } catch (error) {
      if (!["failed-precondition", "unimplemented"].includes(error?.code)) {
        console.warn("Firestore persistence is unavailable; live cloud sync remains enabled.", error);
      }
    }
    return true;
  })().catch((error) => {
    services.configured = false;
    services.configurationError = error;
    throw error;
  });
  return services;
}

function observeFirebaseAuth(onChange, onError) {
  if (!services.auth || typeof onChange !== "function") {
    throw new TypeError("Firebase Authentication and an auth-state callback are required.");
  }
  return services.modules.onAuthStateChanged(services.auth, onChange, onError);
}

async function writeFirestore(path, data) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  const segments = String(path).split("/").filter(Boolean);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new TypeError("Firestore path must identify a document.");
  }
  const reference = services.modules.doc(services.db, ...segments);
  await services.modules.setDoc(reference, { ...data }, { merge: true });
}

async function readFirestoreCollection(name) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  const snapshot = await services.modules.getDocs(services.modules.collection(services.db, String(name)));
  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
}

function subscribeFirestoreCollection(name, onRecords, onError, options = {}) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  if (typeof onRecords !== "function" || typeof onError !== "function") {
    throw new TypeError("Firestore snapshot callbacks are required.");
  }
  const reference = services.modules.collection(services.db, String(name));
  const target = options.orderByCreatedAt
    ? services.modules.query(reference, services.modules.orderBy("createdAt", "desc"))
    : reference;
  return services.modules.onSnapshot(
    target,
    (snapshot) => onRecords(snapshot.docs.map((document) => ({ ...document.data(), id: document.id }))),
    onError
  );
}

async function signInWithFirebase(email, password) {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  const credential = await services.modules.signInWithEmailAndPassword(services.auth, email, password);
  return credential.user;
}

async function registerWithFirebase(email, password) {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  const credential = await services.modules.createUserWithEmailAndPassword(services.auth, email, password);
  return credential.user;
}

async function updateFirebaseProfile(user, profile) {
  if (!services.auth || !user) throw new Error("A signed-in Firebase user is required.");
  await services.modules.updateProfile(user, profile);
}

async function signOutFirebase() {
  if (services.auth?.currentUser) await services.modules.signOut(services.auth);
}
function loadFirebaseModules() {
  return Promise.resolve({
    initializeApp,
    getApps,
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    signOut,
    getFirestore,
    collection,
    doc,
    setDoc,
    onSnapshot,
    query,
    orderBy,
    getDocs,
    enableMultiTabIndexedDbPersistence
  });
}

attachRippleEffect();
const firebase = initFirebase(FIREBASE_CONFIG, loadFirebaseModules);
const store = createStore(createInitialState());
const el = (id) => document.getElementById(id);
let activeFilter = "series";
let currentTeams = [];
let viewingInnings = null;
const LOCAL_USERS_KEY = "tc_users_v1";
const LOCAL_SESSION_KEY = "tc_session";
const SYNC_QUEUE_KEY = "tc_sync_queue_v1";
const FIRESTORE_COLLECTIONS = ["matches", "players", "teams", "users", "customTeams", "teamVotes"];
const cloudListeners = new Map();
let stopAuthObserver = null;
let liveSyncUserId = null;
let retryTimer = 0;
let retryInProgress = false;
let permissionAlertShown = false;

try {
  store.load();
} catch (error) {
  queueMicrotask(() => showError(error, "Saved data could not be loaded"));
}

function validateForm(form) {
  if (!form.checkValidity()) throw new TypeError("Complete the required fields using valid values.");
}

function closeAuthSections() {
  document.querySelectorAll(".collapsible-content").forEach((section) => {
    section.classList.remove("is-open");
    section.inert = true;
    section.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll(".toggle-link").forEach((button) => {
    button.classList.remove("active");
    button.textContent = `▸ ${button.textContent.replace(/^[▸▾]\s*/, "")}`;
  });
}

function toggleAuthSection(targetId, clickedButton) {
  const target = document.getElementById(targetId);
  if (!target) throw new Error(`Unknown authentication section: ${targetId}`);
  const wasOpen = target.classList.contains("is-open");
  closeAuthSections();
  if (!wasOpen) {
    target.classList.add("is-open");
    target.inert = false;
    target.setAttribute("aria-hidden", "false");
    clickedButton.classList.add("active");
    clickedButton.textContent = `▾ ${clickedButton.textContent.replace(/^[▸▾]\s*/, "")}`;
  }
}

function updateSelectedPlayer() {
  const select = el("username-select");
  if (!select) return;
  const selected = select.selectedOptions[0];
  const username = selected?.value;
  const teamKey = selected?.dataset.team;
  if (!username || !teamKey) {
    el("team-badge").hidden = true;
    setInlineStatus(el("login-status"), "");
    return;
  }
  const team = SQUAD_TEAMS[teamKey];
  const email = resolveEmail(username, teamKey);
  el("team-badge").hidden = false;
  el("team-badge").textContent = `${team.name} · ${findSeedPlayer(username)?.role ?? "Player"}`;
  el("team-badge").style.setProperty("--badge-accent", team.accent);
  localStorage.setItem("tc_last_user", username);
  setInlineStatus(el("login-status"), `${email} · team code auto-filled`);
}

function getEffectivePassword(teamKey) {
  const overrides = JSON.parse(localStorage.getItem("tc_team_codes_v1") ?? "{}");
  return overrides[teamKey] ?? resolvePassword(teamKey);
}

function readLocalUsers() {
  const raw = localStorage.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new TypeError("Saved player accounts are invalid.");
  return value;
}

function writeLocalUsers(users) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

async function passwordDigest(password) {
  if (!globalThis.crypto?.subtle) throw new Error("This browser does not support secure local sign-in. Open the app in a modern browser.");
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function showError(error, title = "Something needs attention") {
  console.error(title, error);
  const message = error instanceof Error ? error.message : String(error);
  return openGlassModal({
    title,
    body: `<p>${escapeHTML(message)}</p>`,
    actions: [{ id: "ok", label: "Got it", primary: true }]
  });
}

function errorCode(error) {
  return String(error?.code ?? "").split("/").at(-1);
}

function friendlyAuthError(error) {
  if (["admin-restricted-operation", "operation-not-allowed"].includes(errorCode(error))) {
    return new Error("Enable Email/Password in Firebase Console under Authentication → Sign-in method.");
  }
  return error;
}

function isPermissionDenied(error) {
  return errorCode(error) === "permission-denied";
}

function handleFirestoreError(error, operation) {
  if (isPermissionDenied(error)) {
    if (!permissionAlertShown) {
      permissionAlertShown = true;
      void showError(error, "Firestore access denied");
    }
    return;
  }
  console.warn(`${operation} is unavailable; local data remains available.`, error);
}

function readSyncQueue() {
  const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) ?? "[]");
  if (!Array.isArray(queue)) throw new TypeError("The pending cloud sync queue is invalid.");
  return queue;
}

function writeSyncQueue(queue) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function queueSyncWrite(path, data) {
  const queue = readSyncQueue();
  const existing = queue.find((item) => item.path === path);
  const next = { path, data, attempts: existing?.attempts ?? 0, queuedAt: Date.now() };
  writeSyncQueue([...queue.filter((item) => item.path !== path), next]);
}

function removeQueuedWrite(path) {
  writeSyncQueue(readSyncQueue().filter((item) => item.path !== path));
}

function schedulePendingWriteRetry(delay = 15000) {
  if (retryTimer || !firebase.db || !firebase.auth?.currentUser) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = 0;
    void retryPendingWrites();
  }, delay);
}

async function retryPendingWrites() {
  if (retryInProgress || !firebase.db || !firebase.online || !firebase.auth?.currentUser) return;
  retryInProgress = true;
  try {
    const queue = readSyncQueue();
    for (const item of queue) {
      try {
        await writeFirestore(item.path, item.data);
        removeQueuedWrite(item.path);
      } catch (error) {
        const remaining = readSyncQueue().map((queued) => queued.path === item.path
          ? { ...queued, attempts: (queued.attempts ?? 0) + 1 }
          : queued);
        writeSyncQueue(remaining);
        handleFirestoreError(error, `Retrying ${item.path}`);
        break;
      }
    }
  } catch (error) {
    handleFirestoreError(error, "Cloud sync");
  } finally {
    retryInProgress = false;
    try {
      const pending = readSyncQueue();
      if (pending.length) {
        const attempts = Math.min(...pending.map((item) => item.attempts ?? 0));
        schedulePendingWriteRetry(Math.min(15000 * (2 ** Math.min(attempts, 4)), 240000));
      }
    } catch (error) {
      showError(error, "Could not read pending cloud changes");
    }
  }
}

async function syncRemote(path, data) {
  if (!firebase.db) return false;
  try {
    if (!firebase.auth?.currentUser) await firebase.ready;
    if (!firebase.auth?.currentUser) throw new Error("Sign in before syncing data to Firestore.");
    await writeFirestore(path, data);
    removeQueuedWrite(path);
    return true;
  } catch (error) {
    try {
      store.persist();
      queueSyncWrite(path, data);
      handleFirestoreError(error, `Writing ${path}`);
      if (!isPermissionDenied(error)) schedulePendingWriteRetry();
    } catch (queueError) {
      showError(queueError, "Could not save pending cloud changes");
    }
    return false;
  }
}

function mergeLocalArray(key, records, getId = (record) => record.id) {
  const localRecords = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(localRecords)) throw new TypeError(`Saved ${key} data is invalid.`);
  const merged = new Map(localRecords.map((record) => [String(getId(record)), record]));
  for (const record of records) merged.set(String(getId(record)), record);
  const result = [...merged.values()];
  localStorage.setItem(key, JSON.stringify(result));
  return result;
}

function handleRemoteTeams(records) {
  const remoteTeams = records.map((record) => ({ ...(record.team ?? record), id: record.team?.id ?? record.id }))
    .filter((team) => team.id && team.name);
  if (!remoteTeams.length) return;
  store.update((state) => {
    const teams = new Map(state.teams.map((team) => [team.id, team]));
    for (const team of remoteTeams) teams.set(team.id, { ...teams.get(team.id), ...team });
    return { ...state, teams: [...teams.values()] };
  });
  store.persist();
}

function handleRemoteMatches(records) {
  const remoteMatches = records.map((record) => record.match ?? record).filter((match) => match?.id);
  store.update((state) => {
    const matches = new Map(state.matches.map((match) => [match.id, match]));
    for (const match of remoteMatches) matches.set(match.id, match);
    return { ...state, matches: [...matches.values()] };
  });
  store.persist();
}

function handleRemotePlayers(records) {
  const profiles = records.map((record) => record.profile ?? record)
    .filter((profile) => profile.id && profile.name);
  const byId = new Map();
  for (const profile of [...mergeLocalArray("tc_players_v1", profiles), ...profiles]) byId.set(profile.id, profile);
  const mergedProfiles = [...byId.values()];
  localStorage.setItem("tc_players", JSON.stringify(mergedProfiles));
  store.update((state) => {
    const teams = state.teams.map((team) => {
      const teamProfiles = mergedProfiles.filter((profile) => profile.teamId === team.id);
      if (!teamProfiles.length) return team;
      const roster = new Map((team.roster ?? []).map((player) => [String(player.id ?? player), player]));
      for (const profile of teamProfiles) roster.set(profile.id, { ...roster.get(profile.id), ...profile });
      return { ...team, roster: [...roster.values()] };
    });
    const currentProfile = mergedProfiles.find((profile) => profile.id === state.currentUser?.id);
    return {
      ...state,
      players: mergedProfiles,
      teams,
      currentUser: currentProfile ? { ...state.currentUser, ...currentProfile } : state.currentUser
    };
  });
  store.persist();
}

function handleRemoteCustomTeams(records) {
  const customTeams = records.map((record) => record.team ?? record).filter((team) => team.id && team.name);
  if (!customTeams.length) return;
  mergeLocalArray("tc_custom_teams_v1", customTeams);
  store.update((state) => ({ ...state }));
  store.persist();
}

function handleRemoteVotes(records) {
  const votes = mergeRemoteVotes(records);
  const overrides = JSON.parse(localStorage.getItem("tc_team_codes_v1") ?? "{}");
  let changed = false;
  for (const [teamKey, team] of Object.entries(SQUAD_TEAMS)) {
    const codes = votes.codes.filter((vote) => vote.teamId === team.id);
    if (!codes.length) continue;
    const counts = new Map();
    for (const vote of codes) counts.set(vote.code, (counts.get(vote.code) ?? 0) + 1);
    const winner = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (winner && winner[1] > codes.length / 2 && overrides[teamKey] !== winner[0]) {
      overrides[teamKey] = winner[0];
      changed = true;
    }
  }
  if (changed) localStorage.setItem("tc_team_codes_v1", JSON.stringify(overrides));
  store.update((state) => ({ ...state }));
  store.persist();
}

function handleRemoteUsers(records) {
  mergeLocalArray("tc_cloud_users_v1", records);
  store.update((state) => ({ ...state, users: records }));
  store.persist();
}

const CLOUD_HANDLERS = {
  teams: handleRemoteTeams,
  matches: handleRemoteMatches,
  players: handleRemotePlayers,
  users: handleRemoteUsers,
  customTeams: handleRemoteCustomTeams,
  teamVotes: handleRemoteVotes
};

function stopCloudListeners() {
  for (const unsubscribe of cloudListeners.values()) unsubscribe();
  cloudListeners.clear();
  liveSyncUserId = null;
}

function startLiveFirestoreSync(authUser) {
  if (!firebase.db || !authUser || firebase.auth?.currentUser?.uid !== authUser.uid) return;
  if (liveSyncUserId === authUser.uid && cloudListeners.size) return;
  stopCloudListeners();
  liveSyncUserId = authUser.uid;
  for (const collection of FIRESTORE_COLLECTIONS) {
    const unsubscribe = subscribeFirestoreCollection(
      collection,
      (records) => {
        try {
          CLOUD_HANDLERS[collection](records);
          if (el("sync-status")) el("sync-status").textContent = firebase.online ? "Cloud synced" : "Offline";
          renderAll();
        } catch (error) {
          showError(error, `Could not merge ${collection}`);
        }
      },
      (error) => handleFirestoreError(error, `Listening to ${collection}`),
      { orderByCreatedAt: collection === "matches" }
    );
    cloudListeners.set(collection, unsubscribe);
  }
  void syncLocalCollections(authUser).catch((error) => {
    handleFirestoreError(error, "Cloud sync");
    setInlineStatus(el("app-status"), "Local data is safe. Cloud sync will retry when available.");
  });
}

function makeSeedProfiles() {
  return SEED_PLAYERS.map((player) => {
    const team = SQUAD_TEAMS[player.teamKey];
    return {
      id: player.username.toLowerCase(),
      username: player.username,
      name: player.username,
      email: resolveEmail(player.username, player.teamKey),
      role: player.role,
      tags: [...player.tags],
      teamId: team.id,
      updatedAt: new Date().toISOString()
    };
  });
}

async function syncLocalCollections(authUser) {
  if (!authUser || firebase.auth?.currentUser?.uid !== authUser.uid) return;
  const [remoteTeams, remoteMatches, remotePlayers] = await Promise.all([
    readFirestoreCollection("teams"),
    readFirestoreCollection("matches"),
    readFirestoreCollection("players")
  ]);

  const remoteTeamIds = new Set(remoteTeams.map((record) => record.team?.id ?? record.id));
  for (const team of DEFAULT_TEAMS) {
    if (!remoteTeamIds.has(team.id)) await syncRemote(`teams/${team.id}`, { team, updatedAt: new Date().toISOString() });
  }

  const remoteMatchIds = new Set(remoteMatches.map((record) => record.match?.id ?? record.id));
  for (const match of getMatches()) {
    if (!remoteMatchIds.has(match.id)) {
      await syncRemote(`matches/${match.id}`, {
        match,
        owner: store.getState().currentUser?.id ?? null,
        createdAt: match.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  const rosterProfiles = allKnownTeams().flatMap((team) => (team.roster ?? []).map((player) => {
    const id = String(player.id ?? player.name ?? player);
    return {
      ...player,
      id,
      name: player.name ?? id,
      role: player.role ?? "Player",
      tags: Array.isArray(player.tags) ? player.tags : [],
      teamId: team.id
    };
  }));
  const localProfiles = mergeLocalArray("tc_players_v1", [...rosterProfiles, ...makeSeedProfiles(), ...readCustomPlayers()]);
  const remotePlayerIds = new Set(remotePlayers.map((record) => record.profile?.id ?? record.id));
  for (const profile of localProfiles) {
    if (profile.id && !remotePlayerIds.has(profile.id)) {
      await syncRemote(`players/${profile.id}`, { profile, updatedAt: new Date().toISOString() });
    }
  }
  await syncSessionMetadata();
}

async function syncSessionMetadata() {
  const authUser = firebase.auth?.currentUser;
  if (!authUser) return;
  const profile = store.getState().currentUser;
  await syncRemote(`users/${authUser.uid}`, {
    uid: authUser.uid,
    userId: profile?.id ?? null,
    username: profile?.name ?? null,
    teamId: profile?.teamId ?? null,
    email: profile?.email ?? authUser.email ?? null,
    isAnonymous: Boolean(authUser.isAnonymous),
    lastSeenAt: new Date().toISOString()
  });
}

async function bootstrapCloudSync() {
  try {
    const initialized = await firebase.ready;
    if (!initialized || !firebase.auth) {
      el("sync-status").textContent = "Local";
      const message = firebase.configurationError?.message
        ?? "Sign in to enable cloud sync. Local offline storage is active.";
      setInlineStatus(el("auth-status"), `Local mode · ${message}`);
      if (firebase.configurationError) {
        void openGlassModal({
          title: "Cloud Sync Error",
          body: `<p>Using local offline storage. ${escapeHTML(message)}</p>`,
          actions: [{ id: "ok", label: "Continue offline", primary: true }]
        });
      }
      return;
    }

    stopAuthObserver?.();
    stopAuthObserver = observeFirebaseAuth((user) => {
      if (!user) {
        stopCloudListeners();
        el("sync-status").textContent = "Local";
        setInlineStatus(el("auth-status"), "Sign in to enable cloud sync.");
        return;
      }
      el("sync-status").textContent = firebase.online ? "Connecting…" : "Offline";
      startLiveFirestoreSync(user);
    }, (error) => {
      handleFirestoreError(error, "Firebase authentication");
      el("sync-status").textContent = "Local";
      void showError(error, "Cloud authentication failed");
    });
  } catch (error) {
    handleFirestoreError(error, "Initial cloud sync");
    el("sync-status").textContent = "Local";
    setInlineStatus(el("auth-status"), "Local mode · cloud connection is unavailable.");
    setInlineStatus(el("app-status"), "Cloud sync could not start. Local offline storage is active.");
    if (!isPermissionDenied(error)) {
      void openGlassModal({
        title: "Cloud Sync Error",
        body: `<p>Using local offline storage. ${escapeHTML(error instanceof Error ? error.message : String(error))}</p>`,
        actions: [{ id: "ok", label: "Continue offline", primary: true }]
      });
    }
  }
}

window.addEventListener("online", () => {
  if (!firebase.auth && firebase.configurationError) {
    initFirebase(FIREBASE_CONFIG, loadFirebaseModules);
    void bootstrapCloudSync();
    return;
  }
  void retryPendingWrites();
  if (firebase.auth?.currentUser) {
    void syncLocalCollections(firebase.auth.currentUser).catch((error) => {
      handleFirestoreError(error, "Cloud sync");
    });
  }
});

function runSafely(handler) {
  return (event) => {
    if (event?.type === "submit") event.preventDefault();
    try {
      Promise.resolve(handler(event)).catch((error) => showError(error));
    } catch (error) {
      showError(error);
    }
  };
}

function updateState(updater) {
  store.update(updater);
  store.persist();
}

function getMatches() {
  return store.getState().matches.filter((match) => match && typeof match === "object");
}

function getActiveMatch() {
  const state = store.getState();
  return state.matches.find((match) => match.id === state.activeMatchId) ?? null;
}

function allKnownTeams() {
  const stateTeams = Array.isArray(store.getState().teams) ? store.getState().teams : [];
  const byId = new Map(DEFAULT_TEAMS.map((team) => [team.id, { ...team, roster: team.roster.map((player) => ({ ...player })) }]));
  for (const team of stateTeams) {
    if (team?.id && team?.name) {
      const known = byId.get(team.id);
      const roster = new Map();
      for (const player of [...(known?.roster ?? []), ...(Array.isArray(team.roster) ? team.roster : [])]) {
        const normalized = normalizePlayer(player);
        if (!normalized) continue;
        const duplicateName = [...roster.values()].find((item) => item.name.toLowerCase() === normalized.name.toLowerCase());
        if (duplicateName) roster.delete(duplicateName.id);
        roster.set(normalized.id, normalized);
      }
      byId.set(team.id, { ...known, ...team, roster: [...roster.values()] });
    }
  }
  for (const team of listCustomTeams()) {
    const prior = byId.get(team.id);
    const roster = new Map();
    for (const player of [...(prior?.roster ?? []), ...(team.roster ?? [])]) {
      const normalized = normalizePlayer(player);
      if (!normalized) continue;
      const duplicateName = [...roster.values()].find((item) => item.name.toLowerCase() === normalized.name.toLowerCase());
      if (duplicateName) roster.delete(duplicateName.id);
      roster.set(normalized.id, normalized);
    }
    byId.set(team.id, { ...prior, ...team, roster: [...roster.values()] });
  }
  return [...byId.values()];
}

function teamById(id) {
  return currentTeams.find((team) => team.id === id) ?? null;
}

function normalizePlayer(player) {
  if (typeof player === "string") return { id: player, name: player, role: "Player" };
  const id = String(player?.id ?? player?.playerId ?? "");
  return id ? { ...player, id, name: player.name ?? player.displayName ?? id } : null;
}

function playersFor(teamId) {
  const team = teamById(teamId);
  if (!team) return [];
  const players = new Map();
  for (const player of team.roster ?? []) {
    const normalized = normalizePlayer(player);
    if (normalized) players.set(normalized.id, normalized);
  }
  for (const player of listCustomTeams().flatMap((custom) => custom.id === teamId ? custom.roster : [])) {
    const normalized = normalizePlayer(player);
    if (normalized) players.set(normalized.id, normalized);
  }
  return [...players.values()];
}

function fillSelect(select, options, { blankLabel, preferred } = {}) {
  if (!select) return "";
  const previous = preferred ?? select.value;
  select.replaceChildren();
  if (blankLabel !== undefined) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = blankLabel;
    select.append(blank);
  }
  for (const option of options) {
    const item = document.createElement("option");
    item.value = String(option.value);
    item.textContent = option.label;
    select.append(item);
  }
  if (options.some((option) => String(option.value) === String(previous))) select.value = String(previous);
  else if (options.length && blankLabel === undefined) select.value = String(options[0].value);
  return select.value;
}

function teamOptions(teams = currentTeams) {
  return teams.map((team) => ({ value: team.id, label: team.name }));
}

function addPlayerToTeam(profile) {
  const teams = allKnownTeams().map((team) => {
    const roster = (team.roster ?? []).filter((player) =>
      String(player.id ?? player) !== profile.id &&
      String(player.name ?? player).toLowerCase() !== profile.name.toLowerCase()
    );
    if (team.id !== profile.teamId) return { ...team, roster };
    return { ...team, roster: [...roster, { id: profile.id, name: profile.name, role: profile.role, tags: profile.tags ?? [] }] };
  });
  updateState((state) => ({ ...state, teams }));
}

function renderTeamOptions() {
  currentTeams = allKnownTeams();
  const standard = currentTeams.filter((team) => !team.id.startsWith("custom-"));
  const custom = currentTeams.filter((team) => team.id.startsWith("custom-"));
  fillSelect(el("reg-team"), teamOptions(standard));
  fillSelect(el("profile-team"), teamOptions(currentTeams), { preferred: store.getState().currentUser?.teamId });

  const selectedType = document.querySelector('input[name="team-type"]:checked')?.value ?? "standard";
  const setupTeams = selectedType === "custom" && custom.length
    ? [...custom, ...standard]
    : standard;
  const setupOptions = teamOptions(setupTeams);
  fillSelect(el("setup-team-a"), setupOptions);
  fillSelect(el("setup-team-b"), setupOptions, { preferred: setupOptions.find((option) => option.value !== el("setup-team-a").value)?.value });
  updateTossOptions();
  fillSelect(el("vote-team"), teamOptions(currentTeams), { preferred: store.getState().currentUser?.teamId });
  renderLoginPlayers();
  renderVoteCandidates();
  renderCustomTeamList();
}

function updateTossOptions() {
  const teams = [teamById(el("setup-team-a").value), teamById(el("setup-team-b").value)].filter(Boolean);
  const options = teamOptions(teams);
  fillSelect(el("toss-winner"), options, { preferred: el("toss-winner").value || el("setup-team-a").value });
}

function updateSetupFormat() {
  const multiDay = el("match-format").value === "multi-day";
  el("overs-field").classList.toggle("hidden", multiDay);
  el("custom-overs-wrap").classList.toggle("hidden", multiDay || el("setup-overs").value !== "custom");
  el("match-days-field").classList.toggle("hidden", !multiDay);
  el("max-innings-field").classList.toggle("hidden", !multiDay);
}

function readCustomPlayers() {
  const players = JSON.parse(localStorage.getItem("tc_players") ?? "[]");
  if (!Array.isArray(players)) throw new TypeError("Saved player profiles are invalid.");
  return players;
}

function renderLoginPlayers() {
  const select = el("username-select");
  if (!select) return;
  const selected = select.value;
  for (const group of select.querySelectorAll("optgroup")) {
    const teamKey = group.querySelector("option")?.dataset.team;
    const team = SQUAD_TEAMS[teamKey];
    if (!team) continue;
    const existing = new Set([...group.querySelectorAll("option")].map((option) => option.value));
    for (const player of readCustomPlayers().filter((item) => item.teamId === team.id)) {
      if (existing.has(player.name)) continue;
      const option = document.createElement("option");
      option.value = player.name;
      option.dataset.team = teamKey;
      option.textContent = player.name;
      group.append(option);
    }
  }
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderVoteCandidates() {
  const teamId = el("vote-team")?.value;
  const candidates = playersFor(teamId).map((player) => ({ value: player.id, label: player.name }));
  fillSelect(el("vote-candidate"), candidates, { preferred: store.getState().currentUser?.id });
}

function renderCustomTeamList() {
  const teams = listCustomTeams();
  for (const container of [el("custom-team-list"), el("settings-team-list")]) {
    if (!container) continue;
    container.replaceChildren();
    if (!teams.length) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "No custom teams yet.";
      container.append(message);
      continue;
    }
    for (const team of teams) {
      const row = document.createElement("p");
      row.className = "team-chip";
      row.textContent = `${team.tag} · ${team.name} · ${(team.roster ?? []).length} players`;
      container.append(row);
    }
  }
}

function renderDashboard() {
  const user = store.getState().currentUser;
  el("dash-name").textContent = user?.name ?? "Player";
  const matches = getMatches().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const team = teamById(user?.teamId);
  const squad = team?.roster ?? [];
  el("dash-team-card").innerHTML = `<p class="eyebrow">YOUR TEAM</p><h3>${escapeHTML(team?.name ?? "Thursday Cricket")}</h3>
    <p class="muted">${escapeHTML(team?.tag ?? "SQUAD")} · ${squad.length} players</p>
    <div class="team-chips">${squad.map((player) => `<span class="team-chip">${escapeHTML(player.name ?? player.id ?? player)}</span>`).join("")}</div>`;
  const active = getActiveMatch();
  if (active) {
    const inning = activeInnings(active);
    el("dash-live").innerHTML = `<p class="eyebrow">LIVE MATCH</p><h3>${escapeHTML(active.teamA.name)} vs ${escapeHTML(active.teamB.name)}</h3>
      <div class="classic-live-score">${inning?.score ?? 0}/${inning?.wickets ?? 0}</div><p class="muted">Overs ${ballsToOvers(inning?.legalBalls ?? 0)} · ${escapeHTML(active.venue || "Venue not recorded")}</p>`;
  } else {
    el("dash-live").innerHTML = `<p class="eyebrow">MATCH CENTER</p><h3>No active match</h3><p class="muted">Create a match to start scoring.</p>`;
  }
  const recent = matches.slice(0, 5);
  el("dash-recent").innerHTML = `<div class="classic-card-heading"><div><p class="eyebrow">SQUAD HISTORY</p><h3>Recent Matches</h3></div><span class="muted">${matches.length} ${matches.length === 1 ? "match" : "matches"}</span></div>
    ${recent.length ? `<div class="classic-match-list">${recent.map((match) => {
      const score = match.innings?.map((inning) => `${inning.score}/${inning.wickets}`).join(" · ") || "No score yet";
      return `<article class="match-item glass"><div><strong>${escapeHTML(match.teamA?.name)} vs ${escapeHTML(match.teamB?.name)}</strong><small>${escapeHTML(new Date(match.createdAt).toLocaleDateString())} · ${escapeHTML(match.result?.winner ?? "In progress")}</small></div>
        <span class="match-score">${escapeHTML(score)}</span><button class="btn btn-ghost" type="button" data-open-match="${escapeHTML(match.id)}">Open</button></article>`;
    }).join("")}</div>` : `<p class="empty-state">No matches yet. Set up a game to get started.</p>`}`;
}

function activeInnings(match) {
  return match?.innings?.[match.activeInnings] ?? null;
}

function renderLive() {
  const match = getActiveMatch();
  const board = el("scoreboard");
  const controls = el("scoring-controls");
  const postMatch = el("post-match");
  const runButtons = [...document.querySelectorAll(".run-btn")];
  if (!match) {
    board.className = "scoreboard classic-scoreboard empty-state";
    board.innerHTML = "<h3>No active match</h3><p>Start a match from Match Setup to open the score pad.</p>";
    controls.classList.add("hidden");
    postMatch.classList.add("hidden");
    el("innings-tabs").replaceChildren();
    el("player-rows").innerHTML = `<p class="muted">Player batting lines appear here after the first delivery.</p>`;
    el("bowler-rows").innerHTML = `<p class="muted">Bowling figures appear here after the first delivery.</p>`;
    el("over-dots").replaceChildren();
    el("target-banner").classList.add("hidden");
    el("multi-innings").classList.add("hidden");
    el("live-end-innings").disabled = true;
    el("start-second-innings").disabled = true;
    runButtons.forEach((button) => { button.disabled = true; });
    el("swap-strike").disabled = true;
    return;
  }
  controls.classList.remove("hidden");
  if (!Number.isInteger(viewingInnings) || viewingInnings >= match.innings.length) viewingInnings = match.activeInnings;
  const innings = match.innings[viewingInnings] ?? activeInnings(match);
  if (!innings) return;
  const batting = teamById(innings.battingTeamId)?.name ?? "Batting team";
  const bowling = teamById(innings.bowlingTeamId)?.name ?? "Bowling team";
  board.className = "scoreboard classic-scoreboard";
  board.innerHTML = `<div><p class="eyebrow">${escapeHTML(match.venue || "THURSDAY CRICKET")} · INNINGS ${viewingInnings + 1}</p>
      <h2>${escapeHTML(batting)} <span class="muted">vs</span> ${escapeHTML(bowling)}</h2></div>
    <div class="classic-total">${innings.score}<span>/${innings.wickets}</span></div>
    <div class="classic-score-meta"><span>${match.format === "multi-day" ? "Overs" : "Overs"} <strong>${ballsToOvers(innings.legalBalls)} / ${match.format === "multi-day" ? "Unlimited" : match.overs}</strong></span>
      <span>Run rate <strong>${innings.legalBalls ? (innings.score / (innings.legalBalls / 6)).toFixed(2) : "0.00"}</strong></span>
      <span>${match.result ? escapeHTML(match.result.winner) : match.completed ? "Match complete" : innings.closed ? "Innings complete" : "In progress"}</span></div>`;

  const tabs = el("innings-tabs");
  tabs.replaceChildren(...match.innings.map((item, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `innings-tab${index === viewingInnings ? " is-active" : ""}`;
    tab.dataset.viewInnings = String(index);
    tab.textContent = `Innings ${index + 1} · ${teamById(item.battingTeamId)?.name ?? "Team"} · ${item.score}/${item.wickets}`;
    return tab;
  }));
  const targetBanner = el("target-banner");
  if (innings.targetType === "lead") {
    targetBanner.textContent = innings.target > 0
      ? `${batting} need ${innings.target} to take the lead`
      : `${batting} are already ahead on aggregate`;
    targetBanner.classList.remove("hidden");
  } else if (innings.target !== null && innings.target !== undefined) {
    targetBanner.textContent = innings.score >= innings.target ? `${batting} reached the target` : `${batting} need ${innings.target - innings.score} to win`;
    targetBanner.classList.remove("hidden");
  } else {
    targetBanner.textContent = `${batting} · first innings`;
    targetBanner.classList.remove("hidden");
  }

  const batters = playersFor(innings.battingTeamId).map((player) => ({ value: player.id, label: player.name }));
  const bowlers = playersFor(innings.bowlingTeamId).map((player) => ({ value: player.id, label: player.name }));
  fillSelect(el("striker-select"), batters, { blankLabel: "Choose striker", preferred: innings.strikerId });
  fillSelect(el("non-striker-select"), batters, { blankLabel: "Choose non-striker", preferred: innings.nonStrikerId });
  fillSelect(el("bowler-select"), bowlers, { blankLabel: "Choose bowler", preferred: innings.bowlerId });
  const allPlayers = currentTeams.flatMap((team) => playersFor(team.id).map((player) => ({ ...player, teamName: team.name })));
  fillSelect(el("post-player"), allPlayers.map((player) => ({ value: player.id, label: `${player.name} · ${player.teamName}` })), { blankLabel: "Choose player" });
  fillSelect(el("post-bowler-player"), allPlayers.map((player) => ({ value: player.id, label: `${player.name} · ${player.teamName}` })), { blankLabel: "Choose bowler" });

  const dismissed = new Set(innings.balls.filter((ball) => ball.wicket).map((ball) => ball.batterId));
  const playerRows = playersFor(innings.battingTeamId);
  el("player-rows").innerHTML = playerRows.length ? playerRows.map((player) => {
    const stats = innings.batsmen[player.id] ?? { runs: 0, balls: 0, fours: 0, sixes: 0 };
    const striker = innings.strikerId === player.id;
    const nonStriker = innings.nonStrikerId === player.id;
    return `<article class="prow${striker ? " is-striker" : ""}${dismissed.has(player.id) ? " is-out" : ""}">
      <div class="prow-name"><strong>${escapeHTML(player.name)}</strong><small>${striker ? "On strike" : nonStriker ? "At the non-striker's end" : dismissed.has(player.id) ? "Out" : escapeHTML(player.role ?? "")}</small></div>
      <div class="prow-score"><strong>${stats.runs}</strong><small>${stats.balls} balls · ${stats.fours}×4 · ${stats.sixes}×6</small></div>
      <div class="prow-actions"><button class="team-chip" type="button" data-set-striker="${escapeHTML(player.id)}" ${innings.closed || match.completed ? "disabled" : ""}>Strike</button>
      <button class="team-chip" type="button" data-set-non-striker="${escapeHTML(player.id)}" ${innings.closed || match.completed ? "disabled" : ""}>Partner</button></div></article>`;
  }).join("") : `<p class="muted">No players are assigned to ${escapeHTML(batting)}.</p>`;
  const bowlRows = playersFor(innings.bowlingTeamId);
  el("bowler-rows").innerHTML = bowlRows.length ? bowlRows.map((player) => {
    const stats = innings.bowlers[player.id] ?? { conceded: 0, bowlingBalls: 0, wickets: 0 };
    return `<article class="prow${innings.bowlerId === player.id ? " is-striker" : ""}">
      <div class="prow-name"><strong>${escapeHTML(player.name)}</strong><small>${innings.bowlerId === player.id ? "Current bowler" : escapeHTML(player.role ?? "")}</small></div>
      <div class="prow-score"><strong>${stats.wickets}/${stats.conceded}</strong><small>${ballsToOvers(stats.bowlingBalls)} overs · ${stats.bowlingBalls ? (stats.conceded / (stats.bowlingBalls / 6)).toFixed(1) : "0.0"} econ</small></div>
      <button class="team-chip" type="button" data-set-bowler="${escapeHTML(player.id)}" ${innings.closed || match.completed ? "disabled" : ""}>Bowl</button></article>`;
  }).join("") : `<p class="muted">No bowlers are assigned to ${escapeHTML(bowling)}.</p>`;

  const recentBalls = innings.balls.slice(-6);
  el("over-dots").innerHTML = recentBalls.length ? recentBalls.map((ball) => {
    const label = ball.wicket ? "W" : ball.extra === "wide" ? "WD" : ball.extra === "no-ball" ? "NB" : String(ball.total);
    return `<span class="over-dot${ball.wicket ? " wicket" : ""}${ball.total >= 4 ? " boundary" : ""}" aria-label="${escapeHTML(label)}">${escapeHTML(label)}</span>`;
  }).join("") : `<span class="muted">No balls yet</span>`;

  const active = innings === activeInnings(match);
  const closed = innings.closed || match.completed || !active;
  el("live-end-innings").disabled = closed;
  runButtons.forEach((button) => { button.disabled = closed; });
  el("undo-ball").disabled = match.completed || !active || !innings.history?.length;
  el("swap-strike").disabled = closed || !innings.strikerId || !innings.nonStrikerId;
  const canStartNext = match.innings.length < (match.maxInnings ?? (match.format === "multi-day" ? 4 : 2)) &&
    active && innings.closed && innings.endReason !== "target" && !match.completed;
  el("start-second-innings").disabled = !canStartNext;
  el("start-second-innings").textContent = match.innings.length < (match.maxInnings ?? (match.format === "multi-day" ? 4 : 2))
    ? `Start innings ${match.innings.length + 1}`
    : "Maximum innings reached";
  el("target-display").textContent = innings.targetType === "lead"
    ? `Runs to take the lead: ${innings.target ?? "—"}`
    : innings.target !== null
      ? `Target ${innings.target} · ${innings.score}/${innings.wickets}`
      : innings.closed ? `Target ${computeTarget(innings)}` : "First innings";
  el("innings-status").textContent = innings.closed
    ? `Innings ${viewingInnings + 1} closed${innings.endReason === "all-out" ? " · all out" : innings.endReason === "overs" ? " · overs complete" : innings.endReason === "target" ? " · target reached" : " · declared"}.`
    : "Select your players, then record each delivery.";
  el("multi-innings").classList.toggle("hidden", match.innings.length < 2 && match.mode !== "multi-innings");
  el("multi-innings-summary").textContent = match.innings.length > 1
    ? `${teamById(activeInnings(match).battingTeamId)?.name ?? "Batting side"} need ${Math.max(0, (activeInnings(match).target ?? 0) - activeInnings(match).score)}${match.format === "multi-day" ? " runs" : ` from ${Math.max(0, match.overs * 6 - activeInnings(match).legalBalls)} balls`}.`
    : "End innings one to calculate the next innings target.";
  postMatch.classList.toggle("hidden", match.mode !== "retrospective" && !innings.closed && !match.completed);
  for (const control of [el("striker-select"), el("non-striker-select"), el("bowler-select")]) control.disabled = closed;
  el("post-player").disabled = match.completed;
  el("post-bowler-player").disabled = match.completed;
  for (const id of ["post-runs", "post-balls", "post-fours", "post-sixes", "post-wickets", "post-bowling-overs", "post-conceded"]) el(id).disabled = match.completed;
  el("finalize-match").disabled = match.completed;
}

function chartDataset() {
  const matches = getMatches();
  if (activeFilter === "week") return buildThisWeekMatch(matches);
  if (activeFilter === "last") return buildLastMatch(matches);
  if (activeFilter.startsWith("match:")) return buildPerMatch(activeFilter.slice(6), matches);
  return buildSeriesTotals(matches);
}

function drawBarChart(canvas, values, labelKey, valueKey) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(240, rect.width);
  const height = 240;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = `${height}px`;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const rows = values.filter((row) => row[valueKey] > 0).sort((a, b) => b[valueKey] - a[valueKey]).slice(0, 6);
  if (!rows.length) {
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--tc-muted");
    context.font = "14px system-ui";
    context.fillText("No scoring data yet", 12, 32);
    return;
  }
  const color = getComputedStyle(document.documentElement).getPropertyValue("--tc-accent").trim() || "#70e1c0";
  const max = Math.max(...rows.map((row) => row[valueKey]));
  const left = 10;
  const labelWidth = Math.min(115, width * .38);
  const barSpace = width - labelWidth - 35;
  const rowHeight = Math.min(35, (height - 12) / rows.length);
  context.font = "12px system-ui";
  rows.forEach((row, index) => {
    const y = 12 + index * rowHeight;
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--tc-text");
    const label = String(row[labelKey]).slice(0, 16);
    context.fillText(label, left, y + 15, labelWidth - 8);
    context.fillStyle = "rgba(255,255,255,.09)";
    context.fillRect(left + labelWidth, y + 3, barSpace, 15);
    context.fillStyle = color;
    const barWidth = Math.max(2, (row[valueKey] / max) * barSpace);
    context.fillRect(left + labelWidth, y + 3, barWidth, 15);
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--tc-muted");
    context.fillText(String(row[valueKey]), Math.min(width - 28, left + labelWidth + barWidth + 5), y + 15);
  });
}

function renderAnalysis() {
  const matches = getMatches().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const select = el("chart-select");
  const before = select.value || activeFilter;
  for (const option of [...select.options]) if (option.value.startsWith("match:")) option.remove();
  const individualOptions = el("individual-match-options");
  for (const match of matches) {
    const option = document.createElement("option");
    option.value = `match:${match.id}`;
    option.textContent = `${match.teamA?.name ?? "Team A"} vs ${match.teamB?.name ?? "Team B"}`;
    individualOptions.append(option);
  }
  activeFilter = [...select.options].some((option) => option.value === before) ? before : "series";
  select.value = activeFilter;
  const data = chartDataset();
  const teams = data.teams.map((team) => ({ name: team.name, runs: team.runs }));
  const names = new Map();
  for (const match of data.matches ?? []) {
    for (const team of [match.teamA, match.teamB]) {
      for (const player of team?.roster ?? []) {
        const id = String(player.id ?? player.playerId ?? player);
        names.set(id, player.name ?? player.displayName ?? id);
      }
    }
  }
  const players = data.players.map((player) => ({ name: names.get(player.playerId) ?? player.playerId, runs: player.runs }));
  drawBarChart(el("team-chart"), teams, "name", "runs");
  drawBarChart(el("player-chart"), players, "name", "runs");
  const awards = computeAwards(data);
  const grid = el("awards-grid");
  grid.replaceChildren();
  for (const award of awards) {
    const card = document.createElement("article");
    card.className = "award-card";
    const title = document.createElement("strong");
    title.textContent = award.title;
    const player = document.createElement("span");
    player.textContent = `${award.player} · ${award.value}`;
    card.append(title, player);
    grid.append(card);
  }
  const history = el("analysis-matches");
  history.replaceChildren();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Completed and active matches will appear here.";
    history.append(empty);
  } else {
    for (const match of matches) {
      const item = document.createElement("article");
      item.className = "match-row";
      const name = document.createElement("strong");
      name.textContent = `${match.teamA?.name ?? "Team A"} vs ${match.teamB?.name ?? "Team B"}`;
      const outcome = document.createElement("small");
      outcome.textContent = match.result ? `${match.result.winner} · ${match.result.margin}` : "In progress";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "button secondary";
      open.dataset.openMatch = match.id;
      open.textContent = "View scorecard";
      item.append(name, outcome, open);
      history.append(item);
    }
  }
}

function renderSettings() {
  const user = store.getState().currentUser;
  if (!user) return;
  if (document.activeElement !== el("profile-name")) el("profile-name").value = user.name ?? "";
  if (document.activeElement !== el("profile-role")) el("profile-role").value = user.role === "All-Rounder" ? "All-rounder" : (user.role ?? "Batter");
  if (document.activeElement !== el("profile-tags")) el("profile-tags").value = (user.tags ?? []).join(", ");
  if (user.teamId && teamById(user.teamId)) el("profile-team").value = user.teamId;
  renderVoteCandidates();
  for (const card of document.querySelectorAll(".theme-card")) {
    card.classList.toggle("is-active", card.dataset.theme === document.documentElement.classList.item(0));
  }
}

function renderAll() {
  const state = store.getState();
  const signedIn = Boolean(state.currentUser);
  el("auth-screen").classList.toggle("hidden", signedIn);
  el("main-app").classList.toggle("hidden", !signedIn);
  renderTeamOptions();
  if (!signedIn) return;
  el("whoami").textContent = state.currentUser.name;
  renderDashboard();
  renderLive();
  renderAnalysis();
  renderSettings();
  renderRouter(state.currentPage || "dashboard");
  const theme = localStorage.getItem("tc_theme") || "theme-default-glass-dark";
  document.documentElement.classList.remove("theme-default-glass-dark", "theme-neon-cyberpunk", "theme-emerald-pitch", "theme-midnight-apex");
  document.documentElement.classList.add(theme);
  el("theme-select").value = theme;
  for (const card of document.querySelectorAll(".theme-card")) card.classList.toggle("is-active", card.dataset.theme === theme);
  updateSetupFormat();
}

function persistCurrentMatch(match) {
  updateState((state) => ({
    ...state,
    matches: state.matches.some((item) => item.id === match.id)
      ? state.matches.map((item) => item.id === match.id ? match : item)
      : [...state.matches, match]
  }));
  const owner = store.getState().currentUser?.id;
  if (owner) void syncRemote(`matches/${match.id}`, {
    match, owner, createdAt: match.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString()
  });
}

function persistPlayer(profile) {
  updateState((state) => ({
    ...state,
    players: [...(state.players ?? []).filter((player) => player.id !== profile.id), profile]
  }));
  void syncRemote(`players/${profile.id}`, { profile, owner: store.getState().currentUser?.id ?? null });
}

async function persistVote(teamId, vote, isCodeVote = false) {
  const voterId = String(store.getState().currentUser?.id ?? vote.voterId);
  if (isCodeVote) {
    const documentId = `code-${teamId}-${voterId}`;
    await syncRemote(`teamVotes/${documentId}`, { ...vote, id: documentId, kind: "code", teamId, voterId });
  } else {
    const documentId = `captain-${teamId}-${voterId}`;
    await syncRemote(`teamVotes/${documentId}`, { ...vote, id: documentId, kind: "captain", teamId, voterId });
  }
}

async function registerPlayer(event) {
  event?.preventDefault?.();
  const name = el("reg-name").value.trim();
  const team = teamById(el("reg-team").value);
  const role = el("reg-role").value === "All-Rounder" ? "All-rounder" : el("reg-role").value;
  if (!name || !team) throw new TypeError("Enter your name and choose a team.");
  const teamKey = Object.keys(SQUAD_TEAMS).find((key) => SQUAD_TEAMS[key].id === team.id);
  if (!teamKey) throw new TypeError("New profiles must join one of the standard teams.");
  const localPart = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  if (!localPart) throw new TypeError("Enter a name containing letters or numbers.");
  const email = `${localPart}@${team.domain}`;
  const password = getEffectivePassword(teamKey);

  let firebaseUser = null;
  let firebaseError = null;
  try { await firebase.ready; } catch (error) { firebaseError = error; }
  if (firebase.auth) {
    try {
      firebaseUser = await registerWithFirebase(email, password);
    } catch (error) {
      firebaseError = error;
    }
  }
  if (firebaseUser) {
    try {
      await updateFirebaseProfile(firebaseUser, { displayName: name });
      firebaseError = null;
    } catch (error) {
      firebaseError = error;
    }
  }
  const users = readLocalUsers();
  const existing = users.find((item) => item.email === email);
  if (existing) throw new Error("A player already uses that name. Sign in with the existing profile.");
  const id = firebaseUser?.uid ?? `player-${crypto.randomUUID?.() ?? Date.now().toString(36)}`;
  const profile = { id, name, email, role, teamId: team.id, tags: [] };
  users.push({ email, profile });
  writeLocalUsers(users);
  const localPlayers = readCustomPlayers();
  localPlayers.push(profile);
  localStorage.setItem("tc_players", JSON.stringify(localPlayers));
  updateState((state) => ({ ...state, currentUser: profile, currentPage: "dashboard" }));
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ username: name, teamId: team.id, email, ts: Date.now() }));
  updatePlayerProfile(profile.id, profile);
  addPlayerToTeam(profile);
  setInlineStatus(el("app-status"), firebaseUser ? "Player registered and signed in." : "Player registered. This device is using local storage.");
  closeAuthSections();
  persistPlayer(profile);
  await syncSessionMetadata();
  if (firebaseError && !firebaseUser) setInlineStatus(el("app-status"), "Firebase was unavailable; the player profile is saved on this device.");
  renderLoginPlayers();
  el("username-select").value = name;
  updateSelectedPlayer();
}

async function loginPlayer(username) {
  const select = el("username-select");
  const option = [...select.options].find((item) => item.value === username) ?? select.selectedOptions[0];
  username = option?.value;
  const teamKey = option?.dataset.team;
  if (!username || !teamKey) throw new TypeError("Select your player name before signing in.");
  const email = resolveEmail(username, teamKey);
  const password = getEffectivePassword(teamKey);
  let firebaseUser = null;
  let firebaseError = null;
  let createdAccount = false;
  try { await firebase.ready; } catch (error) { firebaseError = error; }
  if (firebase.auth) {
    try {
      firebaseUser = await signInWithFirebase(email, password);
    } catch (error) {
      if (!["user-not-found", "invalid-credential"].includes(errorCode(error))) throw friendlyAuthError(error);
      try {
        firebaseUser = await registerWithFirebase(email, password);
        createdAccount = true;
      } catch (registerError) {
        throw friendlyAuthError(registerError);
      }
    }
    try {
      await updateFirebaseProfile(firebaseUser, { displayName: username });
      firebaseError = null;
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }
  const users = readLocalUsers();
  const seed = findSeedPlayer(username);
  const team = SQUAD_TEAMS[teamKey];
  let account = users.find((item) => item.email === email);
  if (!account) {
    account = {
      email,
      profile: {
        id: firebaseUser?.uid ?? `seed-${username.toLowerCase()}`,
        name: username,
        email,
        role: seed?.role ?? "All-rounder",
        teamId: team.id,
        tags: seed?.tags ?? []
      }
    };
    users.push(account);
    writeLocalUsers(users);
  }
  const profile = { ...account.profile, id: firebaseUser?.uid ?? account.profile.id, name: username, email, teamId: team.id };
  updateState((state) => ({ ...state, currentUser: profile, currentPage: "dashboard" }));
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ username, teamId: team.id, email, ts: Date.now() }));
  closeAuthSections();
  if (profile.name) addPlayerToTeam(profile);
  setInlineStatus(el("login-status"), firebaseUser
    ? `${createdAccount ? "Account created. " : ""}Signed in. Cloud sync is available.`
    : "Signed in locally. Changes stay on this device.");
  if (firebaseUser) {
    persistPlayer(profile);
    await syncSessionMetadata();
  }
  if (firebaseError) {
    await openGlassModal({
      title: "Offline sign-in",
      body: `<p>Firebase sign-in was unavailable, so ${escapeHTML(username)} was signed in locally on this device.</p>`,
      actions: [{ id: "continue", label: "Continue", primary: true }]
    });
  }
}

async function advancedLogin() {
  const email = el("adv-email").value.trim().toLowerCase();
  const password = el("adv-password").value;
  if (!email || !password) throw new TypeError("Enter an advanced email and password.");
  let firebaseUser = null;
  let firebaseError = null;
  try { await firebase.ready; } catch (error) { firebaseError = error; }
  if (firebase.auth) {
    try {
      firebaseUser = await signInWithFirebase(email, password);
    } catch (error) {
      firebaseError = error;
    }
  }
  const users = readLocalUsers();
  const account = users.find((item) => item.email === email);
  let validLocalCredentials = false;
  if (account?.passwordHash) {
    validLocalCredentials = account.passwordHash === await passwordDigest(password);
  } else if (account?.profile?.teamId) {
    const teamKey = Object.keys(SQUAD_TEAMS).find((key) => SQUAD_TEAMS[key].id === account.profile.teamId);
    validLocalCredentials = Boolean(teamKey && password === getEffectivePassword(teamKey));
  }
  if (!firebaseUser && !validLocalCredentials) {
    throw new Error(firebaseError?.message ?? "The advanced email or password is incorrect.");
  }
  const profile = account?.profile ?? {
    id: firebaseUser.uid,
    name: email.split("@")[0],
    email,
    role: "All-rounder",
    teamId: currentTeams[0]?.id ?? DEFAULT_TEAMS[0].id,
    tags: []
  };
  updateState((state) => ({ ...state, currentUser: { ...profile, id: firebaseUser?.uid ?? profile.id }, currentPage: "dashboard" }));
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ username: profile.name, teamId: profile.teamId, email, ts: Date.now() }));
  closeAuthSections();
  if (firebaseUser) {
    persistPlayer({ ...profile, id: firebaseUser.uid });
    await syncSessionMetadata();
  }
  if (firebaseError) await showError(new Error("Firebase sign-in failed; the saved local profile was used."), "Offline sign-in");
}

async function signOut() {
  let signOutError;
  try {
    await signOutFirebase();
  } catch (error) {
    signOutError = error;
  }
  updateState((state) => ({ ...state, currentUser: null }));
  localStorage.removeItem(LOCAL_SESSION_KEY);
  closeAuthSections();
  el("login-form").reset();
  updateSelectedPlayer();
  void syncSessionMetadata();
  if (signOutError) await showError(signOutError, "Signed out locally");
}

function navigate(page) {
  const pageIds = { dashboard: "dashboard-section", "match-setup": "match-setup-section", "live-scoring": "scoreboard-section", analysis: "analysis-section", settings: "settings-section" };
  const targetId = pageIds[page] ?? page;
  if (!document.getElementById(targetId)?.classList.contains("page-section")) throw new TypeError(`Page ${page} is unavailable.`);
  updateState((state) => ({ ...state, currentPage: page }));
  renderRouter(page);
}

async function beginMatch(event) {
  event.preventDefault();
  validateForm(event.currentTarget);
  const a = teamById(el("setup-team-a").value);
  const b = teamById(el("setup-team-b").value);
  if (!a || !b) throw new TypeError("Select two teams before starting.");
  const format = el("match-format").value;
  const rawOvers = el("setup-overs").value;
  const overs = format === "multi-day" ? null : rawOvers === "custom" ? Number(el("custom-overs").value) : Number(rawOvers);
  const selectedMode = document.querySelector('input[name="mode-choice"]:checked')?.value ?? "live";
  const mode = selectedMode === "post-detailed" ? "multi-innings" : selectedMode;
  el("setup-mode").value = mode;
  const match = createMatch({
    teamA: a, teamB: b, overs, format,
    days: Number(el("match-days").value),
    maxInnings: format === "multi-day" ? Number(el("match-max-innings").value) : 2,
    toss: { winnerId: el("toss-winner").value, decision: el("toss-decision").value },
    mode
  });
  match.venue = el("setup-venue").value.trim();
  updateState((state) => ({ ...state, matches: [...state.matches, match], activeMatchId: match.id, currentPage: "live-scoring" }));
  viewingInnings = 0;
  const note = match.mode === "retrospective" ? "Enter the scorecard in the post-match panel." : "Match is ready. Select players to start scoring.";
  setInlineStatus(el("app-status"), note);
  void syncRemote(`matches/${match.id}`, {
    match,
    owner: store.getState().currentUser?.id,
    createdAt: match.createdAt,
    updatedAt: new Date().toISOString()
  });
}

function selectedPlayers() {
  return {
    strikerId: el("striker-select").value,
    nonStrikerId: el("non-striker-select").value || null,
    bowlerId: el("bowler-select").value
  };
}

function savePickerChanges() {
  const match = getActiveMatch();
  const innings = activeInnings(match);
  if (!innings || innings.closed) return;
  const selected = selectedPlayers();
  if (selected.strikerId && selected.strikerId === selected.nonStrikerId) {
    setInlineStatus(el("app-status"), "Striker and non-striker must be different players.", "error");
    el("non-striker-select").value = "";
    return;
  }
  innings.strikerId = selected.strikerId || null;
  innings.nonStrikerId = selected.nonStrikerId;
  innings.bowlerId = selected.bowlerId || null;
  store.persist();
  el("app-status").textContent = "";
}

function updateScoreLocal(match, { runs = 0, wicket = false, extra = null }) {
  if (!match || match.id !== store.getState().activeMatchId) throw new Error("Set up a match before recording a ball.");
  addBall(match, { runs, wicket, extra, ...selectedPlayers() });
  persistCurrentMatch(match);
  if (activeInnings(match)?.closed) void maybeOfferFollowOn(match).catch((error) => showError(error));
}

function saveScore({ runs = 0, wicket = false, extra = null }) {
  updateScoreLocal(getActiveMatch(), { runs, wicket, extra });
}

function applyBall(matchId, inningsIndex, runs) {
  const match = getActiveMatch();
  if (!match || match.id !== matchId || match.activeInnings !== inningsIndex) throw new Error("The selected innings is not active.");
  saveScore({ runs });
}

function applyWicket(matchId, inningsIndex) {
  const match = getActiveMatch();
  if (!match || match.id !== matchId || match.activeInnings !== inningsIndex) throw new Error("The selected innings is not active.");
  saveScore({ wicket: true });
}

function undoBall(matchId, inningsIndex) {
  const match = getActiveMatch();
  if (!match || match.id !== matchId || match.activeInnings !== inningsIndex) throw new Error("The selected innings is not active.");
  undoLastBall(match);
  persistCurrentMatch(match);
}

async function endCurrentInnings() {
  const match = getActiveMatch();
  const innings = activeInnings(match);
  if (!innings) throw new Error("There is no active innings.");
  const result = await openGlassModal({
    title: "End this innings?",
    body: `<p>${escapeHTML(teamById(innings.battingTeamId)?.name)} finish on <strong>${innings.score}/${innings.wickets}</strong>.</p>`,
    actions: [{ id: "cancel", label: "Keep scoring" }, { id: "end", label: "End innings", primary: true }]
  });
  if (result !== "end") return;
  endInnings(match);
  persistCurrentMatch(match);
  setInlineStatus(el("app-status"), `Innings ${match.activeInnings + 1} declared.`);
  await maybeOfferFollowOn(match);
}

function maybeOfferFollowOn(match) {
  const first = match.innings[0];
  const second = match.innings[1];
  if (match.format !== "multi-day" || match.followOnOffered || match.followOnEnforced ||
      match.innings.length !== 2 || !first || !second || !second.closed ||
      second.endReason !== "all-out" || first.battingTeamId !== match.teamA.id ||
      second.battingTeamId !== match.teamB.id) return Promise.resolve();
  const threshold = match.days === 3 || match.days === 4 ? 150 : 200;
  const lead = first.score - second.score;
  if (lead < threshold) return Promise.resolve();
  match.followOnOffered = true;
  persistCurrentMatch(match);
  return openGlassModal({
    title: "Enforce Follow-On?",
    body: `<p>Team B must bat again immediately. Team A leads by ${lead} runs; the follow-on threshold is ${threshold}.</p>`,
    actions: [
      { id: "no", label: "No, continue normally" },
      { id: "yes", label: "Enforce follow-on", primary: true }
    ]
  }).then((choice) => {
    if (choice !== "yes") return;
    match.followOnEnforced = true;
    startNextInnings(match);
    viewingInnings = match.activeInnings;
    persistCurrentMatch(match);
    setInlineStatus(el("app-status"), "Follow-on enforced. Team B has started innings 3.");
  });
}

function startNextMatchInnings() {
  const match = getActiveMatch();
  if (!match) throw new Error("There is no active match.");
  startNextInnings(match);
  viewingInnings = match.activeInnings;
  persistCurrentMatch(match);
  setInlineStatus(el("app-status"), `Innings ${match.activeInnings + 1} is ready${match.innings[match.activeInnings].targetType === "chase" ? `. Target: ${match.innings[match.activeInnings].target}` : "."}`);
}

function savePostMatchStats(event) {
  event.preventDefault();
  validateForm(event.currentTarget);
  const match = getActiveMatch();
  if (!match) throw new Error("There is no active match.");
  const oversInput = Number(el("post-bowling-overs").value);
  const wholeOvers = Math.floor(oversInput);
  const decimalBalls = Math.round((oversInput - wholeOvers) * 10);
  if (decimalBalls > 5) throw new TypeError("Bowling overs must use cricket notation, such as 2.3.");
  addRetrospectiveStats(match, {
    playerId: el("post-player").value,
    bowlerId: el("post-bowler-player").value,
    runs: Number(el("post-runs").value), balls: Number(el("post-balls").value),
    fours: Number(el("post-fours").value), sixes: Number(el("post-sixes").value),
    wickets: Number(el("post-wickets").value), bowlingBalls: wholeOvers * 6 + decimalBalls,
    conceded: Number(el("post-conceded").value)
  });
  persistCurrentMatch(match);
  setInlineStatus(el("app-status"), "Player scorecard entry saved.");
  el("post-match-form").reset();
  if (activeInnings(match)?.closed) void maybeOfferFollowOn(match).catch((error) => showError(error));
}

async function finishMatch() {
  const match = getActiveMatch();
  if (!match) throw new Error("There is no active match.");
  const result = await openGlassModal({
    title: "Finish this match?",
    body: "<p>This will close the active innings and save the match result.</p>",
    actions: [{ id: "cancel", label: "Cancel" }, { id: "finish", label: "Finish match", primary: true }]
  });
  if (result !== "finish") return;
  const summary = finalizeMatch(match);
  persistCurrentMatch(match);
  setInlineStatus(el("app-status"), `${summary.winner} · ${summary.margin} · Player of the Match: ${summary.potm}`);
}

async function openMatch(matchId) {
  const match = getMatches().find((item) => item.id === matchId);
  if (!match) throw new Error("That match is no longer available.");
  updateState((state) => ({ ...state, activeMatchId: match.id, currentPage: "live-scoring" }));
}

async function createTeam() {
  const team = await openCustomTeamBuilder();
  if (!team) return;
  const teams = [...allKnownTeams(), team];
  updateState((state) => ({ ...state, teams }));
  await syncRemote(`customTeams/${team.id}`, team);
  setInlineStatus(el("app-status"), `${team.name} is ready for your next match.`);
}

async function saveProfile(event) {
  event.preventDefault();
  validateForm(event.currentTarget);
  const user = store.getState().currentUser;
  const profile = updatePlayerProfile(user.id, {
    name: el("profile-name").value,
    tags: el("profile-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
    role: el("profile-role").value,
    teamId: el("profile-team").value
  });
  updateState((state) => ({ ...state, currentUser: { ...state.currentUser, ...profile } }));
  addPlayerToTeam(profile);
  persistPlayer(profile);
  await syncRemote(`teams/${profile.teamId}`, { team: teamById(profile.teamId) });
  await syncSessionMetadata();
  setInlineStatus(el("app-status"), "Player profile saved.");
}

async function submitCaptainVote(event) {
  event.preventDefault();
  validateForm(event.currentTarget);
  const user = store.getState().currentUser;
  const teamId = el("vote-team").value;
  const vote = castCaptainVote({ voterId: user.id, teamId, candidateId: el("vote-candidate").value });
  const tally = tallyCaptainVotes(teamId, getVotes().captain[teamId]);
  const candidateName = playersFor(teamId).find((player) => player.id === tally.winner)?.name ?? tally.winner;
  el("captain-result").textContent = tally.winner
    ? `${tally.votes} vote${tally.votes === 1 ? "" : "s"} · majority candidate: ${candidateName}`
    : `${tally.votes} vote${tally.votes === 1 ? "" : "s"} · no candidate has a majority yet.`;
  await persistVote(teamId, vote);
}

async function submitCodeVote(event) {
  event.preventDefault();
  validateForm(event.currentTarget);
  const user = store.getState().currentUser;
  const teamId = user.teamId ?? "general";
  const code = el("secret-code").value;
  const vote = castCodeVote({ voterId: user.id, teamId, code });
  const votes = getVotes().codes.filter((item) => item.teamId === teamId);
  const tally = tallyCodeVotes(votes, code);
  el("code-result").textContent = `${tally.matching} of ${tally.total} votes match this code${tally.majority ? " · majority reached" : ""}.`;
  if (tally.majority) {
    const teamKey = Object.keys(SQUAD_TEAMS).find((key) => SQUAD_TEAMS[key].id === teamId);
    if (teamKey) {
      const overrides = JSON.parse(localStorage.getItem("tc_team_codes_v1") ?? "{}");
      overrides[teamKey] = code;
      localStorage.setItem("tc_team_codes_v1", JSON.stringify(overrides));
    }
  }
  await persistVote(teamId, vote, true);
  el("code-vote-form").reset();
}

function changeTheme() {
  const theme = el("theme-select").value;
  const validThemes = ["theme-default-glass-dark", "theme-neon-cyberpunk", "theme-emerald-pitch", "theme-midnight-apex"];
  if (!validThemes.includes(theme)) throw new TypeError("Choose one of the available themes.");
  document.documentElement.classList.remove(...validThemes);
  document.documentElement.classList.add(theme);
  localStorage.setItem("tc_theme", theme);
}

function printReport() {
  const match = getActiveMatch() ?? getMatches().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!match) throw new Error("There is no match report to print.");
  el("report-root").innerHTML = buildPrintReport(match);
  el("report-root").classList.remove("hidden");
  el("report-root").setAttribute("aria-hidden", "false");
  window.addEventListener("afterprint", () => {
    el("report-root").classList.add("hidden");
    el("report-root").setAttribute("aria-hidden", "true");
  }, { once: true });
  triggerPrint();
}

function wireEvents() {
  el("login-form").addEventListener("submit", runSafely((event) => {
    event.preventDefault();
    return loginPlayer(el("username-select").value);
  }));
  el("username-select").addEventListener("change", runSafely((event) => {
    updateSelectedPlayer();
    const username = event.target.value;
    if (username) return loginPlayer(username);
  }));
  document.querySelectorAll(".toggle-link").forEach((button) => {
    button.addEventListener("click", () => toggleAuthSection(button.dataset.target, button));
  });
  el("adv-submit").addEventListener("click", runSafely(advancedLogin));
  el("reg-submit").addEventListener("click", runSafely(registerPlayer));
  el("logout-button").addEventListener("click", runSafely(signOut));
  el("brand-link").addEventListener("click", (event) => {
    event.preventDefault();
    navigate("dashboard");
  });
  el("main-nav").addEventListener("click", runSafely((event) => {
    const tab = event.target.closest("[data-page]");
    if (tab) navigate(tab.dataset.page);
  }));
  el("home-new-match").addEventListener("click", () => navigate("match-setup"));
  el("home-live-match").addEventListener("click", () => navigate("live-scoring"));
  el("setup-form").addEventListener("submit", runSafely(beginMatch));
  el("match-format").addEventListener("change", updateSetupFormat);
  document.querySelectorAll('input[name="mode-choice"]').forEach((input) => input.addEventListener("change", () => {
    el("setup-mode").value = input.value === "post-detailed" ? "multi-innings" : input.value;
    document.querySelectorAll(".mode-option").forEach((option) => option.classList.toggle("is-selected", option.querySelector("input").checked));
  }));
  document.querySelectorAll('input[name="team-type"]').forEach((input) => input.addEventListener("change", renderTeamOptions));
  el("setup-overs").addEventListener("change", updateSetupFormat);
  el("setup-team-a").addEventListener("change", () => {
    if (el("setup-team-a").value === el("setup-team-b").value) {
      const alternate = [...el("setup-team-b").options].find((option) => option.value !== el("setup-team-a").value);
      if (alternate) el("setup-team-b").value = alternate.value;
    }
    updateTossOptions();
  });
  el("setup-team-b").addEventListener("change", () => {
    if (el("setup-team-a").value === el("setup-team-b").value) {
      const alternate = [...el("setup-team-a").options].find((option) => option.value !== el("setup-team-b").value);
      if (alternate) el("setup-team-a").value = alternate.value;
    }
    updateTossOptions();
  });
  el("vote-team").addEventListener("change", renderVoteCandidates);
  el("scoreboard-section").addEventListener("click", runSafely((event) => {
    const tab = event.target.closest("[data-view-innings]");
    if (tab) {
      viewingInnings = Number(tab.dataset.viewInnings);
      renderLive();
      return;
    }
    const striker = event.target.closest("[data-set-striker]");
    const partner = event.target.closest("[data-set-non-striker]");
    const bowler = event.target.closest("[data-set-bowler]");
    if (striker) {
      el("striker-select").value = striker.dataset.setStriker;
      if (el("non-striker-select").value === striker.dataset.setStriker) el("non-striker-select").value = "";
      savePickerChanges();
      renderAll();
      return;
    }
    if (partner) {
      el("non-striker-select").value = partner.dataset.setNonStriker;
      if (el("striker-select").value === partner.dataset.setNonStriker) el("striker-select").value = "";
      savePickerChanges();
      renderAll();
      return;
    }
    if (bowler) {
      el("bowler-select").value = bowler.dataset.setBowler;
      savePickerChanges();
      renderAll();
      return;
    }
    const button = event.target.closest("[data-runs],[data-wicket],[data-extra]");
    if (!button) return;
    const active = getActiveMatch();
    if (button.hasAttribute("data-runs")) applyBall(active.id, active.activeInnings, Number(button.dataset.runs));
    else if (button.hasAttribute("data-wicket")) applyWicket(active.id, active.activeInnings);
    else saveScore({ extra: button.dataset.extra });
  }));
  for (const id of ["striker-select", "non-striker-select", "bowler-select"]) el(id).addEventListener("change", savePickerChanges);
  el("undo-ball").addEventListener("click", runSafely(() => {
    const match = getActiveMatch();
    if (!match) throw new Error("There is no active match.");
    undoBall(match.id, match.activeInnings);
  }));
  el("swap-strike").addEventListener("click", runSafely(() => {
    const match = getActiveMatch();
    if (!match) throw new Error("There is no active match.");
    swapStrike(match);
    persistCurrentMatch(match);
  }));
  el("live-end-innings").addEventListener("click", runSafely(endCurrentInnings));
  el("start-second-innings").addEventListener("click", runSafely(startNextMatchInnings));
  el("post-match-form").addEventListener("submit", runSafely(savePostMatchStats));
  el("finalize-match").addEventListener("click", runSafely(finishMatch));
  el("chart-select").addEventListener("change", () => {
    activeFilter = el("chart-select").value;
    renderAnalysis();
  });
  el("analysis-matches").addEventListener("click", runSafely((event) => {
    const button = event.target.closest("[data-open-match]");
    if (button) return openMatch(button.dataset.openMatch);
  }));
  el("dash-recent").addEventListener("click", runSafely((event) => {
    const button = event.target.closest("[data-open-match]");
    if (button) return openMatch(button.dataset.openMatch);
  }));
  el("captain-vote-form").addEventListener("submit", runSafely(submitCaptainVote));
  el("code-vote-form").addEventListener("submit", runSafely(submitCodeVote));
  el("profile-form").addEventListener("submit", runSafely(saveProfile));
  el("theme-select").addEventListener("change", runSafely(changeTheme));
  el("theme-customizer").addEventListener("click", runSafely((event) => {
    const card = event.target.closest("[data-theme]");
    if (!card) return;
    el("theme-select").value = card.dataset.theme;
    changeTheme();
    renderSettings();
  }));
  el("create-team-button").addEventListener("click", runSafely(createTeam));
  el("settings-create-team").addEventListener("click", runSafely(createTeam));
  el("print-report").addEventListener("click", runSafely(printReport));
}

function initialize() {
  wireEvents();
  const lastUser = localStorage.getItem("tc_last_user");
  if (lastUser && [...el("username-select").options].some((option) => option.value === lastUser)) {
    el("username-select").value = lastUser;
  }
  updateSelectedPlayer();
  const storedTheme = localStorage.getItem("tc_theme");
  if (storedTheme && ["theme-default-glass-dark", "theme-neon-cyberpunk", "theme-emerald-pitch", "theme-midnight-apex"].includes(storedTheme)) {
    document.documentElement.classList.remove("theme-default-glass-dark");
    document.documentElement.classList.add(storedTheme);
  }
  store.subscribe(renderAll);
  renderAll();
  if (!firebase.auth) setInlineStatus(el("auth-status"), "Local mode · choose a seeded player to continue.");
}

initialize();
void bootstrapCloudSync();
