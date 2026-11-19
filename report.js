import { computeAwards } from "./analysis.js";

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const overs = (balls) => `${Math.floor((balls ?? 0) / 6)}.${(balls ?? 0) % 6}`;

export function buildPrintReport(match) {
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
    const batterRows = Object.values(inn.batsmen ?? {}).map((player) => `<tr><td>${escapeHTML(playerName.get(player.playerId) ?? player.playerId)}</td><td>${player.runs}</td><td>${player.balls}</td><td>${player.fours}</td><td>${player.sixes}</td></tr>`).join("");
    const bowlerRows = Object.values(inn.bowlers ?? {}).map((player) => `<tr><td>${escapeHTML(playerName.get(player.playerId) ?? player.playerId)}</td><td>${overs(player.bowlingBalls)}</td><td>${player.conceded}</td><td>${player.wickets}</td></tr>`).join("");
    return `<section class="report-innings"><h2>Innings ${index + 1} · ${escapeHTML(teamName(inn.battingTeamId))}</h2><p><strong>${inn.score}/${inn.wickets}</strong> in ${overs(inn.legalBalls)} overs${inn.target ? ` · target ${inn.target}` : ""}</p>
      <h3>Batting</h3><table><thead><tr><th>Player</th><th>Runs</th><th>Balls</th><th>4s</th><th>6s</th></tr></thead><tbody>${batterRows || "<tr><td colspan='5'>No batting entries</td></tr>"}</tbody></table>
      <h3>Bowling</h3><table><thead><tr><th>Player</th><th>Overs</th><th>Runs</th><th>Wickets</th></tr></thead><tbody>${bowlerRows || "<tr><td colspan='4'>No bowling entries</td></tr>"}</tbody></table></section>`;
  }).join("");
  const awards = computeAwards(match).map((award) => `<li><strong>${escapeHTML(award.title)}:</strong> ${escapeHTML(award.player)} — ${escapeHTML(award.value)}</li>`).join("");
  return `<article class="print-report"><p>THURSDAY CRICKET · MATCH REPORT</p><h1>${escapeHTML(match.teamA.name)} vs ${escapeHTML(match.teamB.name)}</h1>
    <p>${escapeHTML(match.venue || "Venue not recorded")} · ${new Date(match.createdAt).toLocaleDateString()}</p>
    ${match.result ? `<h2>${escapeHTML(match.result.winner)} · ${escapeHTML(match.result.margin)}</h2>` : ""}
    ${innings}<section><h2>Match awards</h2><ul>${awards}</ul></section></article>`;
}

export function triggerPrint() {
  window.print();
}
