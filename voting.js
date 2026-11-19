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

export function castCaptainVote({ voterId, teamId, candidateId } = {}) {
  if (!voterId || !teamId || !candidateId) throw new TypeError("Voter, team and candidate are required.");
  const votes = readVotes();
  const teamVotes = votes.captain[teamId] ?? [];
  const vote = { id: String(voterId), voterId: String(voterId), teamId: String(teamId), candidateId: String(candidateId), at: new Date().toISOString() };
  votes.captain[teamId] = [...teamVotes.filter((item) => item.voterId !== vote.voterId), vote];
  saveVotes(votes);
  return vote;
}

export function tallyCaptainVotes(teamId, votes = readVotes().captain[teamId] ?? []) {
  const counts = {};
  for (const vote of votes) {
    if (vote.teamId === teamId && vote.candidateId) counts[vote.candidateId] = (counts[vote.candidateId] ?? 0) + 1;
  }
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { teamId, counts, winner: winner && winner[1] > total / 2 ? winner[0] : null, votes: total };
}

export function castCodeVote({ voterId, code } = {}) {
  if (!voterId || typeof code !== "string" || !code.trim()) throw new TypeError("Voter and secret code are required.");
  const votes = readVotes();
  const vote = { id: `${Date.now()}-${String(voterId)}`, voterId: String(voterId), code: code.trim(), at: new Date().toISOString() };
  votes.codes = [...votes.codes.filter((item) => item.voterId !== vote.voterId), vote];
  saveVotes(votes);
  return vote;
}

export function tallyCodeVotes(votes = readVotes().codes, secretCode) {
  const records = Array.isArray(votes) ? votes : [];
  const total = records.length;
  const matching = records.filter((vote) => vote.code === secretCode).length;
  return { total, matching, majority: total > 0 && matching > total / 2, counts: records.reduce((counts, vote) => {
    const key = String(vote.code);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}) };
}

export function getVotes() {
  return readVotes();
}
