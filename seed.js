export const SQUAD_TEAMS = {
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

export const SEED_PLAYERS = [
  { username: "Dilusha", teamKey: "whiteTigers", role: "Batter", tags: ["Captain", "Opener"] },
  { username: "Isala", teamKey: "whiteTigers", role: "All-Rounder", tags: ["Vice-Captain"] },
  { username: "Anuk", teamKey: "whiteTigers", role: "Bowler", tags: ["Death Specialist"] },
  { username: "Jevon", teamKey: "blackPanthers", role: "All-Rounder", tags: ["Captain", "Finisher"] },
  { username: "Lasas", teamKey: "blackPanthers", role: "Batter", tags: ["Opener"] },
  { username: "Shenal", teamKey: "blackPanthers", role: "Bowler", tags: ["Spinner"] }
];

export function resolveEmail(username, teamKey) {
  const team = SQUAD_TEAMS[teamKey];
  if (!team) throw new Error("Unknown team");
  return `${String(username).toLowerCase()}@${team.domain}`;
}

export function resolvePassword(teamKey) {
  const team = SQUAD_TEAMS[teamKey];
  if (!team) throw new Error("Unknown team");
  return team.code;
}

export function findSeedPlayer(username) {
  return SEED_PLAYERS.find((player) => player.username === username) ?? null;
}

export function seedTeamsAsAppTeams() {
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
