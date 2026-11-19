import { openGlassModal } from "./effects.js";

const TEAM_KEY = "tc_custom_teams_v1";
const PLAYER_KEY = "tc_players_v1";

function readArray(key, label) {
  const value = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(value)) throw new TypeError(`Saved ${label} data is invalid.`);
  return value;
}

export function createCustomTeam({ name, tag, color, roster = [] } = {}) {
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

export function updatePlayerProfile(playerId, { name, tags = [], role, teamId } = {}) {
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

export function listPlayers(teamId) {
  const customTeams = readArray(TEAM_KEY, "team");
  const players = readArray(PLAYER_KEY, "player");
  const roster = customTeams.find((team) => team.id === teamId)?.roster ?? [];
  const ids = new Set(roster.map((player) => String(player.id ?? player)));
  return players.filter((player) => player.teamId === teamId || ids.has(player.id));
}

export function listCustomTeams() {
  return readArray(TEAM_KEY, "team");
}

export async function openCustomTeamBuilder() {
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
