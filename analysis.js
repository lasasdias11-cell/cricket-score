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

export function buildSeriesTotals(matches = []) {
  return aggregate(matches);
}

export function buildThisWeekMatch(matches = []) {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return aggregate(matches.filter((match) => {
    const date = new Date(match.createdAt);
    return Number.isFinite(date.getTime()) && date >= start;
  }));
}

export function buildLastMatch(matches = []) {
  return aggregate(matches.length ? [matches.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]] : []);
}

export function buildPerMatch(matchId, matches = []) {
  return aggregate(matches.filter((match) => match.id === matchId));
}

export function computeAwards(matchOrSeries) {
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
