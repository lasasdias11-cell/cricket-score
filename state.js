import { seedTeamsAsAppTeams } from "./seed.js";

const STORAGE_KEY = "tc_state_v1";

export const DEFAULT_TEAMS = seedTeamsAsAppTeams().map((team) => ({
  ...team,
  roster: team.roster.map((player) => ({ ...player }))
}));
/*
export const LEGACY_DEFAULT_TEAMS = [
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

export function createInitialState() {
  return {
    currentUser: null,
    currentPage: "dashboard",
    teams: DEFAULT_TEAMS.map((team) => ({ ...team, roster: team.roster.map((player) => ({ ...player })) })),
    matches: [],
    activeMatchId: null
  };
}

export function createStore(initialState = createInitialState()) {
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
      state = { ...createInitialState(), ...parsed };
      for (const listener of listeners) listener(state);
      return state;
    }
  };
}
