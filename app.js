/* ==========================================================================
   Thursday Cricket · app.js
   Single-page cricket scoring app with multi-innings engine, dynamic team
   creation, custom matchmaker, player registration, and fluid tactile ripples.
   Vanilla JS + Firebase Firestore (with seamless localStorage fallback).
   ========================================================================== */

'use strict';

/* ---------- 1. Firebase Configuration ----------
   Project: thursday-cricket · App: 1:752945537542:web:84be60617247fc045fd987 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCaA5DXo3JkWGqGdjFBMPnKj5PlwAbCT-Y',
  authDomain: 'thursday-cricket.firebaseapp.com',
  projectId: 'thursday-cricket',
  storageBucket: 'thursday-cricket.appspot.com',
  messagingSenderId: '752945537542',
  appId: '1:752945537542:web:84be60617247fc045fd987'
};

/* ---------- 2. Constants & Defaults ---------- */
const DEFAULT_TEAMS = {
  whiteTigers: {
    id: 'whiteTigers',
    name: 'White Tigers',
    short: 'WT',
    secretCode: 'White@tiger',
    members: ['Dilusha', 'Isala', 'Anuk'],
    color: '#38bdf8'
  },
  blackPanthers: {
    id: 'blackPanthers',
    name: 'Black Panthers',
    short: 'BP',
    secretCode: 'Black@panthers',
    members: ['Jevon', 'Lasas', 'Shenal'],
    color: '#1d4ed8'
  }
};

const LS = {
  user: 'cricscore_user',
  teams: 'cricscore_teams',
  customTeams: 'cricscore_customTeams',
  matches: 'cricscore_matches',
  votes: 'cricscore_votes',
  players: 'cricscore_players',
  theme: 'cricscore_theme'
};

const THEMES = [
  { id: 'default', name: 'Default Glass Dark', icon: '🌌', desc: 'Deep black with vibrant blue/cyan glass accents', primary: '#3b82f6', accent: '#22d3ee' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', icon: '⚡', desc: 'Deep obsidian with electric purple & hot pink', primary: '#a855f7', accent: '#ec4899' },
  { id: 'emerald', name: 'Emerald Pitch', icon: '🌿', desc: 'Forest dark with vibrant cricket-pitch glow', primary: '#10b981', accent: '#34d399' },
  { id: 'sunset', name: 'Royal Sunset', icon: '🌅', desc: 'Midnight navy with warm gold & amber gradients', primary: '#f59e0b', accent: '#f97316' }
];

function getSavedTheme() {
  try { return localStorage.getItem(LS.theme) || 'default'; }
  catch (e) { return 'default'; }
}

function applyTheme(themeId) {
  const chosen = THEMES.some(t => t.id === themeId) ? themeId : 'default';
  document.documentElement.dataset.theme = chosen;
  try { localStorage.setItem(LS.theme, chosen); } catch (e) {}
}

// Apply saved theme immediately on evaluation
applyTheme(getSavedTheme());

/* ---------- 3. Global State ---------- */
const state = {
  user: null,               // { teamId, member, displayName }
  teams: defaultTeams(),
  customTeams: {},
  teamDocs: {},
  matches: [],
  votes: {},                // { [teamId]: { proposedCode, votes: {member:true}, proposedCaptain, captainVotes: {} } }
  players: {},              // { [teamId__member]: { displayName, name, tag } }
  activeMatchId: null,
  syncError: false,
  matchSetupType: 'standard', // 'standard' | 'custom'
  activeInningIdx: 0        // index of the inning currently being viewed / scored
};

let uiMode = 'quick';        // 'quick' | 'detailed' | 'retro' | 'post-detailed'
let chartTeam = null;        // Chart.js instances
let chartPlayers = null;
let localEditUntil = 0;      // Suppress live-area rebuild while scoring (avoids dropped taps)
const undoStack = {};        // { matchId: { inningIdx: [snapshot, ...] } }

function markLocalEdit() { localEditUntil = Date.now() + 900; }
function isRecentLocalEdit() { return Date.now() < localEditUntil; }

/* ---------- 4. Utilities ---------- */
function uid() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(ts) {
  try { return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return ''; }
}
function toast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}
function defaultTeams() {
  return Object.fromEntries(Object.values(DEFAULT_TEAMS).map(t => [t.id, Object.assign({}, t, { members: t.members.slice() })]));
}
function getTeam(id) {
  return state.teams[id] || defaultTeams()[id] || { id, name: id, short: id.slice(0, 3).toUpperCase(), secretCode: '', members: [], color: '#3b82f6' };
}
function memberKey(teamId, member) { return teamId + '__' + member; }
function displayNameOf(teamId, member) {
  const p = state.players[memberKey(teamId, member)];
  if (p && p.displayName) return p.displayName;
  if (p && p.tag) return member + ' "' + p.tag + '"';
  return member;
}
function playerLabel(p, teamId) {
  return p.member ? displayNameOf(teamId, p.member) : p.name;
}
function majority(teamId) {
  return Math.floor((getTeam(teamId).members || []).length / 2) + 1;
}
function fmtOvers(balls) {
  return Math.floor((balls || 0) / 6) + '.' + ((balls || 0) % 6);
}
function parseOversToBalls(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(val) || 0;
  const fullOvers = Math.floor(num);
  const remBalls = Math.min(5, Math.max(0, Math.round((num - fullOvers) * 10)));
  return (fullOvers * 6) + remBalls;
}
function isDetailedMatch(m) {
  if (!m) return false;
  return m.mode === 'detailed' || m.mode === 'post-detailed' || (m.innings && m.innings.some(inn => inn.players && inn.players.length > 0));
}
function modeLabel(mode) {
  switch (mode) {
    case 'quick': return '⚡ Quick Match';
    case 'detailed': return '📋 Live Detailed';
    case 'retro': return '🗂 Post-Match Retro';
    case 'post-detailed': return '📝 Post-Match Detailed';
    default: return '🏏 Match';
  }
}
function overDots(balls) {
  const b = (balls || 0) % 6;
  let h = '';
  for (let i = 0; i < 6; i++) h += '<span class="dot' + (i < b ? ' on' : '') + '"></span>';
  return h;
}
function totalBalls(t) {
  if (!t) return 0;
  if (t.balls != null && t.balls > 0) return t.balls;
  return (t.players || []).reduce((s, p) => s + (+p.balls || 0), 0);
}

// Deep sanitize object to strip undefined values so Firestore writes never fail
function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item));
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean;
}

/* ---------- 5. Tactile Touch Water-Ripple Effect (60fps GPU) ---------- */
function attachRippleEffect() {
  const selector = '.btn, .run-btn, .nav-btn, .mode-option, .theme-card, .pd-status-toggle, .prow, .innings-tab, .team-chip, .setup-type-btn, [data-ripple]';

  function triggerRipple(e) {
    const el = e.target.closest(selector);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : (rect.left + rect.width / 2));
    const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : (rect.top + rect.height / 2));

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Radius to cover the furthest corner of the element
    const maxDistX = Math.max(x, rect.width - x);
    const maxDistY = Math.max(y, rect.height - y);
    const radius = Math.hypot(maxDistX, maxDistY);
    const size = radius * 2.2;

    const ripple = document.createElement('span');
    ripple.className = 'tc-water-wave';
    ripple.style.width = size + 'px';
    ripple.style.height = size + 'px';
    ripple.style.left = (x - size / 2) + 'px';
    ripple.style.top = (y - size / 2) + 'px';

    el.appendChild(ripple);
    setTimeout(() => {
      if (ripple.parentNode) ripple.remove();
    }, 420);
  }

  document.addEventListener('pointerdown', triggerRipple, { passive: true });
}

/* ---------- 6. Data Layer (Firestore ⇄ localStorage Fallback) ---------- */
const db = (() => {
  let mode = 'local';
  let fs = null;
  let bc = null;
  try { bc = 'BroadcastChannel' in window ? new BroadcastChannel('cricscore_v1') : null; } catch (e) { bc = null; }
  const subs = { teams: [], customTeams: [], matches: [], votes: [], players: [] };
  const cols = { teams: 'teams', customTeams: 'customTeams', matches: 'matches', votes: 'teamVotes', players: 'players' };

  function isPlaceholder(cfg) {
    if (!cfg || !cfg.apiKey) return true;
    if (/YOUR_|PASTE|REPLACE|EXAMPLE|PLACEHOLDER/i.test(cfg.apiKey)) return true;
    return !/^AIzaSy/i.test(cfg.apiKey);
  }
  function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    if (bc) { try { bc.postMessage({ type: 'change', key }); } catch (e) {} }
  }
  function seed() {
    if (load(LS.teams) == null) save(LS.teams, defaultTeams());
    if (load(LS.matches) == null) save(LS.matches, []);
    if (load(LS.votes) == null) save(LS.votes, {});
    if (load(LS.players) == null) save(LS.players, {});
    if (load(LS.customTeams) == null) save(LS.customTeams, {});
  }
  function emit(col, data) { (subs[col] || []).slice().forEach(cb => cb(data)); }
  function emitLocal(col) { emit(col, col === 'matches' ? (load(LS.matches) || []) : (load(LS[col]) || {})); }
  function emitAllLocal() { ['teams', 'customTeams', 'matches', 'votes', 'players'].forEach(emitLocal); }

  async function ensureAuth() {
    if (typeof firebase === 'undefined' || !firebase.auth) return null;
    if (firebase.auth().currentUser) return firebase.auth().currentUser;
    try {
      const authPromise = firebase.auth().signInAnonymously();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 4000));
      const res = await Promise.race([authPromise, timeoutPromise]);
      return res ? res.user : null;
    } catch (e) {
      console.warn('[Thursday Cricket] Anonymous auth attempt:', e && e.message);
      return null;
    }
  }

  async function init() {
    const fbOk = typeof firebase !== 'undefined' && !isPlaceholder(FIREBASE_CONFIG);
    if (fbOk) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        fs = firebase.firestore();
        try {
          await fs.enablePersistence({ synchronizeTabs: true });
        } catch (e) {
          // Handled gracefully: multi-tab or unsupported persistence
        }
        await ensureAuth();
        mode = 'firestore';
      } catch (e) {
        console.warn('[Thursday Cricket] Firebase init fallback to local:', e);
        mode = 'local';
      }
    } else {
      mode = 'local';
    }
    if (mode === 'local') {
      seed();
      window.addEventListener('storage', e => { if (e.key && e.key.indexOf('cricscore_') === 0) emitAllLocal(); });
      if (bc) bc.onmessage = e => { if (e.data && e.data.type === 'change') emitAllLocal(); };
    }
    return mode;
  }

  function subscribe(col, cb) {
    subs[col].push(cb);
    if (mode === 'firestore') {
      fs.collection(cols[col]).onSnapshot(async snap => {
        if (onErrorCb) onErrorCb(false);
        state.syncError = false;
        renderSyncStatus();

        // If cloud teams collection is empty, auto-seed default teams to Firestore
        if (col === 'teams' && snap.empty) {
          try {
            const def = defaultTeams();
            const batch = fs.batch();
            Object.values(def).forEach(t => {
              batch.set(fs.collection('teams').doc(t.id), sanitizeForFirestore(t));
            });
            await batch.commit();
          } catch (seedErr) {
            console.warn('[Thursday Cricket] Cloud seed teams error:', seedErr);
          }
        }

        if (col === 'matches') {
          const arr = [];
          snap.forEach(d => arr.push(d.data()));
          save(LS.matches, arr);
          emit(col, arr);
        } else {
          const obj = {};
          snap.forEach(d => obj[d.id] = d.data());
          save(LS[col], obj);
          emit(col, obj);
        }
      }, err => {
        console.warn('[Thursday Cricket] Firestore read error on ' + col + ':', err);
        if (onErrorCb) onErrorCb(true);
        state.syncError = true;
        renderSyncStatus();
        emitLocal(col);
      });
    } else {
      emitLocal(col);
    }
  }

  let onErrorCb = null;
  function onError(cb) { onErrorCb = cb; }
  function fail(label, e) {
    console.error('[Thursday Cricket] ' + label + ' failed:', (e && e.message) || e);
    if (onErrorCb) onErrorCb(true);
    clearTimeout(fail._t);
    fail._t = setTimeout(() => toast('⚠️ Firestore sync issue — check connection or rules.', 'error'), 300);
  }

  async function saveTeam(id, data) {
    const clean = sanitizeForFirestore(data);
    const isCustom = !!(clean && clean.custom) || !!(state.customTeams && state.customTeams[id]);
    const col = isCustom ? 'customTeams' : 'teams';
    const key = isCustom ? LS.customTeams : LS.teams;
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection(col).doc(id).set(clean, { merge: true });
      }
    } catch (e) { fail('saveTeam', e); }
    finally {
      const all = load(key) || {};
      all[id] = clean;
      save(key, all);
      if (mode !== 'firestore') emitLocal(col);
    }
  }

  async function saveCustomTeam(id, data) {
    const clean = sanitizeForFirestore(Object.assign({}, data, { custom: true }));
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection('customTeams').doc(id).set(clean, { merge: true });
      }
    } catch (e) { fail('saveCustomTeam', e); }
    finally {
      const all = load(LS.customTeams) || {};
      all[id] = clean;
      save(LS.customTeams, all);
      if (mode !== 'firestore') emitLocal('customTeams');
    }
  }

  async function deleteCustomTeam(id) {
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection('customTeams').doc(id).delete();
      }
    } catch (e) { fail('deleteCustomTeam', e); }
    finally {
      const all = load(LS.customTeams) || {};
      delete all[id];
      save(LS.customTeams, all);
      if (mode !== 'firestore') emitLocal('customTeams');
    }
  }

  async function saveMatch(m) {
    const clean = sanitizeForFirestore(m);
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection('matches').doc(clean.id).set(clean);
      }
    } catch (e) { fail('saveMatch', e); }
    finally {
      const all = load(LS.matches) || [];
      const i = all.findIndex(x => x.id === clean.id);
      if (i >= 0) all[i] = clean; else all.push(clean);
      save(LS.matches, all);
      if (mode !== 'firestore') emitLocal('matches');
    }
  }

  async function deleteMatch(id) {
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection('matches').doc(id).delete();
      }
    } catch (e) { fail('deleteMatch', e); }
    finally {
      save(LS.matches, (load(LS.matches) || []).filter(x => x.id !== id));
      if (mode !== 'firestore') emitLocal('matches');
    }
  }

  async function saveVote(teamId, v) {
    const clean = sanitizeForFirestore(v);
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        if (clean && (clean.proposedCode || clean.proposedCaptain)) {
          await fs.collection('teamVotes').doc(teamId).set(clean);
        } else {
          await fs.collection('teamVotes').doc(teamId).delete();
        }
      }
    } catch (e) { fail('saveVote', e); }
    finally {
      const all = load(LS.votes) || {};
      if (clean && (clean.proposedCode || clean.proposedCaptain)) all[teamId] = clean;
      else delete all[teamId];
      save(LS.votes, all);
      if (mode !== 'firestore') emitLocal('votes');
    }
  }

  async function savePlayer(key, data) {
    const clean = sanitizeForFirestore(data);
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection('players').doc(key).set(clean);
      }
    } catch (e) { fail('savePlayer', e); }
    finally {
      const all = load(LS.players) || {};
      all[key] = clean;
      save(LS.players, all);
      if (mode !== 'firestore') emitLocal('players');
    }
  }

  return {
    init, onError, subscribe, saveTeam, saveCustomTeam, deleteCustomTeam,
    saveMatch, deleteMatch, saveVote, savePlayer, get mode() { return mode; }
  };
})();

/* ---------- 7. Multi-Innings Normalization & Engine ---------- */

/**
 * Ensures a match object has a fully valid `m.innings` sequential array.
 * Converts any legacy match data structure into the modern multi-innings model.
 */
function ensureMatchInnings(m) {
  if (!m) return;
  if (!m.innings || !Array.isArray(m.innings) || m.innings.length === 0) {
    const teamIds = Object.keys(m.teams || {});
    const t1 = m.team1Id || teamIds[0] || 'whiteTigers';
    const t2 = m.team2Id || teamIds[1] || 'blackPanthers';
    const team1Data = (m.teams && m.teams[t1]) || {};
    const team2Data = (m.teams && m.teams[t2]) || {};

    const hasInning2 = (team2Data.runs > 0 || (team2Data.players && team2Data.players.length > 0));
    m.innings = [
      {
        inningNum: 1,
        battingTeam: t1,
        bowlingTeam: t2,
        runs: team1Data.runs || 0,
        wickets: team1Data.wickets || 0,
        overs: team1Data.overs || 0,
        balls: totalBalls(team1Data),
        target: null,
        completed: hasInning2 || m.status === 'completed',
        striker: team1Data.striker || 0,
        bowler: team1Data.bowler || 0,
        players: team1Data.players || [],
        bowlers: team2Data.bowlers || []
      }
    ];

    if (hasInning2) {
      m.innings.push({
        inningNum: 2,
        battingTeam: t2,
        bowlingTeam: t1,
        runs: team2Data.runs || 0,
        wickets: team2Data.wickets || 0,
        overs: team2Data.overs || 0,
        balls: totalBalls(team2Data),
        target: (team1Data.runs || 0) + 1,
        completed: m.status === 'completed',
        striker: team2Data.striker || 0,
        bowler: team2Data.bowler || 0,
        players: team2Data.players || [],
        bowlers: team1Data.bowlers || []
      });
    }
  }

  // Ensure current active inning index is bounded
  if (m.currentInningIdx === undefined || m.currentInningIdx >= m.innings.length) {
    m.currentInningIdx = m.innings.length - 1;
  }
  if (!m.team1Id || !m.team2Id) {
    m.team1Id = m.innings[0] ? m.innings[0].battingTeam : 'whiteTigers';
    m.team2Id = m.innings[0] ? m.innings[0].bowlingTeam : 'blackPanthers';
  }
}

/**
 * Re-synchronizes `m.teams` summaries from `m.innings` for backward compatibility.
 */
function syncMatchTotals(m) {
  if (!m || !m.innings) return;
  if (!m.teams) m.teams = {};

  m.innings.forEach(inn => {
    const batId = inn.battingTeam;
    const bowlId = inn.bowlingTeam;
    if (!m.teams[batId]) m.teams[batId] = { runs: 0, wickets: 0, overs: 0, players: [], bowlers: [] };
    if (!m.teams[bowlId]) m.teams[bowlId] = { runs: 0, wickets: 0, overs: 0, players: [], bowlers: [] };
    m.teams[batId].runs = inn.runs || 0;
    m.teams[batId].wickets = inn.wickets || 0;
    m.teams[batId].balls = inn.balls || 0;
    m.teams[batId].overs = inn.balls ? (inn.balls / 6) : (inn.overs || 0);
    if (inn.players && inn.players.length) m.teams[batId].players = inn.players;
    if (inn.bowlers && inn.bowlers.length) m.teams[bowlId].bowlers = inn.bowlers;
  });
}

function getActiveMatch() {
  const m = state.matches.find(x => x.id === state.activeMatchId);
  if (m) ensureMatchInnings(m);
  return m;
}

function getActiveInning(m) {
  if (!m) return null;
  ensureMatchInnings(m);
  const idx = m.currentInningIdx != null ? m.currentInningIdx : (m.innings.length - 1);
  return m.innings[idx] || m.innings[0];
}

/**
 * Concludes the 1st Innings and initializes the 2nd Innings:
 * - Swaps batting and bowling teams
 * - Automatically sets Target = Innings 1 Runs + 1
 * - Pre-populates player rosters
 */
async function initSecondInnings(matchId) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);

  const inn1 = m.innings[0];
  inn1.completed = true;

  if (m.innings.length >= 2) {
    m.currentInningIdx = 1;
    m.updatedAt = Date.now();
    await db.saveMatch(m);
    renderLiveArea();
    toast('Switched to 2nd Innings.', 'success');
    return;
  }

  const nextBattingTeam = inn1.bowlingTeam;
  const nextBowlingTeam = inn1.battingTeam;
  const target = (inn1.runs || 0) + 1;
  const batMeta = getTeam(nextBattingTeam);
  const bowlMeta = getTeam(nextBowlingTeam);
  const hasRoster = (m.mode === 'detailed' || m.mode === 'post-detailed');

  const inn2 = {
    inningNum: 2,
    battingTeam: nextBattingTeam,
    bowlingTeam: nextBowlingTeam,
    runs: 0,
    wickets: 0,
    overs: 0,
    balls: 0,
    target: target,
    completed: false,
    striker: 0,
    bowler: 0,
    players: hasRoster
      ? (batMeta.members || []).map(m => ({ key: m, name: displayNameOf(batMeta.id, m), member: m, runs: 0, balls: 0, fours: 0, sixes: 0, out: false }))
      : [],
    bowlers: hasRoster
      ? (bowlMeta.members || []).map(m => ({ key: m, name: displayNameOf(bowlMeta.id, m), member: m, balls: 0, overs: 0, runs: 0, wickets: 0 }))
      : []
  };

  m.innings.push(inn2);
  m.currentInningIdx = 1;
  m.updatedAt = Date.now();
  syncMatchTotals(m);

  await db.saveMatch(m);
  renderLiveArea();
  toast('🎯 2nd Innings initialized! Target: ' + target + ' runs.', 'success');
}

async function setMatchInning(matchId, idx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);
  if (idx >= 0 && idx < m.innings.length) {
    m.currentInningIdx = idx;
    m.updatedAt = Date.now();
    await db.saveMatch(m);
    renderLiveArea();
  }
}

/* ---------- 8. Subscriptions, State & Header ---------- */
function rebuildTeams() {
  const merged = defaultTeams();
  Object.keys(state.teamDocs || {}).forEach(id => {
    merged[id] = Object.assign({}, merged[id] || {}, state.teamDocs[id]);
  });
  Object.keys(state.customTeams || {}).forEach(id => {
    merged[id] = Object.assign({}, merged[id] || {}, state.customTeams[id], { custom: true });
  });
  state.teams = merged;
}

function applyTeams(data) {
  state.teamDocs = data || {};
  rebuildTeams();
  populateLoginSelect();
  populateRegisterTeamSelect();
  renderAll();
}

function applyCustomTeams(data) {
  state.customTeams = data || {};
  rebuildTeams();
  populateLoginSelect();
  populateRegisterTeamSelect();
  renderAll();
}

function applyMatches(data) {
  state.matches = (data || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  state.matches.forEach(m => { ensureMatchInnings(m); syncMatchTotals(m); });

  if (isRecentLocalEdit()) {
    renderHeader();
    renderDashboard();
    renderHistory();
    renderAnalysis();
    renderTeam();
    return;
  }
  renderAll();
}

function applyVotes(data) {
  state.votes = data || {};
  renderAll();
}

function applyPlayers(data) {
  state.players = data || {};
  if (state.user) state.user.displayName = displayNameOf(state.user.teamId, state.user.member);
  populateLoginSelect();
  renderAll();
}

function renderAll() {
  renderHeader();
  if (!state.user) return;
  renderDashboard();
  renderMatchPanel();
  renderHistory();
  renderAnalysis();
  renderTeam();
}

/* ---------- 9. Authentication & User Profile ---------- */
function persistUser() {
  try { localStorage.setItem(LS.user, JSON.stringify(state.user)); } catch (e) {}
}
function restoreUser() {
  try {
    const v = localStorage.getItem(LS.user);
    if (v) {
      const u = JSON.parse(v);
      if (u && u.teamId && u.member) return u;
    }
  } catch (e) {}
  return null;
}

function populateLoginSelect() {
  const sel = document.getElementById('login-name');
  if (!sel) return;
  const prev = sel.value;
  const opts = Object.values(state.teams).map(t => {
    const members = t.members || [];
    return '<optgroup label="' + esc(t.name) + '">' +
      members.map(m => '<option value="' + esc(m) + '">' + esc(displayNameOf(t.id, m)) + '</option>').join('') +
    '</optgroup>';
  }).join('');

  sel.innerHTML = '<option value="" disabled' + (prev ? '' : ' selected') + '>Select your name…</option>' + opts;
  if (prev) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === prev) { sel.selectedIndex = i; break; }
    }
  }
}

function populateRegisterTeamSelect() {
  const sel = document.getElementById('reg-team');
  if (!sel) return;
  const prev = sel.value;
  const opts = Object.values(state.teams).map(t =>
    '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.custom ? ' (Custom)' : '') + '</option>'
  ).join('');

  sel.innerHTML = '<option value="" disabled' + (prev ? '' : ' selected') + '>Choose team…</option>' + opts;
  if (prev) sel.value = prev;
}

function handleLogin(name, code) {
  if (!name) return toast('Please select your name.', 'error');
  const team = Object.values(state.teams).find(t => (t.members || []).includes(name));
  if (!team) return toast('Player "' + esc(name) + '" not found in squad rosters.', 'error');
  if (team.secretCode !== (code || '').trim()) return toast('Invalid secret code for ' + team.name + '.', 'error');

  state.user = { teamId: team.id, member: name, displayName: displayNameOf(team.id, name) };
  persistUser();
  showSection('dashboard-section');
  renderAll();
  toast('Welcome back, ' + state.user.displayName + '! 🏏', 'success');
}

function logout() {
  state.user = null;
  state.activeMatchId = null;
  try { localStorage.removeItem(LS.user); } catch (e) {}
  showSection('login-section');
}

/* ---------- 9b. Player Registration (Login Screen) ---------- */
function toggleRegisterForm() {
  const form = document.getElementById('register-form');
  const btn = document.getElementById('register-toggle');
  if (!form || !btn) return;

  const isHidden = form.classList.contains('hidden');
  form.classList.toggle('hidden', !isHidden);
  btn.textContent = isHidden ? '✕ Cancel Registration' : '+ Register New Player';
  if (isHidden) {
    populateRegisterTeamSelect();
    const nameInput = document.getElementById('reg-name');
    if (nameInput) nameInput.focus();
  }
}

async function registerNewPlayer(e) {
  e.preventDefault();
  const nameEl = document.getElementById('reg-name');
  const tagEl = document.getElementById('reg-tag');
  const teamEl = document.getElementById('reg-team');

  const rawName = (nameEl.value || '').trim();
  const tag = (tagEl.value || '').trim();
  const teamId = teamEl.value;

  if (!rawName) return toast('Please enter the player name.', 'error');
  if (!teamId) return toast('Please select a team.', 'error');

  const team = getTeam(teamId);
  if (!team) return toast('Invalid team selected.', 'error');

  const pKey = memberKey(teamId, rawName);
  const displayName = tag ? (rawName + ' "' + tag + '"') : rawName;
  const profile = { displayName, name: rawName, tag, teamId, createdAt: Date.now() };

  // Save profile to /players
  state.players[pKey] = profile;
  await db.savePlayer(pKey, profile);

  // Add player to team roster if not already present
  if (!team.members) team.members = [];
  if (!team.members.includes(rawName)) {
    team.members.push(rawName);
    await db.saveTeam(teamId, team);
  }

  rebuildTeams();
  populateLoginSelect();

  // Auto-select the newly created player in login dropdown
  const loginName = document.getElementById('login-name');
  if (loginName) loginName.value = rawName;

  // Reset and hide register form
  nameEl.value = '';
  tagEl.value = '';
  toggleRegisterForm();

  toast('🎉 ' + displayName + ' registered to ' + team.name + '! Enter secret code to log in.', 'success');
  const codeInput = document.getElementById('login-code');
  if (codeInput) codeInput.focus();
}

/* ---------- 10. Navigation & Router ---------- */
function showSection(sectionId) {
  const sections = ['login-section', 'dashboard-section', 'match-setup-section', 'scoreboard-section', 'analysis-section', 'settings-section'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== sectionId);
  });
  const topbar = document.getElementById('topbar');
  if (topbar) topbar.classList.toggle('hidden', sectionId === 'login-section');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.section === sectionId));
}

function renderHeader() {
  const u = state.user;
  const whoami = document.getElementById('whoami');
  if (whoami) whoami.textContent = u ? u.displayName + ' · ' + getTeam(u.teamId).name : '';
}

function renderSyncStatus() {
  const online = db.mode === 'firestore';
  const error = online && state.syncError;
  const main = document.getElementById('sync-status');
  if (main) {
    if (error) {
      main.textContent = '● Error — check rules';
      main.className = 'sync-status error';
      main.title = 'Firestore is rejecting requests — deploy firestore.rules with anonymous auth enabled.';
    } else {
      main.textContent = online ? '● Live' : '● Local';
      main.className = 'sync-status ' + (online ? 'online' : 'local');
      main.title = online ? 'Connected to Firestore — live cross-device sync active' : 'Running in local fallback mode';
    }
  }
  const login = document.getElementById('login-sync');
  if (login) {
    login.textContent = error ? '● Firestore error — check rules' : (online ? '● Live Cloud Sync (Firestore)' : '● Local Mode (Offline Storage)');
    login.className = 'sync-status ' + (error ? 'error' : (online ? 'online' : 'local'));
  }
  const banner = document.getElementById('sync-error');
  if (banner) banner.classList.toggle('hidden', !error);
}

/* ---------- 11. Match Results & Summary Helpers ---------- */
function summaryLine(m) {
  ensureMatchInnings(m);
  return m.innings.map(inn => {
    const meta = getTeam(inn.battingTeam);
    return meta.short + ' ' + (inn.runs || 0) + '/' + (inn.wickets || 0) + (inn.balls ? ' (' + fmtOvers(inn.balls) + ' ov)' : '');
  }).join('  ·  ');
}

function resultOf(m) {
  ensureMatchInnings(m);
  if (!m.innings || m.innings.length === 0) return null;

  const inn1 = m.innings[0];
  const inn2 = m.innings[1];

  if (!inn2) {
    if (m.status === 'completed') {
      return { draw: false, completed: true, winnerName: '', text: 'Completed — ' + team1.name + ' ' + r1 + '/' + (inn1.wickets || 0) + ' in 1st Innings' };
    }
    return { draw: false, completed: false, inProgress: true, text: '1st Innings in progress' };
  }

  const r1 = inn1.runs || 0;
  const r2 = inn2.runs || 0;
  const team1 = getTeam(inn1.battingTeam);
  const team2 = getTeam(inn2.battingTeam);

  // If 2nd innings reached target
  if (r2 > r1) {
    const wktLeft = Math.max(0, 10 - (inn2.wickets || 0));
    return {
      draw: false,
      completed: true,
      winnerId: inn2.battingTeam,
      winnerName: team2.name,
      text: team2.name + ' won by ' + wktLeft + ' wicket' + (wktLeft === 1 ? '' : 's') + '!'
    };
  }

  // If match completed or 2nd innings all out / finished overs
  if (m.status === 'completed' || inn2.completed || inn2.wickets >= 10 || (m.maxOvers && inn2.balls >= m.maxOvers * 6)) {
    if (r1 > r2) {
      const runDiff = r1 - r2;
      return {
        draw: false,
        completed: true,
        winnerId: inn1.battingTeam,
        winnerName: team1.name,
        text: team1.name + ' won by ' + runDiff + ' run' + (runDiff === 1 ? '' : 's') + '!'
      };
    }
    if (r1 === r2) {
      return { draw: true, completed: true, winnerName: '', text: 'Match Tied / Drawn!' };
    }
  }

  // 2nd Innings in progress
  const needed = (r1 + 1) - r2;
  return {
    draw: false,
    completed: false,
    inProgress: true,
    text: team2.name + ' need ' + needed + ' runs to win'
  };
}

function matchSummaryHTML(m) {
  ensureMatchInnings(m);
  const res = resultOf(m);
  let badge = '';
  if (m.status === 'live') {
    badge = '<span class="badge badge-live"><span class="pulse" style="margin-right:4px"></span>Live</span>';
  } else if (res && res.draw) {
    badge = '<span class="badge badge-draw">Draw</span>';
  } else if (res && res.winnerName) {
    badge = '<span class="badge badge-won">Winner: ' + esc(res.winnerName) + '</span>';
  } else if (m.status === 'completed') {
    badge = '<span class="badge badge-won">Completed</span>';
  } else {
    badge = '<span class="badge badge-live">In Progress</span>';
  }

  return '' +
    '<div class="match-item glass">' +
      '<div class="m-top">' +
        '<div><div class="m-name">' + esc(m.name) + '</div><div class="m-date">' + fmtDate(m.createdAt) + ' · ' + modeLabel(m.mode) + '</div></div>' +
        '<div class="row">' + badge +
          '<button class="btn btn-sm btn-ghost" data-action="open-match" data-id="' + m.id + '">Scorecard →</button>' +
          (m.status === 'completed' ? '<button class="btn btn-sm btn-ghost" data-action="reopen-match" data-id="' + m.id + '" title="Re-open to edit">✏️</button>' : '') +
          '<button class="btn btn-sm btn-ghost" data-action="delete-match" data-id="' + m.id + '" title="Delete">🗑</button>' +
        '</div>' +
      '</div>' +
      '<div class="match-summary">' +
        m.innings.map(inn => {
          const meta = getTeam(inn.battingTeam);
          return '<div class="side"><div class="s-name">' + esc(meta.name) + ' (Inn ' + inn.inningNum + ')</div><div class="s-score">' + (inn.runs || 0) + '/' + (inn.wickets || 0) + '</div></div>';
        }).join('<div class="vs">vs</div>') +
      '</div>' +
      (res && res.text ? '<div class="muted mt" style="font-size:.82rem;font-weight:700">📢 ' + esc(res.text) + '</div>' : '') +
    '</div>';
}

/* ---------- 12. Dashboard View ---------- */
function renderDashboard() {
  const u = state.user; if (!u) return;
  const dashName = document.getElementById('dash-name');
  if (dashName) dashName.textContent = u.displayName;

  const team = getTeam(u.teamId);
  const captainName = team.captain ? displayNameOf(team.id, team.captain) : 'Not elected yet (Vote in Settings)';

  const dashTeam = document.getElementById('dash-team-card');
  if (dashTeam) {
    dashTeam.innerHTML =
      '<h3 class="card-title">Your Team</h3>' +
      '<div class="row">' +
        '<span class="badge badge-live" style="background:' + team.color + '33;color:' + team.color + '">' + esc(team.name) + '</span>' +
        (team.captain ? '<span class="badge badge-captain">👑 ' + esc(captainName) + ' (Captain)</span>' : '') +
      '</div>' +
      '<p class="mt" style="font-size:.88rem">👑 <strong>Active Captain:</strong> <span class="accent">' + esc(captainName) + '</span></p>' +
      '<p class="muted mt" style="font-size:.85rem">Members: ' + (team.members || []).map(m => esc(displayNameOf(team.id, m)) + (m === team.captain ? ' (C)' : '')).join(', ') + '</p>' +
      '<p class="muted" style="font-size:.85rem">Secret code: <code>' + esc(team.secretCode) + '</code></p>';
  }

  const live = state.matches.filter(m => m.status === 'live');
  const dashLive = document.getElementById('dash-live');
  if (dashLive) {
    dashLive.innerHTML =
      '<h3 class="card-title"><span class="pulse" style="margin-right:6px"></span>Live Scoreboards</h3>' +
      (live.length
        ? live.map(m =>
            '<div class="spread"><div><strong>' + esc(m.name) + '</strong><br/><span class="muted" style="font-size:.8rem">' + esc(summaryLine(m)) + ' · ' + modeLabel(m.mode) + '</span></div>' +
            '<button class="btn btn-sm" data-action="open-match" data-id="' + m.id + '">Open</button></div>' +
            '<hr style="border-color:rgba(255,255,255,.08);margin:10px 0" />').join('')
        : '<div class="empty" style="padding:18px 8px">No live match right now.</div>') +
      '<button class="btn btn-primary btn-block mt" data-action="go-match">＋ Start a Match</button>';
  }

  const recent = state.matches.filter(m => m.status === 'completed').slice(0, 3);
  const dashRecent = document.getElementById('dash-recent');
  if (dashRecent) {
    dashRecent.innerHTML =
      '<h3 class="card-title">Recent Matches</h3>' +
      (recent.length ? recent.map(matchSummaryHTML).join('') : '<div class="empty" style="padding:14px 8px">No completed matches yet.</div>');
  }
}

/* ---------- 13. Match Setup, Matchmaker & Dynamic Team Creator ---------- */
function renderMatchPanel() {
  const a = document.activeElement;
  if (a && (a.closest('#match-setup') || a.closest('#live-match') || a.closest('#match-team-builder'))) return;
  renderSetupForm();
  renderTeamBuilderCard();
  renderLiveArea();
}

function renderSetupForm() {
  const setupEl = document.getElementById('match-setup');
  if (!setupEl) return;

  const isCustomMatch = state.matchSetupType === 'custom';
  const allTeams = Object.values(state.teams);

  let teamSelectorHtml = '';
  if (isCustomMatch) {
    teamSelectorHtml =
      '<div class="grid grid-2 mt">' +
        '<label class="field"><span>Batting First (Team 1)</span>' +
          '<select id="match-team1" required>' +
            allTeams.map((t, i) => '<option value="' + esc(t.id) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(t.name) + (t.custom ? ' [Custom]' : '') + '</option>').join('') +
          '</select>' +
        '</label>' +
        '<label class="field"><span>Bowling First (Team 2)</span>' +
          '<select id="match-team2" required>' +
            allTeams.map((t, i) => '<option value="' + esc(t.id) + '"' + (i === 1 ? ' selected' : '') + '>' + esc(t.name) + (t.custom ? ' [Custom]' : '') + '</option>').join('') +
          '</select>' +
        '</label>' +
      '</div>' +
      '<label class="field"><span>Overs Per Innings</span>' +
        '<select id="match-overs">' +
          '<option value="0">Unlimited / Open Match</option>' +
          '<option value="5">5 Overs</option>' +
          '<option value="6">6 Overs</option>' +
          '<option value="8">8 Overs</option>' +
          '<option value="10" selected>10 Overs</option>' +
          '<option value="12">12 Overs</option>' +
          '<option value="15">15 Overs</option>' +
          '<option value="20">20 Overs</option>' +
        '</select>' +
      '</label>';
  }

  setupEl.innerHTML =
    '<h3 class="card-title">Match Setup &amp; Matchmaker</h3>' +
    '<div class="setup-type-toggle">' +
      '<button type="button" class="setup-type-btn' + (!isCustomMatch ? ' is-active' : '') + '" data-action="set-setup-type" data-type="standard">🏏 Standard Squad Match</button>' +
      '<button type="button" class="setup-type-btn' + (isCustomMatch ? ' is-active' : '') + '" data-action="set-setup-type" data-type="custom">⚔️ Custom Matchmaker</button>' +
    '</div>' +
    '<form data-form="start">' +
      '<label class="field"><span>Match Title</span><input id="match-name" type="text" placeholder="e.g. Thursday Night Derby" maxlength="60" required /></label>' +
      teamSelectorHtml +
      '<span class="field" style="margin-top:10px"><span>Scoring Engine Mode</span></span>' +
      '<div class="mode-group">' +
        '<div class="mode-option' + (uiMode === 'quick' ? ' is-selected' : '') + '" data-mode="quick"><div class="m-title">⚡ Quick Match</div><div class="m-desc">Fast multi-innings totals with automatic target &amp; RRR.</div></div>' +
        '<div class="mode-option' + (uiMode === 'detailed' ? ' is-selected' : '') + '" data-mode="detailed"><div class="m-title">📋 Live Detailed</div><div class="m-desc">Live ball-by-ball run pad, striker tracking &amp; over dots.</div></div>' +
        '<div class="mode-option' + (uiMode === 'retro' ? ' is-selected' : '') + '" data-mode="retro"><div class="m-title">🗂 Post-Match Retro</div><div class="m-desc">Log completed multi-innings runs, wickets and overs.</div></div>' +
        '<div class="mode-option' + (uiMode === 'post-detailed' ? ' is-selected' : '') + '" data-mode="post-detailed"><div class="m-title">📝 Post-Match Detailed</div><div class="m-desc">Complete player batting scorecard &amp; bowling figures.</div></div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-block">🚀 Start / Log Match</button>' +
    '</form>';
}

function teamCreatorFormHTML() {
  return '' +
    '<form data-form="create-team" class="team-creator">' +
      '<div class="grid grid-2">' +
        '<label class="field"><span>Team Name</span><input type="text" class="tc-name" placeholder="e.g. Colombo Lions" maxlength="35" required /></label>' +
        '<label class="field"><span>Short Tag</span><input type="text" class="tc-short" placeholder="e.g. CL" maxlength="4" style="text-transform:uppercase" required /></label>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><span>Primary Team Color</span>' +
          '<div class="color-field">' +
            '<input type="text" class="tc-color-hex" value="#38bdf8" placeholder="#38bdf8" />' +
            '<input type="color" class="tc-color" value="#38bdf8" />' +
          '</div>' +
        '</div>' +
        '<label class="field"><span>Team Secret Code</span><input type="text" class="tc-code" placeholder="e.g. Lions@2026" minlength="4" required /></label>' +
      '</div>' +
      '<div class="field" style="margin-top:8px"><span>Squad Roster (Enter Player Names)</span></div>' +
      '<div class="roster-builder roster-inputs">' +
        '<div class="roster-row"><input type="text" class="roster-member-input" placeholder="Player 1 (e.g. Nuwan)" required /></div>' +
        '<div class="roster-row"><input type="text" class="roster-member-input" placeholder="Player 2 (e.g. Kusal)" required /></div>' +
        '<div class="roster-row"><input type="text" class="roster-member-input" placeholder="Player 3 (e.g. Chamika)" required /></div>' +
      '</div>' +
      '<button type="button" class="btn btn-sm btn-ghost mt" data-action="add-roster-input">＋ Add Squad Member</button>' +
      '<button type="submit" class="btn btn-primary btn-block mt">Create &amp; Save Team</button>' +
    '</form>';
}

function renderTeamBuilderCard() {
  const el = document.getElementById('match-team-builder');
  if (!el) return;

  const customTeamsList = Object.values(state.customTeams || {});

  el.innerHTML =
    '<h3 class="card-title">🛡️ Dynamic Team Creator</h3>' +
    '<p class="muted" style="font-size:.85rem">Create custom cricket squads on the fly with custom colors, short tags and player rosters.</p>' +
    teamCreatorFormHTML() +
    (customTeamsList.length > 0
      ? '<h4 class="mt" style="font-size:.95rem">Active Custom Teams (' + customTeamsList.length + ')</h4>' +
        '<div class="team-grid">' +
          customTeamsList.map(t =>
            '<div class="team-chip">' +
              '<div class="team-chip-info">' +
                '<span class="swatch" style="background:' + (t.color || '#3b82f6') + '"></span>' +
                '<div>' +
                  '<div class="t-name">' + esc(t.name) + ' (' + esc(t.short) + ')</div>' +
                  '<div class="t-meta">' + (t.members || []).length + ' players · Code: ' + esc(t.secretCode) + '</div>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="btn btn-sm btn-ghost" data-action="delete-custom-team" data-id="' + t.id + '" title="Delete custom team">🗑</button>' +
            '</div>').join('') +
        '</div>'
      : '');
}

async function handleCreateTeam(e) {
  e.preventDefault();
  const form = e.target;
  const nameEl = form.querySelector('.tc-name');
  const shortEl = form.querySelector('.tc-short');
  const colorEl = form.querySelector('.tc-color');
  const codeEl = form.querySelector('.tc-code');

  const name = (nameEl.value || '').trim();
  const shortTag = (shortEl.value || '').trim().toUpperCase();
  const color = colorEl.value || '#38bdf8';
  const code = (codeEl.value || '').trim();

  const memberInputs = Array.from(form.querySelectorAll('.roster-member-input'));
  const members = memberInputs.map(inp => (inp.value || '').trim()).filter(Boolean);

  if (!name) return toast('Please enter a team name.', 'error');
  if (!shortTag) return toast('Please enter a short tag.', 'error');
  if (members.length < 2) return toast('A team must have at least 2 players.', 'error');
  if (code.length < 4) return toast('Secret code must be at least 4 characters.', 'error');

  const teamId = 'team_' + uid();
  const newTeam = {
    id: teamId,
    name,
    short: shortTag,
    color,
    secretCode: code,
    members,
    custom: true,
    createdAt: Date.now()
  };

  // Register all members in /players
  for (const m of members) {
    const pKey = memberKey(teamId, m);
    if (!state.players[pKey]) {
      const pProfile = { displayName: m, name: m, teamId, createdAt: Date.now() };
      state.players[pKey] = pProfile;
      await db.savePlayer(pKey, pProfile);
    }
  }

  await db.saveCustomTeam(teamId, newTeam);
  state.customTeams[teamId] = newTeam;
  rebuildTeams();

  populateLoginSelect();
  populateRegisterTeamSelect();
  if (document.activeElement) document.activeElement.blur();
  renderSetupForm();
  renderTeamBuilderCard();
  renderTeam();

  toast('🛡️ Team "' + name + '" successfully created and synced!', 'success');
}

function startMatch() {
  const nameEl = document.getElementById('match-name');
  const name = (nameEl.value || '').trim();
  if (!name) return toast('Please enter a match name.', 'error');

  const isCustomMatch = state.matchSetupType === 'custom';
  let t1Id = 'whiteTigers';
  let t2Id = 'blackPanthers';
  let maxOvers = 0;

  if (isCustomMatch) {
    const t1El = document.getElementById('match-team1');
    const t2El = document.getElementById('match-team2');
    const ovEl = document.getElementById('match-overs');
    t1Id = t1El ? t1El.value : 'whiteTigers';
    t2Id = t2El ? t2El.value : 'blackPanthers';
    maxOvers = ovEl ? parseInt(ovEl.value, 10) || 0 : 0;

    if (t1Id === t2Id) {
      return toast('Team 1 and Team 2 must be different teams.', 'error');
    }
  }

  const id = 'm_' + uid();
  const team1 = getTeam(t1Id);
  const team2 = getTeam(t2Id);
  const hasRoster = (uiMode === 'detailed' || uiMode === 'post-detailed');

  const inn1 = {
    inningNum: 1,
    battingTeam: t1Id,
    bowlingTeam: t2Id,
    runs: 0,
    wickets: 0,
    overs: 0,
    balls: 0,
    target: null,
    completed: false,
    striker: 0,
    bowler: 0,
    players: hasRoster
      ? (team1.members || []).map(m => ({ key: m, name: displayNameOf(t1Id, m), member: m, runs: 0, balls: 0, fours: 0, sixes: 0, out: false }))
      : [],
    bowlers: hasRoster
      ? (team2.members || []).map(m => ({ key: m, name: displayNameOf(t2Id, m), member: m, balls: 0, overs: 0, runs: 0, wickets: 0 }))
      : []
  };

  const teamsSummary = {};
  teamsSummary[t1Id] = { runs: 0, wickets: 0, overs: 0, players: inn1.players.slice(), bowlers: [] };
  teamsSummary[t2Id] = { runs: 0, wickets: 0, overs: 0, players: [], bowlers: inn1.bowlers.slice() };

  const match = {
    id,
    name,
    mode: uiMode,
    status: 'live',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    team1Id: t1Id,
    team2Id: t2Id,
    maxOvers: maxOvers,
    currentInningIdx: 0,
    innings: [inn1],
    teams: teamsSummary
  };

  db.saveMatch(match).then(() => {
    if (!state.matches.some(x => x.id === id)) state.matches.push(match);
    state.activeMatchId = id;
    if (nameEl) nameEl.value = '';
    showSection('scoreboard-section');
    renderMatchPanel();
    toast('Match "' + name + '" started — 1st Innings! 🏏', 'success');
  });
}

async function endMatch(id) {
  const m = state.matches.find(x => x.id === id); if (!m) return;
  if (!confirm('Finalize and save match "' + m.name + '"?')) return;
  m.status = 'completed';
  m.updatedAt = Date.now();
  ensureMatchInnings(m);
  m.innings.forEach(inn => { inn.completed = true; });
  syncMatchTotals(m);
  await db.saveMatch(m);
  renderMatchPanel();
  renderHistory();
  renderAnalysis();
  toast('Match completed & cloud synced! 🏆', 'success');
}

async function reopenMatch(id) {
  const m = state.matches.find(x => x.id === id); if (!m) return;
  m.status = 'live';
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  state.activeMatchId = id;
  showSection('scoreboard-section');
  renderMatchPanel();
  toast('Scorecard reopened for editing.', 'success');
}

async function deleteMatch(id) {
  const m = state.matches.find(x => x.id === id); if (!m) return;
  if (!confirm('Delete match "' + m.name + '"? This cannot be undone.')) return;
  await db.deleteMatch(id);
  if (state.activeMatchId === id) state.activeMatchId = null;
  renderMatchPanel();
  renderHistory();
  renderAnalysis();
  toast('Match deleted.', 'success');
}

/* ---------- 14. Live Multi-Innings Scoreboard Area ---------- */
function renderLiveArea() {
  const el = document.getElementById('live-match');
  if (!el) return;
  const live = state.matches.filter(m => m.status === 'live');

  if (state.activeMatchId) {
    const m = state.matches.find(x => x.id === state.activeMatchId);
    if (m) { el.innerHTML = liveHTML(m); return; }
    state.activeMatchId = null;
  }
  if (live.length) {
    el.innerHTML =
      '<h3 class="card-title"><span class="pulse"></span> Active / Live Matches</h3>' +
      live.map(m =>
        '<div class="match-item glass"><div class="m-top">' +
          '<div><div class="m-name">' + esc(m.name) + '</div><div class="m-date">' + fmtDate(m.updatedAt) + ' · ' + modeLabel(m.mode) + '</div></div>' +
          '<button class="btn btn-sm" data-action="open-match" data-id="' + m.id + '">Scorecard →</button>' +
        '</div></div>').join('');
    return;
  }
  el.innerHTML = '<div class="empty"><span class="e-emoji">🏏</span>No active scoreboard right now.<br/>Start or select a match above to begin scoring.</div>';
}

function liveHTML(m) {
  ensureMatchInnings(m);
  const activeInning = getActiveInning(m);
  const currentIdx = m.currentInningIdx != null ? m.currentInningIdx : (m.innings.length - 1);
  const isInning2 = currentIdx === 1 || activeInning.inningNum === 2;

  const batTeam = getTeam(activeInning.battingTeam);
  const bowlTeam = getTeam(activeInning.bowlingTeam);

  // Innings Switcher Tabs
  const inningsTabsHtml =
    '<div class="innings-tabs">' +
      m.innings.map((inn, i) => {
        const innTeam = getTeam(inn.battingTeam);
        const isActive = i === currentIdx;
        const isCompleted = inn.completed;
        return '' +
          '<button type="button" class="innings-tab' + (isActive ? ' is-active' : '') + (isCompleted ? ' is-completed' : '') + '" data-action="switch-inning" data-id="' + m.id + '" data-idx="' + i + '">' +
            'Innings ' + inn.inningNum + ': ' + esc(innTeam.short) + ' (' + (inn.runs || 0) + '/' + (inn.wickets || 0) + ')' +
            (isCompleted ? ' ✓' : '') +
          '</button>';
      }).join('') +
      (m.innings.length === 1 && m.status === 'live'
        ? '<button type="button" class="btn btn-sm btn-ghost" data-action="init-second-innings" data-id="' + m.id + '">＋ Start 2nd Innings</button>'
        : '') +
    '</div>';

  // Target & Required Run Rate Calculation
  let targetBannerHtml = '';
  if (isInning2 && activeInning.target) {
    const target = activeInning.target;
    const runsNeeded = Math.max(0, target - (activeInning.runs || 0));
    const ballsBowled = activeInning.balls || 0;
    const crr = ballsBowled > 0 ? (activeInning.runs / (ballsBowled / 6)).toFixed(2) : '0.00';

    let rrrText = '';
    let ballsRemainingText = '';
    if (m.maxOvers && m.maxOvers > 0) {
      const maxBalls = m.maxOvers * 6;
      const ballsRem = Math.max(0, maxBalls - ballsBowled);
      ballsRemainingText = ' · ' + ballsRem + ' balls left';
      const rrr = ballsRem > 0 ? (runsNeeded / (ballsRem / 6)).toFixed(2) : (runsNeeded > 0 ? 'Req: ∞' : '0.00');
      rrrText = '<span class="target-badge">RRR: ' + rrr + '</span>';
    }

    if (activeInning.runs >= target) {
      targetBannerHtml =
        '<div class="target-banner is-won">' +
          '<div class="target-title">🎉 Target Achieved! ' + esc(batTeam.name) + ' won by ' + Math.max(0, 10 - (activeInning.wickets || 0)) + ' wickets!</div>' +
          '<div class="target-stats"><span class="target-badge">Score: ' + (activeInning.runs || 0) + '/' + (activeInning.wickets || 0) + '</span><span class="target-badge">Target: ' + target + '</span></div>' +
        '</div>';
    } else if (activeInning.wickets >= 10 || (m.maxOvers && ballsBowled >= m.maxOvers * 6)) {
      targetBannerHtml =
        '<div class="target-banner is-out">' +
          '<div class="target-title">🔴 All Out! ' + esc(bowlTeam.name) + ' won by ' + Math.max(0, (target - 1) - activeInning.runs) + ' runs!</div>' +
          '<div class="target-stats"><span class="target-badge">Score: ' + (activeInning.runs || 0) + '/' + (activeInning.wickets || 0) + '</span><span class="target-badge">Target: ' + target + '</span></div>' +
        '</div>';
    } else {
      targetBannerHtml =
        '<div class="target-banner">' +
          '<div class="target-title">🎯 Target: <strong>' + target + ' runs</strong> (' + esc(batTeam.name) + ' need <strong>' + runsNeeded + ' runs</strong>' + ballsRemainingText + ')</div>' +
          '<div class="target-stats">' +
            '<span class="target-badge">CRR: ' + crr + '</span>' +
            rrrText +
          '</div>' +
        '</div>';
    }
  }

  // Next Innings CTA Banner (when 1st innings is active)
  let nextInningsBannerHtml = '';
  if (currentIdx === 0 && m.innings.length === 1 && m.status === 'live') {
    nextInningsBannerHtml =
      '<div class="init-innings-box">' +
        '<h4>🏁 1st Innings Concluded?</h4>' +
        '<p>Initialize 2nd Innings: sets Target to <strong>' + ((activeInning.runs || 0) + 1) + ' runs</strong> and swaps sides for ' + esc(bowlTeam.name) + '.</p>' +
        '<button type="button" class="btn btn-primary" data-action="init-second-innings" data-id="' + m.id + '">⚡ Initialize 2nd Innings (Target: ' + ((activeInning.runs || 0) + 1) + ')</button>' +
      '</div>';
  }

  // Header controls
  const headerAction = m.status === 'live'
    ? '<button class="btn btn-danger btn-sm" data-action="end-match" data-id="' + m.id + '">🏁 Finalize Match</button>'
    : '<div class="row"><span class="badge badge-won">✓ Completed</span><button class="btn btn-sm btn-ghost" data-action="reopen-match" data-id="' + m.id + '" title="Reopen match to edit">✏️ Edit</button></div>';

  // Active Innings Team Card
  const canEdit = m.status === 'live';
  const cardHtml = inningCardHTML(m, activeInning, currentIdx, canEdit);

  return '' +
    '<div class="spread">' +
      '<div><div class="row">' + (m.status === 'live' ? '<span class="pulse"></span>' : '') + '<h3 class="card-title" style="margin:0">' + esc(m.name) + '</h3></div>' +
      '<div class="muted" style="font-size:.82rem">' + modeLabel(m.mode) + ' · ' + (m.maxOvers ? m.maxOvers + ' overs · ' : '') + 'updated ' + fmtDate(m.updatedAt) + '</div></div>' +
      headerAction +
    '</div>' +
    '<div class="innings-bar mt">' +
      '<div class="innings-bar-header">' +
        '<div><strong>Active Inning:</strong> Innings ' + activeInning.inningNum + ' (' + esc(batTeam.name) + ' Batting)</div>' +
        inningsTabsHtml +
      '</div>' +
      targetBannerHtml +
    '</div>' +
    cardHtml +
    nextInningsBannerHtml;
}

function inningCardHTML(m, inn, inningIdx, canEdit) {
  const tid = inn.battingTeam;
  const meta = getTeam(tid);
  const bowlMeta = getTeam(inn.bowlingTeam);
  const color = meta.color || '#3b82f6';
  const mode = m.mode;

  let body = '';
  if (mode === 'quick') {
    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (inn.runs || 0) + '</span><span class="score-meta">/ ' + (inn.wickets || 0) + ' wickets</span></div>' +
      '<div class="grid grid-2 mt">' +
        '<label class="field"><span>Team Runs</span><input type="number" min="0" inputmode="numeric" value="' + (inn.runs || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-field="runs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Wickets Fallen</span><input type="number" min="0" max="10" inputmode="numeric" value="' + (inn.wickets || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-field="wickets"' + (canEdit ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Overs Bowled</span><input type="number" step="0.1" min="0" inputmode="decimal" value="' + ((inn.balls || 0) / 6) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-field="overs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
      '</div>';
  } else if (mode === 'post-detailed') {
    const rows = (inn.players || []).map((p, i) => {
      const label = playerLabel(p, tid);
      const nameHtml = p.member
        ? '<div class="pd-name"><span class="badge badge-you" style="font-size:.7rem;padding:2px 8px">' + esc(meta.short) + '</span> ' + esc(label) + '</div>'
        : '<div class="row" style="flex:1"><input type="text" value="' + esc(p.name) + '" data-rename data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" class="p-name-input" placeholder="Player name" /><button type="button" class="btn btn-sm btn-ghost" data-action="remove-player" data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" title="Remove">✕</button></div>';
      const sr = p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';

      return '' +
        '<div class="player-detailed-card' + (p.out ? ' is-dismissed' : '') + '">' +
          '<div class="pd-header">' +
            nameHtml +
            '<span class="pd-sr">SR: ' + sr + '</span>' +
          '</div>' +
          '<div class="pd-inputs">' +
            '<div class="pd-input-wrap"><label>Runs</label><input type="number" min="0" inputmode="numeric" value="' + (p.runs || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="runs"' + (canEdit ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>Balls</label><input type="number" min="0" inputmode="numeric" value="' + (p.balls || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="balls"' + (canEdit ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>4s</label><input type="number" min="0" inputmode="numeric" value="' + (p.fours || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="fours"' + (canEdit ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>6s</label><input type="number" min="0" inputmode="numeric" value="' + (p.sixes || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="sixes"' + (canEdit ? '' : ' disabled') + ' /></div>' +
          '</div>' +
          '<div class="pd-footer">' +
            '<label class="pd-status-toggle' + (p.out ? ' is-out' : ' not-out') + '">' +
              '<input type="checkbox" data-out data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '"' + (p.out ? ' checked' : '') + (canEdit ? '' : ' disabled') + ' />' +
              '<span>' + (p.out ? '❌ Out (Dismissed)' : '🏏 Not Out') + '</span>' +
            '</label>' +
          '</div>' +
        '</div>';
    }).join('');

    const bowlingRows = (inn.bowlers || []).map((b, i) => {
      const bLabel = b.member ? displayNameOf(inn.bowlingTeam, b.member) : b.name;
      const balls = b.balls || 0;
      const oversVal = fmtOvers(balls);
      const econ = balls > 0 ? (b.runs / (balls / 6)).toFixed(1) : '0.0';

      const nameHtml = b.member
        ? '<div class="bd-name">' + esc(bLabel) + '</div>'
        : '<div class="row" style="flex:1"><input type="text" value="' + esc(b.name) + '" data-rename-bowler data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" class="p-name-input" placeholder="Bowler name" /><button type="button" class="btn btn-sm btn-ghost" data-action="remove-bowler" data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" title="Remove">✕</button></div>';

      return '' +
        '<div class="bowl-detailed-card">' +
          '<div class="bd-header">' +
            nameHtml +
            '<div class="bd-econ">Econ: ' + econ + '</div>' +
          '</div>' +
          '<div class="bd-inputs">' +
            '<div class="pd-input-wrap"><label>Overs (e.g. 2.4)</label><input type="number" step="0.1" min="0" inputmode="decimal" value="' + oversVal + '" data-bowl data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="overs"' + (canEdit ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>Runs</label><input type="number" min="0" inputmode="numeric" value="' + (b.runs || 0) + '" data-bowl data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="runs"' + (canEdit ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>Wickets</label><input type="number" min="0" inputmode="numeric" value="' + (b.wickets || 0) + '" data-bowl data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="wickets"' + (canEdit ? '' : ' disabled') + ' /></div>' +
          '</div>' +
        '</div>';
    }).join('');

    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (inn.runs || 0) + '</span><span class="score-meta">/ ' + (inn.wickets || 0) + ' wickets</span></div>' +
      '<div class="scorecard-subhead"><span>🏏 Batting Scorecard (' + esc(meta.name) + ')</span>' + (canEdit ? '<button type="button" class="btn btn-sm btn-ghost" data-action="add-player" data-match="' + m.id + '" data-inning="' + inningIdx + '">＋ Add Batter</button>' : '') + '</div>' +
      '<div>' + (rows || '<div class="empty" style="padding:12px">No batters yet.</div>') + '</div>' +
      '<div class="scorecard-subhead mt"><span>🎯 Bowling Figures (' + esc(bowlMeta.name) + ')</span>' + (canEdit ? '<button type="button" class="btn btn-sm btn-ghost" data-action="add-bowler" data-match="' + m.id + '" data-inning="' + inningIdx + '">＋ Add Bowler</button>' : '') + '</div>' +
      '<div>' + (bowlingRows || '<div class="empty" style="padding:12px">No bowlers yet.</div>') + '</div>';
  } else if (mode === 'retro') {
    const rows = (inn.players || []).map((p, i) => {
      const label = playerLabel(p, tid);
      const nameHtml = p.member
        ? '<div class="p-name">' + esc(label) + '</div>'
        : '<input type="text" value="' + esc(p.name) + '" data-rename data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" class="p-name-input" placeholder="Player name" />';
      return '' +
        '<div class="player-row">' + nameHtml +
          '<div class="p-inputs">' +
            '<label>Runs<input type="number" min="0" inputmode="numeric" value="' + (p.runs || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="runs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
            '<label>Balls<input type="number" min="0" inputmode="numeric" value="' + (p.balls || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="balls"' + (canEdit ? '' : ' disabled') + ' /></label>' +
            '<label>4s<input type="number" min="0" inputmode="numeric" value="' + (p.fours || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="fours"' + (canEdit ? '' : ' disabled') + ' /></label>' +
            '<label>6s<input type="number" min="0" inputmode="numeric" value="' + (p.sixes || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="sixes"' + (canEdit ? '' : ' disabled') + ' /></label>' +
          '</div>' +
          '<label class="p-out' + (p.out ? ' is-out' : '') + '"><input type="checkbox" data-out data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '"' + (p.out ? ' checked' : '') + (canEdit ? '' : ' disabled') + ' /> Out (dismissed)</label>' +
        '</div>';
    }).join('');

    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (inn.runs || 0) + '</span><span class="score-meta">/ ' + (inn.wickets || 0) + ' wickets</span></div>' +
      '<div class="grid grid-2 mt">' +
        '<label class="field"><span>Team Runs</span><input type="number" min="0" inputmode="numeric" value="' + (inn.runs || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-field="runs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Wickets Fallen</span><input type="number" min="0" max="10" inputmode="numeric" value="' + (inn.wickets || 0) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-field="wickets"' + (canEdit ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Overs Bowled</span><input type="number" step="0.1" min="0" inputmode="decimal" value="' + ((inn.balls || 0) / 6) + '" data-score data-match="' + m.id + '" data-inning="' + inningIdx + '" data-field="overs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
      '</div>' +
      '<div class="mt">' + rows + '</div>' +
      (canEdit ? '<button type="button" class="btn btn-sm btn-ghost mt" data-action="add-player" data-match="' + m.id + '" data-inning="' + inningIdx + '">＋ Add Player</button>' : '');
  } else {
    // Detailed Mode
    const striker = inn.striker || 0;
    const rows = (inn.players || []).map((p, i) => {
      const isStriker = i === striker;
      const label = playerLabel(p, tid);
      const clickAttr = canEdit ? ' data-action="set-striker" data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '"' : '';
      return '' +
        '<div class="prow' + (isStriker ? ' is-striker' : '') + (p.out ? ' is-out' : '') + '"' + clickAttr + '>' +
          '<div class="p-name">' + esc(label) +
            (isStriker ? ' <span class="badge badge-live">batting</span>' : '') +
            (p.out ? ' <span class="badge badge-lost">out</span>' : '') +
          '</div>' +
          '<div class="p-stat">' + (p.runs || 0) + ' runs · ' + (p.balls || 0) + ' balls' + (p.fours ? ' · ' + p.fours + '×4' : '') + (p.sixes ? ' · ' + p.sixes + '×6' : '') + '</div>' +
        '</div>';
    }).join('');

    const strikerName = (inn.players[striker] && playerLabel(inn.players[striker], tid)) || '—';
    const runpad = canEdit
      ? '<div class="runpad">' +
          [0, 1, 2, 3, 4, 6].map(r => '<button type="button" class="run-btn" data-action="ball" data-match="' + m.id + '" data-inning="' + inningIdx + '" data-runs="' + r + '">' + r + '</button>').join('') +
          '<button type="button" class="run-btn wicket" data-action="wicket" data-match="' + m.id + '" data-inning="' + inningIdx + '">W</button>' +
          '<button type="button" class="run-btn undo" data-action="undo" data-match="' + m.id + '" data-inning="' + inningIdx + '">↩</button>' +
        '</div>'
      : '';

    const bowling = '<div class="card-title mt">🎯 Bowling (' + esc(bowlMeta.name) + ')</div>' +
      '<div class="bowlers">' + (inn.bowlers || []).map((b, i) =>
        '<div class="bowl-row">' +
          '<div class="b-name">' + esc(b.member ? displayNameOf(inn.bowlingTeam, b.member) : b.name) + '</div>' +
          '<div class="b-overs">' + fmtOvers(b.balls || 0) + ' ov</div>' +
          '<div class="b-inputs">' +
            '<label>Overs<input type="number" step="0.1" min="0" inputmode="decimal" value="' + fmtOvers(b.balls || 0) + '" data-bowl data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="overs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
            '<label>Runs<input type="number" min="0" inputmode="numeric" value="' + (b.runs || 0) + '" data-bowl data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="runs"' + (canEdit ? '' : ' disabled') + ' /></label>' +
            '<label>Wkts<input type="number" min="0" inputmode="numeric" value="' + (b.wickets || 0) + '" data-bowl data-match="' + m.id + '" data-inning="' + inningIdx + '" data-idx="' + i + '" data-field="wickets"' + (canEdit ? '' : ' disabled') + ' /></label>' +
          '</div>' +
        '</div>').join('') + '</div>';

    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (inn.runs || 0) + '</span>' +
      '<span class="score-meta">/ <span id="wkts-' + tid + '">' + (inn.wickets || 0) + '</span> · <span id="overs-' + tid + '">' + fmtOvers(totalBalls(inn)) + '</span> ov</span></div>' +
      '<div class="batting-line" id="batting-' + tid + '">Batting: <strong>' + esc(strikerName) + '</strong></div>' +
      '<div class="over-dots" id="dots-' + tid + '">' + overDots(totalBalls(inn)) + '</div>' +
      runpad +
      '<div class="batters" id="batters-' + tid + '">' + rows + '</div>' +
      bowling +
      (canEdit ? '<button type="button" class="btn btn-sm btn-ghost mt" data-action="add-bowler" data-match="' + m.id + '" data-inning="' + inningIdx + '">＋ Add Bowler</button>' : '') +
      (canEdit ? '<button type="button" class="btn btn-sm btn-ghost mt" data-action="add-player" data-match="' + m.id + '" data-inning="' + inningIdx + '">＋ Add Batter</button>' : '');
  }

  return '' +
    '<div class="glass card team-card" style="border-top-color:' + color + '">' +
      '<div class="t-head">' +
        '<span class="t-name">' + esc(meta.name) + ' (Innings ' + inn.inningNum + ')' + '</span>' +
        '<span class="badge badge-live">Batting</span>' +
      '</div>' +
      body +
    '</div>';
}

function recomputeInning(inn) {
  if (inn.players && inn.players.length) {
    inn.runs = inn.players.reduce((s, p) => s + (+p.runs || 0), 0);
    inn.wickets = inn.players.filter(p => p.out).length;
    inn.balls = inn.players.reduce((s, p) => s + (+p.balls || 0), 0);
    inn.overs = inn.balls ? (inn.balls / 6) : 0;
  }
}

/* ---------- 15. Ball-by-Ball Live Scoring Engine ---------- */
function nextAvailable(inn, from) {
  const n = (inn.players || []).length;
  if (!n) return 0;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (!inn.players[i].out) return i;
  }
  return from % n;
}

function normalizeStriker(inn) {
  const n = (inn.players || []).length;
  if (!n) return 0;
  let s = (inn.striker || 0) % n;
  if (inn.players[s].out) s = nextAvailable(inn, s);
  inn.striker = s;
  return s;
}

function snapshotInning(inn) {
  return {
    runs: inn.runs,
    wickets: inn.wickets,
    balls: inn.balls,
    striker: inn.striker || 0,
    players: (inn.players || []).map(p => ({
      runs: p.runs || 0, balls: p.balls || 0, fours: p.fours || 0, sixes: p.sixes || 0, out: !!p.out
    }))
  };
}

function pushUndo(matchId, inningIdx, inn) {
  const m = undoStack[matchId] || (undoStack[matchId] = {});
  const stack = m[inningIdx] || (m[inningIdx] = []);
  stack.push(snapshotInning(inn));
  if (stack.length > 25) stack.shift();
}

function applyBall(matchId, inningIdx, runs) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m || m.status !== 'live') return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn) return;

  const idx = normalizeStriker(inn);
  const p = inn.players[idx];
  if (!p) return toast('Please add a batter first.', 'error');
  if (p.out) return toast(esc(p.name) + ' is out — tap another batter.', 'error');

  pushUndo(m.id, inningIdx, inn);
  p.runs = (p.runs || 0) + runs;
  p.balls = (p.balls || 0) + 1;
  if (runs === 4) p.fours = (p.fours || 0) + 1;
  if (runs === 6) p.sixes = (p.sixes || 0) + 1;

  recomputeInning(inn);
  syncMatchTotals(m);
  m.updatedAt = Date.now();

  markLocalEdit();
  db.saveMatch(m);
  renderLiveArea();
}

function applyWicket(matchId, inningIdx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m || m.status !== 'live') return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn) return;

  const idx = normalizeStriker(inn);
  const p = inn.players[idx];
  if (!p) return;
  if (p.out) return toast(esc(p.name) + ' is already out.', 'error');

  pushUndo(m.id, inningIdx, inn);
  p.out = true;
  p.balls = (p.balls || 0) + 1;
  inn.striker = nextAvailable(inn, (idx + 1) % (inn.players.length || 1));

  recomputeInning(inn);
  syncMatchTotals(m);
  m.updatedAt = Date.now();

  markLocalEdit();
  db.saveMatch(m);
  renderLiveArea();
}

function setStriker(matchId, inningIdx, idx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn || !inn.players[idx]) return;
  if (inn.players[idx].out) return toast('That batter is out.', 'error');

  inn.striker = idx;
  m.updatedAt = Date.now();
  markLocalEdit();
  db.saveMatch(m);
  renderLiveArea();
}

function undoBall(matchId, inningIdx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  const stack = undoStack[m.id] && undoStack[m.id][inningIdx];
  if (!stack || !stack.length) return toast('Nothing to undo.', 'error');

  const snap = stack.pop();
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  inn.runs = snap.runs;
  inn.wickets = snap.wickets;
  inn.balls = snap.balls;
  inn.striker = snap.striker;

  (inn.players || []).forEach((p, i) => {
    const s = snap.players[i];
    if (s) { p.runs = s.runs; p.balls = s.balls; p.fours = s.fours; p.sixes = s.sixes; p.out = s.out; }
  });

  syncMatchTotals(m);
  m.updatedAt = Date.now();
  markLocalEdit();
  db.saveMatch(m);
  renderLiveArea();
}

/* ---------- 16. Inning Roster Management (Add/Remove) ---------- */
async function addPlayerToInning(matchId, inningIdx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn) return;
  if (!inn.players) inn.players = [];

  inn.players.push({
    key: 'guest-' + uid(),
    name: 'Player ' + (inn.players.length + 1),
    member: null,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    out: false
  });

  m.updatedAt = Date.now();
  syncMatchTotals(m);
  await db.saveMatch(m);
  renderLiveArea();
}

async function addBowlerToInning(matchId, inningIdx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn) return;
  if (!inn.bowlers) inn.bowlers = [];

  inn.bowlers.push({
    key: 'guest-bowl-' + uid(),
    name: 'Bowler ' + (inn.bowlers.length + 1),
    member: null,
    balls: 0,
    overs: 0,
    runs: 0,
    wickets: 0
  });

  m.updatedAt = Date.now();
  syncMatchTotals(m);
  await db.saveMatch(m);
  renderLiveArea();
}

async function removePlayerFromInning(matchId, inningIdx, idx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn || !inn.players) return;
  inn.players.splice(idx, 1);
  recomputeInning(inn);
  syncMatchTotals(m);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}

async function removeBowlerFromInning(matchId, inningIdx, idx) {
  const m = state.matches.find(x => x.id === matchId);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[inningIdx];
  if (!inn || !inn.bowlers) return;
  inn.bowlers.splice(idx, 1);
  m.updatedAt = Date.now();
  syncMatchTotals(m);
  await db.saveMatch(m);
  renderLiveArea();
}

/* ---------- 17. Input Field Handlers (Score, Bowler, Out, Rename) ---------- */
function updateScoreLocal(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;

  const val = Math.max(0, parseInt(el.value, 10) || 0);
  if (m.mode === 'quick' || m.mode === 'retro') {
    if (el.dataset.field === 'overs') {
      inn.balls = parseOversToBalls(el.value);
      inn.overs = inn.balls / 6;
    } else {
      inn[el.dataset.field] = val;
    }
  } else {
    const p = inn.players && inn.players[+el.dataset.idx];
    if (!p) return;
    p[el.dataset.field] = val;
    recomputeInning(inn);
  }
  syncMatchTotals(m);
}

async function saveScoreField(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;

  const val = Math.max(0, parseInt(el.value, 10) || 0);
  if (m.mode === 'quick' || m.mode === 'retro') {
    if (el.dataset.field === 'overs') {
      inn.balls = parseOversToBalls(el.value);
      inn.overs = inn.balls / 6;
    } else {
      inn[el.dataset.field] = val;
    }
  } else {
    const p = inn.players && inn.players[+el.dataset.idx];
    if (p) {
      p[el.dataset.field] = val;
      recomputeInning(inn);
    }
  }
  syncMatchTotals(m);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}

function updateBowlerLocal(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;
  const b = (inn.bowlers || [])[+el.dataset.idx];
  if (!b) return;

  if (el.dataset.field === 'overs') {
    b.balls = parseOversToBalls(el.value);
    b.overs = parseFloat(el.value) || 0;
  } else {
    b[el.dataset.field] = Math.max(0, parseInt(el.value, 10) || 0);
  }
}

async function saveBowlerField(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;
  const b = (inn.bowlers || [])[+el.dataset.idx];
  if (!b) return;

  if (el.dataset.field === 'overs') {
    b.balls = parseOversToBalls(el.value);
    b.overs = parseFloat(el.value) || 0;
  } else {
    b[el.dataset.field] = Math.max(0, parseInt(el.value, 10) || 0);
  }
  syncMatchTotals(m);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}

async function toggleOut(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;
  const p = inn.players && inn.players[+el.dataset.idx];
  if (!p) return;

  p.out = el.checked;
  recomputeInning(inn);
  syncMatchTotals(m);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}

async function renamePlayer(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;
  const p = inn.players && inn.players[+el.dataset.idx];
  if (!p) return;

  const name = (el.value || '').trim();
  if (name) { p.name = name; if (!p.member) p.key = name; }
  syncMatchTotals(m);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}

async function renameBowler(el) {
  const m = state.matches.find(x => x.id === el.dataset.match);
  if (!m) return;
  ensureMatchInnings(m);
  const inn = m.innings[+el.dataset.inning];
  if (!inn) return;
  const b = (inn.bowlers || [])[+el.dataset.idx];
  if (!b) return;

  const name = (el.value || '').trim();
  if (name) { b.name = name; if (!b.member) b.key = name; }
  syncMatchTotals(m);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}

/* ---------- 18. Match History ---------- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  if (!state.matches.length) {
    el.innerHTML = '<div class="empty"><span class="e-emoji">📭</span>No matches recorded yet. Start one from the Match tab.</div>';
    return;
  }
  el.innerHTML = state.matches.map(matchSummaryHTML).join('');
}

/* ---------- 19. Analysis, Charts & Automatic Awards ---------- */
function getMatchesForFilter(filter) {
  if (filter === '__series__') return state.matches;
  if (filter === '__this_week__') {
    const now = new Date();
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const threshold = Math.min(monday.getTime(), Date.now() - (7 * 24 * 60 * 60 * 1000));
    return state.matches.filter(m => (m.createdAt || 0) >= threshold);
  }
  if (filter === '__last_match__') {
    const completed = state.matches.filter(m => m.status === 'completed').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const last = completed[0] || state.matches[0];
    return last ? [last] : [];
  }
  const single = state.matches.find(m => m.id === filter);
  return single ? [single] : [];
}

function renderAnalysis() {
  const sel = document.getElementById('chart-select');
  if (!sel) return;
  const prev = sel.value;

  const chronoMatches = state.matches.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  let html = '';
  html += '<optgroup label="Summary Totals">';
  html += '<option value="__series__">🏆 Series Total (all matches combined)</option>';
  html += '<option value="__this_week__">📅 This Week (current calendar week)</option>';
  html += '<option value="__last_match__">⚡ Last Match (most recent)</option>';
  html += '</optgroup>';

  if (chronoMatches.length > 0) {
    html += '<optgroup label="Individual Matches">';
    chronoMatches.forEach((m, idx) => {
      const statusIcon = m.status === 'live' ? '🔴 LIVE: ' : '🏏 ';
      html += '<option value="' + esc(m.id) + '">' + statusIcon + 'Match #' + (idx + 1) + ': ' + esc(m.name) + ' (' + fmtDate(m.createdAt) + ')</option>';
    });
    html += '</optgroup>';
  }

  sel.innerHTML = html;
  if (prev && (prev === '__series__' || prev === '__this_week__' || prev === '__last_match__' || chronoMatches.some(m => m.id === prev))) {
    sel.value = prev;
  } else {
    sel.value = '__series__';
  }

  renderCharts();
  renderAwards();
}

function drawPie(id, existing, labels, data, colors) {
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  if (typeof Chart === 'undefined') {
    ctx.parentElement.innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">Chart library unavailable.</div>';
    return null;
  }
  if (existing) { try { existing.destroy(); } catch (e) {} }
  if (!data.length || data.every(v => v === 0)) {
    return new Chart(ctx, {
      type: 'pie',
      data: { labels: ['No data yet'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.08)'], borderColor: 'rgba(5,7,13,0.6)', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
  }
  return new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: 'rgba(5,7,13,0.6)', borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: function(item) {
              const total = item.dataset.data.reduce((a, b) => a + b, 0);
              const val = item.raw || 0;
              const pct = total ? Math.round((val / total) * 100) : 0;
              return ' ' + item.label + ': ' + val + ' runs (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

function renderCharts() {
  const selEl = document.getElementById('chart-select');
  const sel = selEl ? selEl.value : '__series__';
  const filteredMatches = getMatchesForFilter(sel);

  // 1. Team Performance Pie Chart
  const teamLabels = [];
  const teamData = [];
  const teamColors = [];

  Object.values(state.teams).forEach(t => {
    teamLabels.push(t.name);
    const teamRuns = filteredMatches.reduce((sum, m) => {
      ensureMatchInnings(m);
      const mRuns = (m.innings || [])
        .filter(inn => inn.battingTeam === t.id)
        .reduce((s, inn) => s + (+inn.runs || 0), 0);
      return sum + mRuns;
    }, 0);
    teamData.push(teamRuns);
    teamColors.push(t.color || '#3b82f6');
  });

  chartTeam = drawPie('pie-team', chartTeam, teamLabels, teamData, teamColors);

  // 2. Player Run Distribution Pie Chart
  const note = document.getElementById('player-chart-note');
  const playerMap = {};

  filteredMatches.forEach(m => {
    ensureMatchInnings(m);
    (m.innings || []).forEach(inn => {
      const meta = getTeam(inn.battingTeam);
      (inn.players || []).forEach(p => {
        const runs = +p.runs || 0;
        if (runs > 0) {
          const key = p.member || p.name;
          const label = playerLabel(p, inn.battingTeam);
          if (!playerMap[key]) {
            playerMap[key] = { label, runs: 0, color: meta.color || '#3b82f6' };
          }
          playerMap[key].runs += runs;
        }
      });
    });
  });

  const playerEntries = Object.values(playerMap);
  const pLabels = playerEntries.map(x => x.label);
  const pData = playerEntries.map(x => x.runs);
  const pColors = playerEntries.map(x => x.color);

  chartPlayers = drawPie('pie-players', chartPlayers, pLabels, pData, pColors);

  if (note) {
    if (pLabels.length > 0) {
      if (sel === '__series__') note.textContent = 'Series run distribution across all detailed & post-match games.';
      else if (sel === '__this_week__') note.textContent = 'Player runs scored in this week’s matches.';
      else if (sel === '__last_match__') note.textContent = 'Player runs scored in the most recent match.';
      else note.textContent = 'Player runs scored in this selected match.';
    } else {
      note.textContent = 'No player run breakdown recorded for this filter (play or log a Detailed match).';
    }
  }
}

function computeAwards(matches) {
  let targetMatches = matches || state.matches;
  if (!matches) {
    const completed = state.matches.filter(m => m.status === 'completed');
    targetMatches = completed.length ? completed : state.matches;
  }
  let evalMatches = targetMatches.filter(m => m.status === 'completed');
  if (!evalMatches.length) evalMatches = targetMatches;

  const series = {};
  const bowlerStats = {};
  let bestPlayer = null;
  let bestBowler = null;
  let mom = null;

  evalMatches.forEach(m => {
    ensureMatchInnings(m);
    let matchTop = null;

    (m.innings || []).forEach(inn => {
      // Batting
      (inn.players || []).forEach(p => {
        const runs = +p.runs || 0;
        const balls = +p.balls || 0;
        const fours = +p.fours || 0;
        const sixes = +p.sixes || 0;
        const impact = runs + fours + (sixes * 2);
        const key = p.member || p.name;
        const label = playerLabel(p, inn.battingTeam);

        if (!series[key]) {
          series[key] = { key, label, teamId: inn.battingTeam, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, bowlRuns: 0, bowlBalls: 0, impact: 0, matches: 0 };
        }
        const s = series[key];
        s.runs += runs;
        s.balls += balls;
        s.fours += fours;
        s.sixes += sixes;
        s.impact += impact;
        s.matches += 1;
        s.label = label;

        if (!bestPlayer || runs > bestPlayer.runs || (runs === bestPlayer.runs && balls < (bestPlayer.balls || Infinity))) {
          bestPlayer = {
            key, label, runs, balls, fours, sixes,
            matchName: m.name,
            sr: balls ? ((runs / balls) * 100).toFixed(1) : '0.0'
          };
        }

        if (!matchTop || impact > matchTop.impact) {
          matchTop = { label, impact, matchName: m.name, detail: runs + ' runs (' + balls + 'b)' };
        }
      });

      // Bowling
      (inn.bowlers || []).forEach(b => {
        const wkts = +b.wickets || 0;
        const runs = +b.runs || 0;
        const balls = +b.balls || 0;
        const bowlImpact = (wkts * 20) + Math.max(0, balls - runs);
        const key = b.member || b.name;
        const label = b.member ? displayNameOf(inn.bowlingTeam, b.member) : b.name;

        if (series[key]) {
          series[key].impact += bowlImpact;
          series[key].wickets += wkts;
          series[key].bowlRuns += runs;
          series[key].bowlBalls += balls;
        }

        if (!bowlerStats[key]) {
          bowlerStats[key] = { key, label, teamId: inn.bowlingTeam, wickets: 0, runs: 0, balls: 0, matches: 0, matchName: m.name };
        }
        const bs = bowlerStats[key];
        bs.wickets += wkts;
        bs.runs += runs;
        bs.balls += balls;
        bs.matches += 1;
        bs.label = label;
        bs.matchName = m.name;

        const combinedImpact = (matchTop && matchTop.label === label) ? (matchTop.impact + bowlImpact) : bowlImpact;
        if (bowlImpact > 0 && (!matchTop || combinedImpact > matchTop.impact)) {
          matchTop = {
            label,
            impact: combinedImpact,
            matchName: m.name,
            detail: wkts + ' wkts, ' + runs + ' runs (' + fmtOvers(balls) + ' ov)'
          };
        }
      });
    });

    if (matchTop && (!mom || matchTop.impact > mom.impact)) {
      mom = matchTop;
    }
  });

  const allBowlers = Object.values(bowlerStats).filter(b => b.wickets > 0 || b.balls > 0);
  allBowlers.sort((a, b) => {
    if (b.wickets !== a.wickets) return b.wickets - a.wickets;
    if (a.runs !== b.runs) return a.runs - b.runs;
    const econA = a.balls > 0 ? (a.runs / (a.balls / 6)) : 999;
    const econB = b.balls > 0 ? (b.runs / (b.balls / 6)) : 999;
    return econA - econB;
  });

  if (allBowlers.length > 0 && (allBowlers[0].wickets > 0 || allBowlers[0].balls > 0)) {
    const topB = allBowlers[0];
    const econ = topB.balls > 0 ? (topB.runs / (topB.balls / 6)).toFixed(1) : '0.0';
    bestBowler = {
      key: topB.key,
      label: topB.label,
      wickets: topB.wickets,
      runs: topB.runs,
      balls: topB.balls,
      overs: fmtOvers(topB.balls),
      economy: econ,
      matches: topB.matches,
      matchName: topB.matchName
    };
  }

  const pos = Object.values(series).reduce((acc, s) => (!acc || s.impact > acc.impact) ? s : acc, null);
  return { bestPlayer, bestBowler, mom, pos };
}

function renderAwards() {
  const selEl = document.getElementById('chart-select');
  const sel = selEl ? selEl.value : '__series__';
  const filteredMatches = getMatchesForFilter(sel);
  const a = computeAwards(filteredMatches.length ? filteredMatches : state.matches);

  let titleSuffix = ' (Series Total)';
  let isSingle = false;
  if (sel === '__this_week__') titleSuffix = ' (This Week)';
  else if (sel === '__last_match__') titleSuffix = ' (Last Match)';
  else if (sel !== '__series__') {
    const single = state.matches.find(m => m.id === sel);
    if (single) {
      isSingle = true;
      titleSuffix = ' (' + single.name + ')';
    }
  }

  const card = (emoji, title, name, sub, hl) =>
    '<div class="award' + (hl ? ' highlight' : '') + '">' +
      '<div class="a-emoji">' + emoji + '</div>' +
      '<div class="a-title">' + title + '</div>' +
      '<div class="a-name">' + (name ? esc(name) : '—') + '</div>' +
      '<div class="a-sub">' + (sub ? esc(sub) : 'No detailed match logged yet') + '</div>' +
    '</div>';

  const batterSub = a.bestPlayer
    ? (a.bestPlayer.runs + ' runs (' + a.bestPlayer.balls + 'b, SR ' + a.bestPlayer.sr + ')' + (!isSingle ? ' · ' + a.bestPlayer.matchName : ''))
    : null;

  const bowlerSub = a.bestBowler
    ? (a.bestBowler.wickets + ' wkts · ' + a.bestBowler.overs + ' ov · Econ ' + a.bestBowler.economy + (!isSingle ? ' · ' + a.bestBowler.matchName : ''))
    : null;

  const momSub = a.mom
    ? (a.mom.impact + ' impact pts' + (a.mom.detail ? ' (' + a.mom.detail + ')' : '') + (!isSingle ? ' · ' + a.mom.matchName : ''))
    : null;

  const posTitle = isSingle ? 'Top Match Performer' : (sel === '__series__' ? 'Player of the Series' : 'Top Impact Player');
  const posSub = a.pos
    ? (a.pos.impact + ' impact pts' + (isSingle ? '' : ' · ' + a.pos.matches + ' match(es)'))
    : null;

  const awardsEl = document.getElementById('awards');
  if (awardsEl) {
    awardsEl.innerHTML =
      '<h3 class="card-title">🏆 Automatic Awards' + esc(titleSuffix) + '</h3>' +
      '<div class="award-grid">' +
        card('🥇', 'Best Batter', a.bestPlayer && a.bestPlayer.label, batterSub, !!a.bestPlayer) +
        card('🎯', 'Best Wicket-Taker', a.bestBowler && a.bestBowler.label, bowlerSub, !!a.bestBowler) +
        card('🏅', 'Man of the Match', a.mom && a.mom.label, momSub, !!a.mom) +
        card('👑', posTitle, a.pos && a.pos.label, posSub, !!a.pos) +
      '</div>';
  }
}

/* ---------- 20. Printable Multi-Innings Summary Report ---------- */
function printMatchHTML(m, matchNum) {
  ensureMatchInnings(m);
  const res = resultOf(m);
  const hasDetailed = isDetailedMatch(m);

  let resultClass = 'print-result-win';
  let resultText = res ? res.text : 'In Progress';
  if (m.status === 'live') {
    resultClass = 'print-result-live';
    resultText = '🔴 LIVE SCOREBOARD';
  } else if (res && res.draw) {
    resultClass = 'print-result-draw';
  }

  let h = '<div class="print-match-card">';
  h += '  <div class="print-match-header">';
  h += '    <div>';
  h += '      <div class="print-match-title">' + (matchNum ? 'Match #' + matchNum + ': ' : '') + esc(m.name) + '</div>';
  h += '      <div style="font-size:10.5px;color:#64748b">' + fmtDate(m.createdAt) + ' · ' + modeLabel(m.mode) + (m.maxOvers ? ' · ' + m.maxOvers + ' ov match' : '') + '</div>';
  h += '    </div>';
  h += '    <div class="print-match-result ' + resultClass + '">' + esc(resultText) + '</div>';
  h += '  </div>';

  h += '  <div class="print-teams-row">';
  m.innings.forEach(inn => {
    const meta = getTeam(inn.battingTeam);
    const balls = inn.balls || 0;
    const oversText = balls > 0 ? ' (' + fmtOvers(balls) + ' ov)' : '';
    const targetText = inn.target ? ' · Target: ' + inn.target : '';
    h += '<div class="print-team-box" style="border-left-color:' + (meta.color || '#0284c7') + '">';
    h += '  <div class="print-tb-title">' + esc(meta.name) + ' (Innings ' + inn.inningNum + ')' + targetText + '</div>';
    h += '  <div class="print-tb-score">' + (inn.runs || 0) + '/' + (inn.wickets || 0) + oversText + '</div>';
    h += '</div>';
  });
  h += '  </div>';

  if (hasDetailed) {
    m.innings.forEach(inn => {
      const meta = getTeam(inn.battingTeam);
      const bowlMeta = getTeam(inn.bowlingTeam);

      if (inn.players && inn.players.length) {
        h += '<div style="font-weight:700;font-size:11.5px;color:#1e3a8a;margin-top:10px">🏏 Innings ' + inn.inningNum + ' Batting — ' + esc(meta.name) + '</div>';
        h += '<table class="print-table"><thead><tr><th>Batter</th><th>Runs</th><th>Balls</th><th>4s</th><th>6s</th><th>SR</th><th>Dismissal</th></tr></thead><tbody>';
        inn.players.forEach(p => {
          const sr = p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';
          const statusSpan = p.out ? '<span class="print-badge-out">Out</span>' : '<span class="print-badge-notout">Not Out</span>';
          h += '<tr>';
          h += '  <td><strong>' + esc(playerLabel(p, inn.battingTeam)) + '</strong></td>';
          h += '  <td><strong>' + (p.runs || 0) + '</strong></td>';
          h += '  <td>' + (p.balls || 0) + '</td>';
          h += '  <td>' + (p.fours || 0) + '</td>';
          h += '  <td>' + (p.sixes || 0) + '</td>';
          h += '  <td>' + sr + '</td>';
          h += '  <td>' + statusSpan + '</td>';
          h += '</tr>';
        });
        h += '</tbody></table>';
      }

      if (inn.bowlers && inn.bowlers.length) {
        h += '<div style="font-weight:700;font-size:11.5px;color:#1e3a8a;margin-top:6px">🎯 Innings ' + inn.inningNum + ' Bowling — ' + esc(bowlMeta.name) + '</div>';
        h += '<table class="print-table"><thead><tr><th>Bowler</th><th>Overs</th><th>Runs Conceded</th><th>Wickets</th><th>Economy</th></tr></thead><tbody>';
        inn.bowlers.forEach(b => {
          const bBalls = b.balls || 0;
          const econ = bBalls > 0 ? (b.runs / (bBalls / 6)).toFixed(1) : '0.0';
          const bName = b.member ? displayNameOf(inn.bowlingTeam, b.member) : b.name;
          h += '<tr>';
          h += '  <td><strong>' + esc(bName) + '</strong></td>';
          h += '  <td>' + fmtOvers(bBalls) + '</td>';
          h += '  <td>' + (b.runs || 0) + '</td>';
          h += '  <td><strong>' + (b.wickets || 0) + '</strong></td>';
          h += '  <td>' + econ + '</td>';
          h += '</tr>';
        });
        h += '</tbody></table>';
      }
    });
  }

  h += '</div>';
  return h;
}

function buildPrintSummary() {
  const selEl = document.getElementById('chart-select');
  const sel = selEl ? selEl.value : '__series__';
  const filteredMatches = getMatchesForFilter(sel);
  const targetMatches = filteredMatches.length ? filteredMatches : state.matches;
  const awards = computeAwards(targetMatches);
  const u = state.user;

  let reportScope = 'Full Series Report (' + state.matches.length + ' matches)';
  if (sel === '__this_week__') reportScope = 'This Week (' + targetMatches.length + ' matches)';
  else if (sel === '__last_match__') reportScope = 'Last Completed Match';
  else if (sel !== '__series__') {
    const single = state.matches.find(m => m.id === sel);
    if (single) reportScope = 'Single Match Report (' + single.name + ')';
  }

  let h = '';
  // Header Banner
  h += '<div class="print-header">';
  h += '  <div class="print-header-top">';
  h += '    <h1>🏏 Thursday Cricket Official Match Report</h1>';
  h += '  </div>';
  h += '  <div class="print-sub">Official Squad Scorecard, Multi-Innings Analysis &amp; Series Awards</div>';
  h += '  <div class="print-meta-chips">';
  h += '    <span class="print-chip">📅 ' + esc(new Date().toLocaleDateString([], { dateStyle: 'full' })) + '</span>';
  h += '    <span class="print-chip">📍 Scope: ' + esc(reportScope) + '</span>';
  if (u) h += '    <span class="print-chip">👤 Generated by ' + esc(u.displayName) + ' (' + esc(getTeam(u.teamId).name) + ')</span>';
  h += '    <span class="print-chip">👥 Squads: ' + Object.keys(state.teams).length + ' Teams</span>';
  h += '  </div>';
  h += '</div>';

  // 1. Automatic Awards Section
  h += '<div class="print-section">';
  h += '  <div class="print-section-title">🏆 Official Awards &amp; Top Performers</div>';
  h += '  <div class="print-award-grid">';

  const printCard = (emoji, title, name, sub) =>
    '<div class="print-award-card">' +
      '<div class="print-award-emoji">' + emoji + '</div>' +
      '<div class="print-award-title">' + title + '</div>' +
      '<div class="print-award-name">' + (name ? esc(name) : '—') + '</div>' +
      '<div class="print-award-sub">' + (sub ? esc(sub) : 'No detailed match logged') + '</div>' +
    '</div>';

  h += printCard('🥇', 'Best Batter', awards.bestPlayer && awards.bestPlayer.label, awards.bestPlayer ? awards.bestPlayer.runs + ' runs (' + awards.bestPlayer.balls + 'b, SR ' + awards.bestPlayer.sr + ') · ' + awards.bestPlayer.matchName : null);
  h += printCard('🎯', 'Best Wicket-Taker', awards.bestBowler && awards.bestBowler.label, awards.bestBowler ? awards.bestBowler.wickets + ' wkts · ' + awards.bestBowler.overs + ' ov (Econ ' + awards.bestBowler.economy + ') · ' + awards.bestBowler.matchName : null);
  h += printCard('🏅', 'Man of the Match', awards.mom && awards.mom.label, awards.mom ? awards.mom.impact + ' impact pts' + (awards.mom.detail ? ' (' + awards.mom.detail + ')' : '') + ' · ' + awards.mom.matchName : null);
  h += printCard('👑', (sel === '__series__' ? 'Player of the Series' : 'Top Impact Player'), awards.pos && awards.pos.label, awards.pos ? awards.pos.impact + ' total impact pts · ' + awards.pos.matches + ' match(es)' : null);

  h += '  </div>';
  h += '</div>';

  // 2. Team Standings & Head-to-Head Totals
  h += '<div class="print-section">';
  h += '  <div class="print-section-title">📊 Team Performance &amp; Head-to-Head Standings</div>';
  h += '  <table class="print-table">';
  h += '    <thead><tr><th>Team</th><th>Captain</th><th>Matches</th><th>Runs Scored</th><th>Wickets Lost</th><th>Status</th></tr></thead>';
  h += '    <tbody>';
  Object.values(state.teams).forEach(t => {
    const ms = targetMatches.filter(m => (m.innings || []).some(inn => inn.battingTeam === t.id));
    const runs = targetMatches.reduce((sum, m) => {
      ensureMatchInnings(m);
      return sum + (m.innings || []).filter(inn => inn.battingTeam === t.id).reduce((s, inn) => s + (+inn.runs || 0), 0);
    }, 0);
    const wkts = targetMatches.reduce((sum, m) => {
      ensureMatchInnings(m);
      return sum + (m.innings || []).filter(inn => inn.battingTeam === t.id).reduce((s, inn) => s + (+inn.wickets || 0), 0);
    }, 0);
    const capt = t.captain ? displayNameOf(t.id, t.captain) : 'Not elected';

    h += '<tr>';
    h += '  <td><strong style="color:' + (t.color || '#1e3a8a') + '">' + esc(t.name) + '</strong> (' + esc(t.short) + ')</td>';
    h += '  <td>👑 ' + esc(capt) + '</td>';
    h += '  <td>' + ms.length + '</td>';
    h += '  <td><strong>' + runs + '</strong></td>';
    h += '  <td>' + wkts + '</td>';
    h += '  <td>' + (ms.length > 0 ? 'Active Squad' : 'No games') + '</td>';
    h += '</tr>';
  });
  h += '    </tbody>';
  h += '  </table>';
  h += '</div>';

  // 3. Multi-Innings Match Scorecards
  h += '<div class="print-section">';
  h += '  <div class="print-section-title">🏏 Match Scorecards (' + targetMatches.length + ')</div>';
  if (!targetMatches.length) {
    h += '<p style="color:#64748b;font-style:italic;padding:8px 0">No matches found for the selected scope.</p>';
  } else {
    targetMatches.forEach((m, idx) => {
      h += printMatchHTML(m, idx + 1);
    });
  }
  h += '</div>';

  const printArea = document.getElementById('print-area');
  if (printArea) {
    printArea.innerHTML = h;
    window.print();
  }
}

/* ---------- 21. Settings: Team Profile, Captain Election & Secret Code ---------- */
function saveDisplayName(name) {
  const t = (name || '').trim();
  if (!t) return toast('Display name cannot be empty.', 'error');
  const key = memberKey(state.user.teamId, state.user.member);
  state.players[key] = { displayName: t, teamId: state.user.teamId, member: state.user.member };
  state.user.displayName = t;
  db.savePlayer(key, state.players[key]);
  persistUser();
  renderHeader();
  renderTeam();
  renderDashboard();
  toast('Display name updated!', 'success');
}

function checkVotePassed(teamId, v) {
  const needed = majority(teamId);
  const got = Object.keys(v.votes || {}).length;
  if (got >= needed) {
    state.teams[teamId].secretCode = v.proposedCode;
    db.saveTeam(teamId, state.teams[teamId]);
    db.saveVote(teamId, { proposedCode: '', votes: {}, proposedCaptain: v.proposedCaptain || '', captainVotes: v.captainVotes || {} });
    toast('✅ Secret code changed successfully!', 'success');
  } else {
    toast('Vote recorded (' + got + '/' + needed + ').', 'success');
  }
}

function voteForCode(proposed) {
  const teamId = state.user.teamId;
  const clean = (proposed || '').trim();
  if (clean.length < 4) return toast('Code must be at least 4 characters.', 'error');
  const v = state.votes[teamId] || { proposedCode: '', votes: {} };
  if (v.proposedCode !== clean) { v.proposedCode = clean; v.votes = {}; }
  v.votes[state.user.member] = true;
  db.saveVote(teamId, v);
  checkVotePassed(teamId, v);
}

function voteYes() {
  const teamId = state.user.teamId;
  const v = state.votes[teamId] || { proposedCode: '', votes: {} };
  if (!v.proposedCode) return toast('No active code vote.', 'error');
  v.votes[state.user.member] = true;
  db.saveVote(teamId, v);
  checkVotePassed(teamId, v);
}

function proposeCaptain(candidate) {
  const u = state.user; if (!u) return;
  const teamId = u.teamId;
  const team = getTeam(teamId);
  const clean = (candidate || '').trim();
  if (!(team.members || []).includes(clean)) return toast('Please select a member of your squad.', 'error');
  const v = state.votes[teamId] || { proposedCode: '', votes: {} };
  if (v.proposedCaptain !== clean) {
    v.proposedCaptain = clean;
    v.captainVotes = {};
  }
  if (!v.captainVotes) v.captainVotes = {};
  v.captainVotes[u.member] = true;
  db.saveVote(teamId, v);
  checkCaptainVotePassed(teamId, v);
}

function voteCaptainYes() {
  const u = state.user; if (!u) return;
  const teamId = u.teamId;
  const v = state.votes[teamId] || {};
  if (!v.proposedCaptain) return toast('No active captain election.', 'error');
  if (!v.captainVotes) v.captainVotes = {};
  v.captainVotes[u.member] = true;
  db.saveVote(teamId, v);
  checkCaptainVotePassed(teamId, v);
}

async function checkCaptainVotePassed(teamId, v) {
  const needed = majority(teamId);
  const got = Object.keys(v.captainVotes || {}).length;
  if (got >= needed) {
    const elected = v.proposedCaptain;
    const team = state.teams[teamId] || getTeam(teamId);
    team.captain = elected;
    delete v.proposedCaptain;
    delete v.captainVotes;
    await db.saveTeam(teamId, team);
    await db.saveVote(teamId, v);
    renderTeam();
    renderDashboard();
    toast('👑 ' + displayNameOf(teamId, elected) + ' elected as Captain of ' + team.name + '! 🏏', 'success');
  } else {
    renderTeam();
    toast('Captain vote recorded (' + got + '/' + needed + ').', 'success');
  }
}

function renderTeam() {
  const u = state.user; if (!u) return;
  const a = document.activeElement;
  if (a && (a.closest('#team-profile') || a.closest('#team-captain') || a.closest('#team-vote') || a.closest('#team-manager') || a.closest('#theme-customizer'))) return;

  const team = getTeam(u.teamId);
  const captainName = team.captain ? displayNameOf(team.id, team.captain) : 'Not elected yet (Vote below)';

  // 1. Profile & Squad Roster
  const profileEl = document.getElementById('team-profile');
  if (profileEl) {
    profileEl.innerHTML =
      '<h3 class="card-title">Your Profile</h3>' +
      '<p class="muted" style="font-size:.85rem">Logged in as <strong style="color:var(--white)">' + esc(u.member) + '</strong> · ' + esc(team.name) + '</p>' +
      '<p class="mt" style="font-size:.88rem">👑 <strong>Official Captain:</strong> <span class="accent">' + esc(captainName) + '</span></p>' +
      '<form data-form="profile" class="mt">' +
        '<label class="field"><span>Display Name</span><input id="display-name-input" type="text" value="' + esc(u.displayName) + '" maxlength="30" required /></label>' +
        '<button type="submit" class="btn btn-primary btn-block">Save Display Name</button>' +
      '</form>' +
      '<h3 class="card-title mt">Squad Roster</h3>' +
      (team.members || []).map(m =>
        '<div class="row spread" style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)">' +
          '<div>' +
            '<span>' + esc(displayNameOf(team.id, m)) + '</span>' +
            (m === team.captain ? ' <span class="badge badge-captain">👑 Captain</span>' : '') +
            (m === u.member ? ' <span class="badge badge-you">you</span>' : '') +
          '</div>' +
          '<span class="muted" style="font-size:.78rem">' + esc(m) + '</span>' +
        '</div>').join('');
  }

  // 2. Team Captain Election
  const captainEl = document.getElementById('team-captain');
  if (captainEl) {
    const v = state.votes[u.teamId] || {};
    const needed = majority(team.id);
    const got = Object.keys(v.captainVotes || {}).length;
    const voters = Object.keys(v.captainVotes || {}).map(esc).join(', ');
    const activeElection = v.proposedCaptain && got > 0;
    const alreadyVoted = !!(v.captainVotes && v.captainVotes[u.member]);
    const candidateName = v.proposedCaptain ? displayNameOf(team.id, v.proposedCaptain) : '';

    captainEl.innerHTML =
      '<h3 class="card-title">👑 Team Captain Election</h3>' +
      '<p class="muted" style="font-size:.85rem">Active Captain: <strong style="color:var(--white)">' + esc(captainName) + '</strong></p>' +
      (activeElection
        ? '<div class="mt" style="background:rgba(0,0,0,.22);border-radius:12px;padding:12px">' +
            '<div class="spread"><span>Nominated Candidate:</span><strong class="accent">👑 ' + esc(candidateName) + '</strong></div>' +
            '<div class="muted" style="font-size:.82rem;margin-top:6px">Votes: ' + got + '/' + needed + ' — ' + voters + '</div>' +
            '<div class="progress mt"><div class="progress-fill" style="width:' + Math.min(100, got / needed * 100) + '%"></div></div>' +
            '<p class="hint">Requires majority consensus (' + needed + ' votes) to elect.</p>' +
          '</div>'
        : '<p class="hint">No active captain election. Nominate a teammate — requires ' + needed + ' vote(s) to pass.</p>') +
      (activeElection && !alreadyVoted
        ? '<button type="button" class="btn btn-primary btn-block mt" data-action="vote-captain-yes">👍 Vote for "' + esc(candidateName) + '" as Captain</button>'
        : '') +
      '<form data-form="captain" class="mt">' +
        '<label class="field"><span>Nominate Squad Member</span>' +
          '<select id="captain-candidate-select" required>' +
            (team.members || []).map(m => '<option value="' + esc(m) + '"' + (m === team.captain ? ' selected' : '') + '>' + esc(displayNameOf(team.id, m)) + (m === team.captain ? ' (Current Captain)' : '') + '</option>').join('') +
          '</select>' +
        '</label>' +
        '<button type="submit" class="btn btn-block">Propose / Vote for Captain</button>' +
      '</form>';
  }

  // 3. Secret Code Vote
  const voteEl = document.getElementById('team-vote');
  if (voteEl) {
    const v = state.votes[u.teamId] || { proposedCode: '', votes: {} };
    const needed = majority(team.id);
    const got = Object.keys(v.votes || {}).length;
    const voters = Object.keys(v.votes || {}).map(esc).join(', ');
    const activeVote = v.proposedCode && got > 0;
    const alreadyVoted = !!v.votes[u.member];

    voteEl.innerHTML =
      '<h3 class="card-title">🔐 Change Team Secret Code</h3>' +
      '<p class="muted" style="font-size:.85rem">Current code: <code>' + esc(team.secretCode) + '</code></p>' +
      (activeVote
        ? '<div class="mt" style="background:rgba(0,0,0,.22);border-radius:12px;padding:12px">' +
            '<div class="spread"><span>Proposed Code:</span><code>' + esc(v.proposedCode) + '</code></div>' +
            '<div class="muted" style="font-size:.82rem;margin-top:6px">Votes: ' + got + '/' + needed + ' — ' + voters + '</div>' +
            '<div class="progress mt"><div class="progress-fill" style="width:' + Math.min(100, got / needed * 100) + '%"></div></div>' +
            '<p class="hint">A majority must approve. Proposing a different code resets the vote.</p>' +
          '</div>'
        : '<p class="hint">No active vote. Propose a new code — it needs ' + needed + ' vote(s) to take effect.</p>') +
      (activeVote && !alreadyVoted
        ? '<button type="button" class="btn btn-primary btn-block mt" data-action="vote-yes">👍 Vote Yes for "' + esc(v.proposedCode) + '"</button>' : '') +
      '<form data-form="vote" class="mt">' +
        '<label class="field"><span>New Secret Code</span><input id="vote-code-input" type="text" placeholder="e.g. NewSecret123" minlength="4" required /></label>' +
        '<button type="submit" class="btn btn-block">Propose / Vote for Code</button>' +
      '</form>';
  }

  // 4. Custom Teams Manager in Settings
  const managerEl = document.getElementById('team-manager');
  if (managerEl) {
    const customList = Object.values(state.customTeams || {});
    managerEl.innerHTML =
      '<h3 class="card-title">🛡️ Custom Teams Manager</h3>' +
      '<p class="muted" style="font-size:.85rem">Create and manage user squads. Custom teams appear across match setups, registration and analysis.</p>' +
      teamCreatorFormHTML() +
      (customList.length > 0
        ? '<div class="team-grid">' +
            customList.map(t =>
              '<div class="team-chip">' +
                '<div class="team-chip-info">' +
                  '<span class="swatch" style="background:' + (t.color || '#3b82f6') + '"></span>' +
                  '<div>' +
                    '<div class="t-name">' + esc(t.name) + ' (' + esc(t.short) + ')</div>' +
                    '<div class="t-meta">' + (t.members || []).length + ' members · Code: <code>' + esc(t.secretCode) + '</code></div>' +
                  '</div>' +
                '</div>' +
                '<button type="button" class="btn btn-sm btn-ghost" data-action="delete-custom-team" data-id="' + t.id + '" title="Delete custom team">🗑</button>' +
              '</div>').join('') +
          '</div>'
        : '<p class="hint">No custom teams created yet. Create one in the Match Setup tab.</p>') +
      '<button type="button" class="btn btn-ghost btn-block mt" data-action="go-match">＋ Create a New Squad in Match Setup</button>';
  }

  // 5. Theme Switcher
  const themeEl = document.getElementById('theme-customizer');
  if (themeEl) {
    const activeTheme = getSavedTheme();
    themeEl.innerHTML =
      '<h3 class="card-title">🎨 Per-Player Theme Switcher</h3>' +
      '<p class="muted" style="font-size:.85rem">Saved locally for this browser. Customize your interface without changing other squad members’ themes.</p>' +
      '<div class="theme-grid">' +
        THEMES.map(t => {
          const isActive = t.id === activeTheme;
          return '' +
            '<button type="button" class="theme-card' + (isActive ? ' is-active' : '') + '" data-action="set-theme" data-theme-id="' + t.id + '">' +
              '<div class="theme-card-top">' +
                '<span class="theme-card-title">' + t.icon + ' ' + esc(t.name) + '</span>' +
                (isActive ? '<span class="badge badge-won" style="font-size:.68rem">✓ Active</span>' : '') +
              '</div>' +
              '<div class="theme-card-desc">' + esc(t.desc) + '</div>' +
              '<div class="theme-swatches mt">' +
                '<span class="theme-dot" style="background:' + t.primary + '"></span>' +
                '<span class="theme-dot" style="background:' + t.accent + '"></span>' +
              '</div>' +
            '</button>';
        }).join('') +
      '</div>';
  }
}

/* ---------- 22. Global Event Routing ---------- */
function globalClick(e) {
  // Mode selection
  const modeOpt = e.target.closest('.mode-option');
  if (modeOpt) {
    uiMode = modeOpt.dataset.mode;
    renderSetupForm();
    return;
  }

  // Setup type toggle
  const setupTypeBtn = e.target.closest('[data-action="set-setup-type"]');
  if (setupTypeBtn) {
    state.matchSetupType = setupTypeBtn.dataset.type;
    renderSetupForm();
    return;
  }

  // Theme selection
  const themeCard = e.target.closest('[data-theme-id]');
  if (themeCard) {
    const tId = themeCard.dataset.themeId;
    applyTheme(tId);
    renderTeam();
    const tObj = THEMES.find(x => x.id === tId);
    toast('Theme set to ' + (tObj ? tObj.name : tId) + ' ✨', 'success');
    return;
  }

  const el = e.target.closest('[data-action]');
  if (!el) return;

  switch (el.dataset.action) {
    case 'open-match':
      state.activeMatchId = el.dataset.id;
      renderLiveArea();
      showSection('scoreboard-section');
      break;
    case 'end-match':
      endMatch(el.dataset.id);
      break;
    case 'reopen-match':
      reopenMatch(el.dataset.id);
      break;
    case 'delete-match':
      deleteMatch(el.dataset.id);
      break;
    case 'init-second-innings':
      initSecondInnings(el.dataset.id);
      break;
    case 'switch-inning':
      setMatchInning(el.dataset.id, +el.dataset.idx);
      break;
    case 'add-player':
      addPlayerToInning(el.dataset.match, +el.dataset.inning);
      break;
    case 'add-bowler':
      addBowlerToInning(el.dataset.match, +el.dataset.inning);
      break;
    case 'remove-player':
      removePlayerFromInning(el.dataset.match, +el.dataset.inning, +el.dataset.idx);
      break;
    case 'remove-bowler':
      removeBowlerFromInning(el.dataset.match, +el.dataset.inning, +el.dataset.idx);
      break;
    case 'delete-custom-team':
      if (confirm('Delete this custom team?')) {
        db.deleteCustomTeam(el.dataset.id).then(() => {
          delete state.customTeams[el.dataset.id];
          rebuildTeams();
          populateLoginSelect();
          populateRegisterTeamSelect();
          renderSetupForm();
          renderTeamBuilderCard();
          renderTeam();
          toast('Team deleted.', 'success');
        });
      }
      break;
    case 'add-roster-input': {
      const form = el.closest('form');
      const container = form && form.querySelector('.roster-inputs');
      if (container) {
        const count = container.querySelectorAll('.roster-member-input').length + 1;
        const row = document.createElement('div');
        row.className = 'roster-row';
        row.innerHTML = '<input type="text" class="roster-member-input" placeholder="Player ' + count + '" required /><button type="button" class="btn btn-sm btn-ghost" data-action="remove-roster-input">✕</button>';
        container.appendChild(row);
      }
      break;
    }
    case 'remove-roster-input': {
      const row = el.closest('.roster-row');
      const container = row && row.closest('.roster-inputs');
      if (row && container && container.querySelectorAll('.roster-member-input').length > 2) row.remove();
      break;
    }
    case 'vote-yes':
      voteYes();
      break;
    case 'vote-captain-yes':
      voteCaptainYes();
      break;
    case 'set-theme':
      applyTheme(el.dataset.themeId);
      renderTeam();
      break;
    case 'go-match':
      showSection('match-setup-section');
      break;
    case 'ball':
      applyBall(el.dataset.match, +el.dataset.inning, +el.dataset.runs);
      break;
    case 'wicket':
      applyWicket(el.dataset.match, +el.dataset.inning);
      break;
    case 'undo':
      undoBall(el.dataset.match, +el.dataset.inning);
      break;
    case 'set-striker':
      setStriker(el.dataset.match, +el.dataset.inning, +el.dataset.idx);
      break;
  }
}

function globalSubmit(e) {
  const kind = e.target && e.target.dataset ? e.target.dataset.form : null;
  if (!kind) return;
  e.preventDefault();

  if (kind === 'start') startMatch();
  else if (kind === 'register') registerNewPlayer(e);
  else if (kind === 'create-team') handleCreateTeam(e);
  else if (kind === 'profile') saveDisplayName(document.getElementById('display-name-input').value);
  else if (kind === 'vote') voteForCode(document.getElementById('vote-code-input').value);
  else if (kind === 'captain') proposeCaptain(document.getElementById('captain-candidate-select').value);
}

function globalInput(e) {
  const el = e.target;
  if (!el || !el.dataset) return;
  if (el.dataset.score !== undefined) updateScoreLocal(el);
  else if (el.dataset.bowl !== undefined) updateBowlerLocal(el);

  // Sync color hex input and color picker (scoped to the creator form)
  if (el.classList && el.classList.contains('tc-color')) {
    const form = el.closest('form');
    const hex = form && form.querySelector('.tc-color-hex');
    if (hex) hex.value = el.value;
  } else if (el.classList && el.classList.contains('tc-color-hex')) {
    const form = el.closest('form');
    const picker = form && form.querySelector('.tc-color');
    if (picker && /^#[0-9a-f]{6}$/i.test(el.value)) picker.value = el.value;
  }
}

function globalChange(e) {
  const el = e.target;
  if (!el || !el.dataset) return;
  if (el.dataset.score !== undefined) saveScoreField(el);
  else if (el.dataset.bowl !== undefined) saveBowlerField(el);
  else if (el.dataset.out !== undefined) toggleOut(el);
  else if (el.dataset.rename !== undefined) renamePlayer(el);
  else if (el.dataset.renameBowler !== undefined) renameBowler(el);
}

/* ---------- 23. Application Lifecycle Bootstrapper ---------- */
async function init() {
  attachRippleEffect();
  populateLoginSelect();
  populateRegisterTeamSelect();
  renderSyncStatus();

  const mode = await db.init();
  console.log('[Thursday Cricket] data mode:', mode);

  populateLoginSelect();
  populateRegisterTeamSelect();
  renderSyncStatus();

  // Subscribe to all 5 Firestore / Local collections
  db.subscribe('teams', applyTeams);
  db.subscribe('customTeams', applyCustomTeams);
  db.subscribe('matches', applyMatches);
  db.subscribe('votes', applyVotes);
  db.subscribe('players', applyPlayers);

  // Login & Registration Event Listeners
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      handleLogin(document.getElementById('login-name').value, document.getElementById('login-code').value);
    });
  }

  const regToggle = document.getElementById('register-toggle');
  if (regToggle) regToggle.addEventListener('click', toggleRegisterForm);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const mainNav = document.getElementById('main-nav');
  if (mainNav) {
    mainNav.addEventListener('click', e => {
      const b = e.target.closest('.nav-btn');
      if (b) showSection(b.dataset.section);
    });
  }

  const chartSelect = document.getElementById('chart-select');
  if (chartSelect) {
    chartSelect.addEventListener('change', () => {
      renderCharts();
      renderAwards();
    });
  }

  const printBtn = document.getElementById('print-btn');
  if (printBtn) printBtn.addEventListener('click', buildPrintSummary);

  document.addEventListener('click', globalClick);
  document.addEventListener('submit', globalSubmit);
  document.addEventListener('input', globalInput);
  document.addEventListener('change', globalChange);

  window.addEventListener('unhandledrejection', e => {
    console.error('[Thursday Cricket] Unhandled promise rejection:', e.reason);
  });

  const saved = restoreUser();
  if (saved) {
    state.user = saved;
    state.user.displayName = displayNameOf(saved.teamId, saved.member);
    showSection('dashboard-section');
    renderAll();
  } else {
    showSection('login-section');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
