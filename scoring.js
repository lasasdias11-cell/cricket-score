import { computeAwards } from "./analysis.js";

export class ScoringError extends Error {
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

export function createMatch({ teamA, teamB, overs, toss, mode, format = "limited-overs", days = 1, maxInnings } = {}) {
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

export function addBall(match, { runs = 0, wicket = false, extra = null, strikerId, nonStrikerId, bowlerId } = {}) {
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

export function undoLastBall(match) {
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

export function swapStrike(match) {
  ensureMatch(match);
  const innings = currentInnings(match);
  if (innings.closed) throw new ScoringError("Strike cannot be changed after the innings ends.", "INNINGS_CLOSED");
  if (!innings.strikerId || !innings.nonStrikerId) throw new ScoringError("Choose both batters before swapping strike.", "MISSING_PLAYERS");
  [innings.strikerId, innings.nonStrikerId] = [innings.nonStrikerId, innings.strikerId];
  return match;
}

export function endInnings(match, reason = "declared") {
  ensureMatch(match);
  const innings = currentInnings(match);
  if (innings.closed) throw new ScoringError("This innings is already closed.", "INNINGS_CLOSED");
  if (!["declared", "all-out", "overs", "target"].includes(reason)) throw new ScoringError("Unknown innings end reason.", "INVALID_END_REASON");
  innings.closed = true;
  innings.endReason = reason;
  return match;
}

export function computeTarget(innings1) {
  if (!innings1 || !Number.isInteger(innings1.score) || innings1.score < 0) {
    throw new ScoringError("First-innings score is missing or invalid.", "INVALID_INNINGS");
  }
  return innings1.score + 1;
}

export function startSecondInnings(match) {
  return startNextInnings(match);
}

function aggregateScore(match, teamId) {
  return match.innings.reduce((total, innings) => total + (innings.battingTeamId === teamId ? innings.score : 0), 0);
}

export function startNextInnings(match) {
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

export function addRetrospectiveStats(match, { playerId, bowlerId = playerId, runs, balls, fours = 0, sixes = 0, wickets = 0, bowlingBalls = 0, conceded = 0, inningsIndex = match?.activeInnings } = {}) {
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

export function finalizeMatch(match) {
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

export { ballsToOvers };
