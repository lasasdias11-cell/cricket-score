/* ==========================================================================
   Thursday Cricket · app.js
   Single-page cricket scoring app. Vanilla JS + Firebase Firestore (with a
   localStorage fallback so the app still works before you paste a config).

   ──────────────────────────────────────────────────────────────────────────
   FIREBASE SETUP (one-time)
   1. Project already exists: "thursday-cricket" — open the Firebase Console.
   2. Firestore Database → create the database if not yet created (test mode).
   3. Project settings → General → Your apps → Web app → copy ONLY the "apiKey"
      (looks like "AIzaSy…") and paste it into FIREBASE_CONFIG.apiKey below.
   4. Firestore → Rules tab → paste these rules (private squad, test mode):
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if true;
            }
          }
        }
   5. Deploy to GitHub Pages (repo: lasasdias11-cell/cricket-score):
      Settings → Pages → Deploy from branch → main / root.

   Without a valid config the app automatically runs in "local mode": data is
   stored in localStorage and synced across browser tabs on the same device
   (via BroadcastChannel). Real cross-device live sync requires Firestore.
   ========================================================================== */

'use strict';

/* ---------- 1. Firebase config (Thursday Cricket) ----------
   Project: thursday-cricket · App: 1:752945537542:web:84be60617247fc045fd987
   → Copy ONLY your apiKey from: Firebase Console → Project settings → General
     → Your apps → Web app → "Config". It looks like "AIzaSy…" (~39 chars).
   → The apiKey is a public client identifier (not a secret); your data is
     protected by the Firestore security rules shown at the top of this file.
   → If the apiKey is missing/placeholder, the app auto-runs in "local mode". */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCaA5DXo3JkWGqGdjFBMPnKj5PlwAbCT-Y',   // ← REQUIRED: copy from Firebase Console
  authDomain: 'thursday-cricket.firebaseapp.com',
  projectId: 'thursday-cricket',
  storageBucket: 'thursday-cricket.appspot.com',
  messagingSenderId: '752945537542',
  appId: '1:752945537542:web:84be60617247fc045fd987'
};

/* ---------- 2. Constants & defaults ---------- */
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
  matches: 'cricscore_matches',
  votes: 'cricscore_votes',
  players: 'cricscore_players'
};

/* ---------- 3. Global state ---------- */
const state = {
  user: null,          // { teamId, member, displayName }
  teams: defaultTeams(),
  matches: [],
  votes: {},           // { [teamId]: { proposedCode, votes: {member:true} } }
  players: {},         // { [teamId__member]: { displayName } }
  activeMatchId: null
};

let uiMode = 'quick';       // currently selected scoring mode in the setup form
let chartTeam = null;       // Chart.js instances (kept for destroy/update)
let chartPlayers = null;

/* ---------- 4. Small utilities ---------- */
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
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}
function defaultTeams() {
  return Object.fromEntries(Object.values(DEFAULT_TEAMS).map(t => [t.id, Object.assign({}, t, { members: t.members.slice() })]));
}
function getTeam(id) {
  return state.teams[id] || defaultTeams()[id] || { id, name: id, short: id, secretCode: '', members: [], color: '#3b82f6' };
}
function memberKey(teamId, member) { return teamId + '__' + member; }
function displayNameOf(teamId, member) {
  const p = state.players[memberKey(teamId, member)];
  return (p && p.displayName) || member;
}
function playerLabel(p, teamId) {
  return p.member ? displayNameOf(teamId, p.member) : p.name;
}
function majority(teamId) {
  return Math.floor((getTeam(teamId).members || []).length / 2) + 1;
}

/* ---------- 5. Data layer (Firestore ⇄ localStorage) ---------- */
const db = (() => {
  let mode = 'local';
  let fs = null;
  let bc = null;
  try { bc = 'BroadcastChannel' in window ? new BroadcastChannel('cricscore_v1') : null; } catch (e) { bc = null; }
  const subs = { teams: [], matches: [], votes: [], players: [] };
  const cols = { teams: 'teams', matches: 'matches', votes: 'teamVotes', players: 'players' };

  function isPlaceholder(cfg) {
    if (!cfg || !cfg.apiKey) return true;
    if (/YOUR_|PASTE|REPLACE|EXAMPLE|PLACEHOLDER/i.test(cfg.apiKey)) return true;
    return !/^AIzaSy/i.test(cfg.apiKey);
  }
  function load(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    if (bc) { try { bc.postMessage({ type: 'change', key }); } catch (e) {} }
  }
  function seed() {
    if (load(LS.teams) == null) save(LS.teams, defaultTeams());
    if (load(LS.matches) == null) save(LS.matches, []);
    if (load(LS.votes) == null) save(LS.votes, {});
    if (load(LS.players) == null) save(LS.players, {});
  }
  function emit(col, data) { (subs[col] || []).slice().forEach(cb => cb(data)); }
  function emitLocal(col) { emit(col, col === 'matches' ? (load(LS.matches) || []) : (load(LS[col]) || {})); }
  function emitAllLocal() { ['teams', 'matches', 'votes', 'players'].forEach(emitLocal); }

  function init() {
    const fbOk = typeof firebase !== 'undefined' && !isPlaceholder(FIREBASE_CONFIG);
    if (fbOk) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        fs = firebase.firestore();
        mode = 'firestore';
      } catch (e) {
        console.warn('[Thursday Cricket] Firebase init failed — using local mode.', e);
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
      fs.collection(cols[col]).onSnapshot(snap => {
        if (col === 'matches') { const arr = []; snap.forEach(d => arr.push(d.data())); emit(col, arr); }
        else { const obj = {}; snap.forEach(d => obj[d.id] = d.data()); emit(col, obj); }
      }, err => { console.warn('[Thursday Cricket] Firestore read error:', err); emitLocal(col); });
    } else {
      emitLocal(col);
    }
  }

  let errTimer = null;
  function reportErr(label, e) {
    console.error('[Thursday Cricket] ' + label + ' failed:', (e && e.message) || e);
    clearTimeout(errTimer);
    errTimer = setTimeout(() => toast('⚠️ Sync failed — check your connection and Firestore rules.', 'error'), 400);
  }

  async function saveTeam(id, data) {
    try {
      if (mode === 'firestore') { await fs.collection('teams').doc(id).set(data, { merge: true }); }
      else { const all = load(LS.teams) || {}; all[id] = data; save(LS.teams, all); emitLocal('teams'); }
    } catch (e) { reportErr('saveTeam', e); }
  }
  async function saveMatch(m) {
    try {
      if (mode === 'firestore') { await fs.collection('matches').doc(m.id).set(m); }
      else { const all = load(LS.matches) || []; const i = all.findIndex(x => x.id === m.id); if (i >= 0) all[i] = m; else all.push(m); save(LS.matches, all); emitLocal('matches'); }
    } catch (e) { reportErr('saveMatch', e); }
  }
  async function deleteMatch(id) {
    try {
      if (mode === 'firestore') { await fs.collection('matches').doc(id).delete(); }
      else { save(LS.matches, (load(LS.matches) || []).filter(x => x.id !== id)); emitLocal('matches'); }
    } catch (e) { reportErr('deleteMatch', e); }
  }
  async function saveVote(teamId, v) {
    try {
      if (mode === 'firestore') { if (v.proposedCode) await fs.collection('teamVotes').doc(teamId).set(v); else await fs.collection('teamVotes').doc(teamId).delete(); }
      else { const all = load(LS.votes) || {}; if (v.proposedCode) all[teamId] = v; else delete all[teamId]; save(LS.votes, all); emitLocal('votes'); }
    } catch (e) { reportErr('saveVote', e); }
  }
  async function savePlayer(key, data) {
    try {
      if (mode === 'firestore') { await fs.collection('players').doc(key).set(data); }
      else { const all = load(LS.players) || {}; all[key] = data; save(LS.players, all); emitLocal('players'); }
    } catch (e) { reportErr('savePlayer', e); }
  }

  return { init, subscribe, saveTeam, saveMatch, deleteMatch, saveVote, savePlayer, get mode() { return mode; } };
})();

/* ---------- 6. Subscription → state → render ---------- */
function applyTeams(data) {
  const merged = defaultTeams();
  Object.keys(data || {}).forEach(id => { merged[id] = Object.assign({}, merged[id] || {}, data[id]); });
  state.teams = merged;
  renderAll();
}
function applyMatches(data) {
  state.matches = (data || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  renderAll();
}
function applyVotes(data) {
  state.votes = data || {};
  renderAll();
}
function applyPlayers(data) {
  state.players = data || {};
  if (state.user) state.user.displayName = displayNameOf(state.user.teamId, state.user.member);
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

/* ---------- 7. Auth ---------- */
function persistUser() { try { localStorage.setItem(LS.user, JSON.stringify(state.user)); } catch (e) {} }
function restoreUser() {
  try { const v = localStorage.getItem(LS.user); if (v) { const u = JSON.parse(v); if (u && u.teamId && u.member) return u; } } catch (e) {}
  return null;
}
function populateLoginSelect() {
  const sel = document.getElementById('login-name');
  if (!sel) return;
  const prev = sel.value;
  const opts = Object.values(state.teams).map(t =>
    '<optgroup label="' + esc(t.name) + '">' +
      t.members.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('') +
    '</optgroup>').join('');
  sel.innerHTML = '<option value="" disabled' + (prev ? '' : ' selected') + '>Select your name…</option>' + opts;
  if (prev) { for (let i = 0; i < sel.options.length; i++) if (sel.options[i].value === prev) { sel.selectedIndex = i; break; } }
}
function handleLogin(name, code) {
  if (!name) return toast('Please select your name.', 'error');
  const team = Object.values(state.teams).find(t => t.members.indexOf(name) !== -1);
  if (!team) return toast('Player "' + esc(name) + '" not found.', 'error');
  if (team.secretCode !== (code || '').trim()) return toast('Invalid secret code for ' + team.name + '.', 'error');
  state.user = { teamId: team.id, member: name, displayName: displayNameOf(team.id, name) };
  persistUser();
  showMain();
  showPanel('dashboard');
  renderAll();
  toast('Welcome, ' + state.user.displayName + '! 🏏', 'success');
}
function logout() {
  state.user = null;
  state.activeMatchId = null;
  try { localStorage.removeItem(LS.user); } catch (e) {}
  showLogin();
}

/* ---------- 8. View / panel navigation ---------- */
function showLogin() {
  document.getElementById('view-login').classList.add('is-active');
  document.getElementById('view-main').classList.remove('is-active');
}
function showMain() {
  document.getElementById('view-login').classList.remove('is-active');
  document.getElementById('view-main').classList.add('is-active');
}
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('is-active'));
  const target = document.getElementById('panel-' + name);
  if (target) target.classList.add('is-active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
}
function renderHeader() {
  const u = state.user;
  document.getElementById('whoami').textContent = u ? u.displayName + ' · ' + getTeam(u.teamId).name : '';
}
function renderSyncStatus() {
  const online = db.mode === 'firestore';
  const main = document.getElementById('sync-status');
  if (main) {
    main.textContent = online ? '● Live' : '● Local';
    main.className = 'sync-status ' + (online ? 'online' : 'local');
    main.title = online
      ? 'Connected to Firestore — live sync across devices'
      : 'Local mode — paste your apiKey in app.js to enable live sync';
  }
  const login = document.getElementById('login-sync');
  if (login) {
    login.textContent = online ? '● Live sync (Firestore)' : '● Local mode (no Firestore)';
    login.className = 'sync-status ' + (online ? 'online' : 'local');
  }
}

/* ---------- 9. Dashboard ---------- */
function summaryLine(m) {
  return Object.keys(m.teams).map(id => {
    const t = m.teams[id], meta = getTeam(id);
    return meta.short + ' ' + t.runs + '/' + t.wickets;
  }).join('  ·  ');
}
function resultOf(m) {
  const ids = Object.keys(m.teams);
  if (ids.length < 2) return null;
  const a = m.teams[ids[0]], b = m.teams[ids[1]];
  if ((a.runs || 0) === (b.runs || 0)) return { draw: true, winnerName: '' };
  const w = (a.runs || 0) > (b.runs || 0) ? ids[0] : ids[1];
  return { draw: false, winnerName: getTeam(w).name, winnerId: w };
}
function matchSummaryHTML(m) {
  const ids = Object.keys(m.teams);
  const res = resultOf(m);
  const badge = m.status === 'live'
    ? '<span class="badge badge-live">● Live</span>'
    : '<span class="badge ' + (res && res.draw ? 'badge-draw' : 'badge-won') + '">' + (res && res.draw ? 'Draw' : 'Winner: ' + esc(res && res.winnerName)) + '</span>';
  return '' +
    '<div class="match-item glass">' +
      '<div class="m-top">' +
        '<div><div class="m-name">' + esc(m.name) + '</div><div class="m-date">' + fmtDate(m.createdAt) + ' · ' + (m.mode === 'quick' ? '⚡ Quick' : '📋 Detailed') + '</div></div>' +
        '<div class="row">' + badge +
          (m.status === 'completed' ? '<button class="btn btn-sm btn-ghost" data-action="delete-match" data-id="' + m.id + '" title="Delete">🗑</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="match-summary">' +
        ids.map(id => { const t = m.teams[id]; const meta = getTeam(id); return '<div class="side"><div class="s-name">' + esc(meta.name) + '</div><div class="s-score">' + (t.runs || 0) + '/' + (t.wickets || 0) + '</div></div>'; }).join('<div class="vs">vs</div>') +
      '</div>' +
    '</div>';
}
function renderDashboard() {
  const u = state.user; if (!u) return;
  document.getElementById('dash-name').textContent = u.displayName;
  const team = getTeam(u.teamId);

  document.getElementById('dash-team-card').innerHTML =
    '<h3 class="card-title">Your Team</h3>' +
    '<div class="row"><span class="badge badge-live" style="background:' + team.color + '33;color:' + team.color + '">' + esc(team.name) + '</span></div>' +
    '<p class="muted mt" style="font-size:.85rem">Members: ' + team.members.map(m => esc(displayNameOf(team.id, m))).join(', ') + '</p>' +
    '<p class="muted" style="font-size:.85rem">Secret code: <code>' + esc(team.secretCode) + '</code></p>';

  const live = state.matches.filter(m => m.status === 'live');
  document.getElementById('dash-live').innerHTML =
    '<h3 class="card-title">Live Now</h3>' +
    (live.length
      ? live.map(m =>
          '<div class="spread"><div><strong>' + esc(m.name) + '</strong><br/><span class="muted" style="font-size:.8rem">' + esc(summaryLine(m)) + '</span></div>' +
          '<button class="btn btn-sm" data-action="open-match" data-id="' + m.id + '">Open</button></div>' +
          '<hr style="border-color:rgba(255,255,255,.08);margin:10px 0" />').join('')
      : '<div class="empty" style="padding:18px 8px">No live match right now.</div>') +
    '<button class="btn btn-primary btn-block mt" data-action="go-match">＋ Start a Match</button>';

  const recent = state.matches.filter(m => m.status === 'completed').slice(0, 3);
  document.getElementById('dash-recent').innerHTML =
    '<h3 class="card-title">Recent Matches</h3>' +
    (recent.length ? recent.map(matchSummaryHTML).join('') : '<div class="empty" style="padding:14px 8px">No completed matches yet.</div>');
}

/* ---------- 10. Match setup + live scoring ---------- */
function renderMatchPanel() {
  const a = document.activeElement;
  if (a && (a.closest('#match-setup') || a.closest('#live-match'))) return; // don't clobber in-progress editing
  renderSetupForm();
  renderLiveArea();
}
function renderSetupForm() {
  document.getElementById('match-setup').innerHTML =
    '<h3 class="card-title">Start a Match</h3>' +
    '<form data-form="start">' +
      '<label class="field"><span>Match Name</span><input id="match-name" type="text" placeholder="e.g. Weekend Showdown" maxlength="60" required /></label>' +
      '<span class="field"><span>Scoring Mode</span></span>' +
      '<div class="mode-group">' +
        '<div class="mode-option' + (uiMode === 'quick' ? ' is-selected' : '') + '" data-mode="quick"><div class="m-title">⚡ Quick Mode</div><div class="m-desc">Enter total runs &amp; wickets at once.</div></div>' +
        '<div class="mode-option' + (uiMode === 'detailed' ? ' is-selected' : '') + '" data-mode="detailed"><div class="m-title">📋 Detailed Mode</div><div class="m-desc">Score player by player.</div></div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-block">🚀 Start Match</button>' +
    '</form>';
}
function renderLiveArea() {
  const el = document.getElementById('live-match');
  const live = state.matches.filter(m => m.status === 'live');

  if (state.activeMatchId) {
    const m = state.matches.find(x => x.id === state.activeMatchId);
    if (m && m.status === 'live') { el.innerHTML = liveHTML(m); return; }
    state.activeMatchId = null;
  }
  if (live.length) {
    el.innerHTML =
      '<h3 class="card-title"><span class="pulse"></span> Live Matches</h3>' +
      live.map(m =>
        '<div class="match-item glass"><div class="m-top">' +
          '<div><div class="m-name">' + esc(m.name) + '</div><div class="m-date">' + fmtDate(m.updatedAt) + ' · ' + m.mode + '</div></div>' +
          '<button class="btn btn-sm" data-action="open-match" data-id="' + m.id + '">Open →</button>' +
        '</div></div>').join('');
    return;
  }
  el.innerHTML = '<div class="empty"><span class="e-emoji">🏏</span>No live match right now.<br/>Start one above to begin scoring.</div>';
}
function liveHTML(m) {
  const youTeam = state.user ? state.user.teamId : null;
  const cards = Object.keys(m.teams).map(tid =>
    teamCardHTML(tid, m.teams[tid], getTeam(tid), m.mode, tid === youTeam)).join('');
  return '' +
    '<div class="spread">' +
      '<div><div class="row"><span class="pulse"></span><h3 class="card-title" style="margin:0">' + esc(m.name) + '</h3></div>' +
      '<div class="muted" style="font-size:.82rem">' + (m.mode === 'quick' ? '⚡ Quick Mode' : '📋 Detailed Mode') + ' · updated ' + fmtDate(m.updatedAt) + '</div></div>' +
      '<button class="btn btn-danger btn-sm" data-action="end-match" data-id="' + m.id + '">🏁 End Match</button>' +
    '</div>' +
    '<div class="grid grid-2 mt">' + cards + '</div>';
}
function teamCardHTML(tid, t, meta, mode, isYou) {
  const color = meta.color || '#3b82f6';
  let body = '';
  if (mode === 'quick') {
    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (t.runs || 0) + '</span><span class="score-meta">/ ' + (t.wickets || 0) + ' wickets</span></div>' +
      '<div class="grid grid-2 mt">' +
        '<label class="field"><span>Team Runs</span><input type="number" min="0" inputmode="numeric" value="' + (t.runs || 0) + '" data-score data-team="' + tid + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Wickets</span><input type="number" min="0" inputmode="numeric" value="' + (t.wickets || 0) + '" data-score data-team="' + tid + '" data-field="wickets"' + (isYou ? '' : ' disabled') + ' /></label>' +
      '</div>';
  } else {
    const rows = (t.players || []).map((p, i) => {
      const isSelf = isYou && state.user && p.member === state.user.member;
      const nameInput = p.member
        ? '<div class="p-name">' + esc(playerLabel(p, tid)) + (isSelf ? ' <span class="badge badge-you">you</span>' : '') + '</div>'
        : '<input type="text" value="' + esc(p.name) + '" data-rename data-team="' + tid + '" data-idx="' + i + '" class="p-name-input" placeholder="Player name" />';
      return '' +
        '<div class="player-row">' + nameInput +
          '<div class="p-inputs">' +
            '<label>Runs<input type="number" min="0" inputmode="numeric" value="' + (p.runs || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>Balls<input type="number" min="0" inputmode="numeric" value="' + (p.balls || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="balls"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>4s<input type="number" min="0" inputmode="numeric" value="' + (p.fours || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="fours"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>6s<input type="number" min="0" inputmode="numeric" value="' + (p.sixes || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="sixes"' + (isYou ? '' : ' disabled') + ' /></label>' +
          '</div>' +
          '<label class="p-out' + (p.out ? ' is-out' : '') + '"><input type="checkbox" data-out data-team="' + tid + '" data-idx="' + i + '"' + (p.out ? ' checked' : '') + (isYou ? '' : ' disabled') + ' /> Out (dismissed)</label>' +
        '</div>';
    }).join('');
    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (t.runs || 0) + '</span><span class="score-meta">/ ' + (t.wickets || 0) + ' wickets</span></div>' +
      '<div class="mt">' + rows + '</div>' +
      (isYou ? '<button class="btn btn-sm btn-ghost mt" data-action="add-player" data-team="' + tid + '">＋ Add Player</button>' : '');
  }
  return '' +
    '<div class="glass card team-card" style="border-top-color:' + color + '">' +
      '<div class="t-head"><span class="t-name">' + esc(meta.name) + '</span>' + (isYou ? '<span class="badge badge-you">Your team</span>' : '') + '</div>' +
      body +
    '</div>';
}

function getActiveMatch() { return state.matches.find(m => m.id === state.activeMatchId); }
function recomputeTeam(t) {
  t.runs = (t.players || []).reduce((s, p) => s + (+p.runs || 0), 0);
  t.wickets = (t.players || []).filter(p => p.out).length;
}
function updateTotalsEl(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t) return;
  const el = document.getElementById('totals-' + teamId);
  if (el) el.innerHTML = '<span class="score-big">' + (t.runs || 0) + '</span><span class="score-meta">/ ' + (t.wickets || 0) + ' wickets</span>';
}

function startMatch() {
  const nameEl = document.getElementById('match-name');
  const name = (nameEl.value || '').trim();
  if (!name) return toast('Please enter a match name.', 'error');
  const id = 'm_' + uid();
  const teams = {};
  Object.values(state.teams).forEach(t => {
    teams[t.id] = {
      runs: 0, wickets: 0,
      players: uiMode === 'detailed'
        ? t.members.map(m => ({ key: m, name: displayNameOf(t.id, m), member: m, runs: 0, balls: 0, fours: 0, sixes: 0, out: false }))
        : []
    };
  });
  const match = { id, name, mode: uiMode, status: 'live', createdAt: Date.now(), updatedAt: Date.now(), teams };
  db.saveMatch(match).then(() => {
    if (!state.matches.some(x => x.id === id)) state.matches.push(match);
    state.activeMatchId = id;
    nameEl.value = '';
    showPanel('match');
    renderMatchPanel();
    toast('Match "' + name + '" started — good luck! 🏏', 'success');
  });
}

async function endMatch(id) {
  const m = state.matches.find(x => x.id === id); if (!m) return;
  if (!confirm('End match "' + m.name + '" and finalize results?')) return;
  m.status = 'completed';
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  if (state.activeMatchId === id) state.activeMatchId = null;
  toast('Match completed. Awards updated! 🏆', 'success');
}
async function deleteMatch(id) {
  const m = state.matches.find(x => x.id === id); if (!m) return;
  if (!confirm('Delete match "' + m.name + '"? This cannot be undone.')) return;
  await db.deleteMatch(id);
  if (state.activeMatchId === id) state.activeMatchId = null;
  toast('Match deleted.', 'success');
}
async function addPlayer(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t) return;
  t.players.push({ key: 'guest-' + uid(), name: 'Player ' + (t.players.length + 1), member: null, runs: 0, balls: 0, fours: 0, sixes: 0, out: false });
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}

/* ---------- 11. Scoring input handlers ---------- */
function updateScoreLocal(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const val = Math.max(0, parseInt(el.value, 10) || 0);
  if (m.mode === 'quick') {
    t[el.dataset.field] = val;
  } else {
    const p = t.players[+el.dataset.idx]; if (!p) return;
    p[el.dataset.field] = val;
    recomputeTeam(t);
  }
  m.updatedAt = Date.now();
  updateTotalsEl(el.dataset.team);
}
async function saveScoreField(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const val = Math.max(0, parseInt(el.value, 10) || 0);
  if (m.mode === 'quick') { t[el.dataset.field] = val; }
  else { const p = t.players[+el.dataset.idx]; if (p) { p[el.dataset.field] = val; recomputeTeam(t); } }
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}
async function toggleOut(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const p = t.players[+el.dataset.idx]; if (!p) return;
  p.out = el.checked;
  recomputeTeam(t);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  updateTotalsEl(el.dataset.team);
}
async function renamePlayer(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const p = t.players[+el.dataset.idx]; if (!p) return;
  const name = (el.value || '').trim();
  if (name) { p.name = name; if (!p.member) p.key = name; }
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}

/* ---------- 12. History ---------- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!state.matches.length) {
    el.innerHTML = '<div class="empty"><span class="e-emoji">📭</span>No matches yet. Start one from the Match tab.</div>';
    return;
  }
  el.innerHTML = state.matches.map(matchSummaryHTML).join('');
}

/* ---------- 13. Analysis (charts + awards) ---------- */
function renderAnalysis() {
  const sel = document.getElementById('chart-select');
  const prev = sel.value;
  const options = [{ value: '__series__', label: 'Series Total (all matches)' }];
  state.matches.forEach(m => options.push({ value: m.id, label: (m.status === 'live' ? '🔴 ' : '') + m.name }));
  sel.innerHTML = options.map(o => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('');
  if (prev && options.some(o => o.value === prev)) sel.value = prev;
  renderCharts();
  renderAwards();
}
function drawPie(id, existing, labels, data, colors) {
  const ctx = document.getElementById(id);
  if (!ctx) return null;
  if (typeof Chart === 'undefined') {
    ctx.parentElement.innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">Chart library unavailable (check connection).</div>';
    return null;
  }
  if (existing) { try { existing.destroy(); } catch (e) {} }
  if (!data.length) {
    return new Chart(ctx, {
      type: 'pie',
      data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.08)'], borderColor: 'rgba(5,7,13,0.6)', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
  }
  return new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: 'rgba(5,7,13,0.6)', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 12 } } } } }
  });
}
function renderCharts() {
  const sel = document.getElementById('chart-select').value;

  // Team performance pie
  let labels = [], data = [], colors = [];
  if (sel === '__series__') {
    Object.values(state.teams).forEach(t => {
      labels.push(t.name);
      data.push(state.matches.reduce((s, m) => s + (+(m.teams[t.id] && m.teams[t.id].runs) || 0), 0));
      colors.push(t.color || '#3b82f6');
    });
  } else {
    const m = state.matches.find(x => x.id === sel);
    if (m) Object.keys(m.teams).forEach(id => {
      const t = m.teams[id], meta = getTeam(id);
      labels.push(meta.name); data.push(+t.runs || 0); colors.push(meta.color || '#3b82f6');
    });
  }
  chartTeam = drawPie('pie-team', chartTeam, labels, data, colors);

  // Player run distribution pie (detailed matches only)
  const note = document.getElementById('player-chart-note');
  const m = sel !== '__series__' ? state.matches.find(x => x.id === sel) : null;
  if (m && m.mode === 'detailed') {
    const pl = [], pd = [], pc = [];
    Object.entries(m.teams).forEach(([tid, t]) => {
      const meta = getTeam(tid);
      (t.players || []).forEach(p => { if (+p.runs || 0) { pl.push(playerLabel(p, tid)); pd.push(+p.runs || 0); pc.push(meta.color || '#3b82f6'); } });
    });
    chartPlayers = drawPie('pie-players', chartPlayers, pl, pd, pc);
    note.textContent = pl.length ? 'Runs by player in this match.' : 'No runs scored yet in this match.';
  } else {
    chartPlayers = drawPie('pie-players', chartPlayers, [], [], []);
    note.textContent = sel === '__series__' ? 'Select a detailed match to see player distribution.' : 'Player distribution only available for Detailed Mode matches.';
  }
}
function computeAwards() {
  const completed = state.matches.filter(m => m.status === 'completed');
  const series = {};
  let bestPlayer = null; // most runs in a single innings
  let mom = null;        // highest impact in a single match

  completed.forEach(m => {
    if (m.mode !== 'detailed') return;
    let matchTop = null;
    Object.entries(m.teams).forEach(([tid, t]) => {
      (t.players || []).forEach(p => {
        const runs = +p.runs || 0, fours = +p.fours || 0, sixes = +p.sixes || 0;
        const impact = runs + fours + sixes * 2;
        const key = p.member || p.name;
        const label = playerLabel(p, tid);
        if (!series[key]) series[key] = { key, label, teamId: tid, runs: 0, impact: 0, matches: 0 };
        const s = series[key];
        s.runs += runs; s.impact += impact; s.matches += 1; s.label = label;
        if (!bestPlayer || runs > bestPlayer.runs) bestPlayer = { label, runs, matchName: m.name };
        if (!matchTop || impact > matchTop.impact) matchTop = { label, impact, matchName: m.name };
      });
    });
    if (matchTop && (!mom || matchTop.impact > mom.impact)) mom = matchTop;
  });

  const pos = Object.values(series).reduce((acc, s) => (!acc || s.impact > acc.impact) ? s : acc, null);
  return { bestPlayer, mom, pos };
}
function renderAwards() {
  const a = computeAwards();
  const card = (emoji, title, name, sub, hl) =>
    '<div class="award' + (hl ? ' highlight' : '') + '">' +
      '<div class="a-emoji">' + emoji + '</div>' +
      '<div class="a-title">' + title + '</div>' +
      '<div class="a-name">' + (name ? esc(name) : '—') + '</div>' +
      '<div class="a-sub">' + (sub ? esc(sub) : '') + '</div>' +
    '</div>';
  document.getElementById('awards').innerHTML =
    '<h3 class="card-title">🏆 Automatic Awards</h3>' +
    '<div class="award-grid">' +
      card('🥇', 'Best Player', a.bestPlayer && a.bestPlayer.label, a.bestPlayer ? a.bestPlayer.runs + ' runs · ' + a.bestPlayer.matchName : 'No detailed matches yet', !!a.bestPlayer) +
      card('🏅', 'Man of the Match', a.mom && a.mom.label, a.mom ? a.mom.impact + ' impact pts · ' + a.mom.matchName : 'No detailed matches yet', !!a.mom) +
      card('👑', 'Player of the Series', a.pos && a.pos.label, a.pos ? a.pos.impact + ' impact pts · ' + a.pos.matches + ' match(es)' : 'No detailed matches yet', !!a.pos) +
    '</div>';
}

/* ---------- 14. Team profile + secret-code vote ---------- */
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
  toast('Display name updated!', 'success');
}
function checkVotePassed(teamId, v) {
  const needed = majority(teamId);
  const got = Object.keys(v.votes || {}).length;
  if (got >= needed) {
    state.teams[teamId].secretCode = v.proposedCode;
    db.saveTeam(teamId, state.teams[teamId]);
    db.saveVote(teamId, { proposedCode: '', votes: {} });
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
  if (!v.proposedCode) return toast('No active vote.', 'error');
  v.votes[state.user.member] = true;
  db.saveVote(teamId, v);
  checkVotePassed(teamId, v);
}
function renderTeam() {
  const u = state.user; if (!u) return;
  const a = document.activeElement;
  if (a && (a.closest('#team-profile') || a.closest('#team-vote'))) return; // don't clobber typing
  const team = getTeam(u.teamId);

  document.getElementById('team-profile').innerHTML =
    '<h3 class="card-title">Your Profile</h3>' +
    '<p class="muted" style="font-size:.85rem">Logged in as <strong style="color:var(--white)">' + esc(u.member) + '</strong> · ' + esc(team.name) + '</p>' +
    '<form data-form="profile" class="mt">' +
      '<label class="field"><span>Display Name</span><input id="display-name-input" type="text" value="' + esc(u.displayName) + '" maxlength="30" required /></label>' +
      '<button type="submit" class="btn btn-primary btn-block">Save Display Name</button>' +
    '</form>' +
    '<h3 class="card-title mt">Team Members</h3>' +
    team.members.map(m =>
      '<div class="row" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span>' + esc(displayNameOf(team.id, m)) + '</span>' +
      (m === u.member ? '<span class="badge badge-you">you</span>' : '') + '</div>').join('');

  const v = state.votes[u.teamId] || { proposedCode: '', votes: {} };
  const needed = majority(team.id);
  const got = Object.keys(v.votes || {}).length;
  const voters = Object.keys(v.votes || {}).map(esc).join(', ');
  const activeVote = v.proposedCode && got > 0;
  const alreadyVoted = !!v.votes[u.member];

  document.getElementById('team-vote').innerHTML =
    '<h3 class="card-title">🔐 Change Team Secret Code</h3>' +
    '<p class="muted" style="font-size:.85rem">Current code: <code>' + esc(team.secretCode) + '</code></p>' +
    (activeVote
      ? '<div class="mt" style="background:rgba(0,0,0,.22);border-radius:12px;padding:12px">' +
          '<div class="spread"><span>Proposed:</span><code>' + esc(v.proposedCode) + '</code></div>' +
          '<div class="muted" style="font-size:.82rem;margin-top:6px">Votes ' + got + '/' + needed + ' — ' + voters + '</div>' +
          '<div class="progress mt"><div class="progress-fill" style="width:' + Math.min(100, got / needed * 100) + '%"></div></div>' +
          '<p class="hint">A majority must approve. Proposing a different code resets the vote.</p>' +
        '</div>'
      : '<p class="hint">No active vote. Propose a new code — it needs ' + needed + ' vote(s) to take effect.</p>') +
    (activeVote && !alreadyVoted
      ? '<button class="btn btn-primary btn-block mt" data-action="vote-yes">👍 Vote Yes for "' + esc(v.proposedCode) + '"</button>' : '') +
    '<form data-form="vote" class="mt">' +
      '<label class="field"><span>New Secret Code</span><input id="vote-code-input" type="text" placeholder="e.g. NewSecret123" minlength="4" required /></label>' +
      '<button type="submit" class="btn btn-block">Propose / Vote</button>' +
    '</form>';
}

/* ---------- 15. Event wiring ---------- */
function globalClick(e) {
  const modeOpt = e.target.closest('.mode-option');
  if (modeOpt) { uiMode = modeOpt.dataset.mode; renderSetupForm(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'open-match': state.activeMatchId = el.dataset.id; renderLiveArea(); showPanel('match'); break;
    case 'end-match': endMatch(el.dataset.id); break;
    case 'delete-match': deleteMatch(el.dataset.id); break;
    case 'add-player': addPlayer(el.dataset.team); break;
    case 'vote-yes': voteYes(); break;
    case 'go-match': showPanel('match'); break;
  }
}
function globalSubmit(e) {
  const kind = e.target && e.target.dataset ? e.target.dataset.form : null;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'start') startMatch();
  else if (kind === 'profile') saveDisplayName(document.getElementById('display-name-input').value);
  else if (kind === 'vote') voteForCode(document.getElementById('vote-code-input').value);
}
function globalInput(e) {
  const el = e.target;
  if (el && el.dataset && el.dataset.score !== undefined) updateScoreLocal(el);
}
function globalChange(e) {
  const el = e.target;
  if (!el || !el.dataset) return;
  if (el.dataset.score !== undefined) saveScoreField(el);
  else if (el.dataset.out !== undefined) toggleOut(el);
  else if (el.dataset.rename !== undefined) renamePlayer(el);
}

/* ---------- 16. Init ---------- */
function init() {
  const mode = db.init();
  console.log('[Thursday Cricket] data mode:', mode);
  populateLoginSelect();
  renderSyncStatus();

  db.subscribe('teams', applyTeams);
  db.subscribe('matches', applyMatches);
  db.subscribe('votes', applyVotes);
  db.subscribe('players', applyPlayers);

  document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    handleLogin(document.getElementById('login-name').value, document.getElementById('login-code').value);
  });
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('main-nav').addEventListener('click', e => {
    const b = e.target.closest('.nav-btn');
    if (b) showPanel(b.dataset.view);
  });
  document.getElementById('chart-select').addEventListener('change', renderCharts);

  document.addEventListener('click', globalClick);
  document.addEventListener('submit', globalSubmit);
  document.addEventListener('input', globalInput);
  document.addEventListener('change', globalChange);

  window.addEventListener('unhandledrejection', e => {
    console.error('[Thursday Cricket] Unhandled promise rejection:', e.reason);
    toast('⚠️ Something went wrong. Check your connection and try again.', 'error');
  });

  const saved = restoreUser();
  if (saved) {
    state.user = saved;
    state.user.displayName = displayNameOf(saved.teamId, saved.member);
    showMain();
    showPanel('dashboard');
    renderAll();
  } else {
    showLogin();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
