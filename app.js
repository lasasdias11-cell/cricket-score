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

/* ---------- 3. Global state ---------- */
const state = {
  user: null,          // { teamId, member, displayName }
  teams: defaultTeams(),
  matches: [],
  votes: {},           // { [teamId]: { proposedCode, votes: {member:true} } }
  players: {},         // { [teamId__member]: { displayName } }
  activeMatchId: null,
  syncError: false
};

let uiMode = 'quick';       // currently selected scoring mode in the setup form
let chartTeam = null;       // Chart.js instances (kept for destroy/update)
let chartPlayers = null;
let localEditUntil = 0;     // suppress live-area rebuild while scoring (avoids dropped taps)
const undoStack = {};       // { matchId: { teamId: [snapshot, ...] } }
function markLocalEdit() { localEditUntil = Date.now() + 900; }
function isRecentLocalEdit() { return Date.now() < localEditUntil; }

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
function fmtOvers(balls) { return Math.floor((balls || 0) / 6) + '.' + ((balls || 0) % 6); }
function parseOversToBalls(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(val) || 0;
  const fullOvers = Math.floor(num);
  const remBalls = Math.min(5, Math.max(0, Math.round((num - fullOvers) * 10)));
  return (fullOvers * 6) + remBalls;
}
function isDetailedMatch(m) {
  if (!m) return false;
  return m.mode === 'detailed' || m.mode === 'post-detailed' || (m.teams && Object.values(m.teams).some(t => t.players && t.players.length > 0));
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
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
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
    fail._t = setTimeout(() => toast('⚠️ Firestore sync issue — check rules & connection.', 'error'), 300);
  }

  async function saveTeam(id, data) {
    const clean = sanitizeForFirestore(data);
    try {
      if (mode === 'firestore') {
        await ensureAuth();
        await fs.collection('teams').doc(id).set(clean, { merge: true });
      }
    } catch (e) { fail('saveTeam', e); }
    finally {
      const all = load(LS.teams) || {};
      all[id] = clean;
      save(LS.teams, all);
      if (mode !== 'firestore') emitLocal('teams');
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
        if (clean && clean.proposedCode) await fs.collection('teamVotes').doc(teamId).set(clean);
        else await fs.collection('teamVotes').doc(teamId).delete();
      }
    } catch (e) { fail('saveVote', e); }
    finally {
      const all = load(LS.votes) || {};
      if (clean && clean.proposedCode) all[teamId] = clean; else delete all[teamId];
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

  return { init, onError, subscribe, saveTeam, saveMatch, deleteMatch, saveVote, savePlayer, get mode() { return mode; } };
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
  if (isRecentLocalEdit()) {
    // A local scoring tap already updated the UI in place; skip rebuilding the
    // live area from our own Firestore echo so rapid taps aren't dropped.
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
  showSection('dashboard-section');
  renderAll();
  toast('Welcome, ' + state.user.displayName + '! 🏏', 'success');
}
function logout() {
  state.user = null;
  state.activeMatchId = null;
  try { localStorage.removeItem(LS.user); } catch (e) {}
  showSection('login-section');
}

/* ---------- 8. Section router ---------- */
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
  document.getElementById('whoami').textContent = u ? u.displayName + ' · ' + getTeam(u.teamId).name : '';
}
function renderSyncStatus() {
  const online = db.mode === 'firestore';
  const error = online && state.syncError;
  const main = document.getElementById('sync-status');
  if (main) {
    if (error) {
      main.textContent = '● Error — check rules';
      main.className = 'sync-status error';
      main.title = 'Firestore is rejecting requests — deploy firestore.rules and enable the Anonymous auth provider.';
    } else {
      main.textContent = online ? '● Live' : '● Local';
      main.className = 'sync-status ' + (online ? 'online' : 'local');
      main.title = online ? 'Connected to Firestore — live sync across devices' : 'Local demo mode — add your apiKey for cloud sync';
    }
  }
  const login = document.getElementById('login-sync');
  if (login) {
    login.textContent = error ? '● Firestore error — check rules' : (online ? '● Live sync (Firestore)' : '● Local demo (no Firebase)');
    login.className = 'sync-status ' + (error ? 'error' : (online ? 'online' : 'local'));
  }
  const banner = document.getElementById('sync-error');
  if (banner) banner.classList.toggle('hidden', !error);
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
  const ids = Object.keys(m.teams || {});
  const res = resultOf(m);
  const badge = m.status === 'live'
    ? '<span class="badge badge-live"><span class="pulse" style="margin-right:4px"></span>Live</span>'
    : '<span class="badge ' + (res && res.draw ? 'badge-draw' : 'badge-won') + '">' + (res && res.draw ? 'Draw' : 'Winner: ' + esc(res && res.winnerName)) + '</span>';
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
        ids.map(id => { const t = m.teams[id] || {}; const meta = getTeam(id); return '<div class="side"><div class="s-name">' + esc(meta.name) + '</div><div class="s-score">' + (t.runs || 0) + '/' + (t.wickets || 0) + '</div></div>'; }).join('<div class="vs">vs</div>') +
      '</div>' +
    '</div>';
}
function renderDashboard() {
  const u = state.user; if (!u) return;
  document.getElementById('dash-name').textContent = u.displayName;
  const team = getTeam(u.teamId);

  const captainName = team.captain ? displayNameOf(team.id, team.captain) : 'Not elected yet (Vote in Settings)';
  document.getElementById('dash-team-card').innerHTML =
    '<h3 class="card-title">Your Team</h3>' +
    '<div class="row">' +
      '<span class="badge badge-live" style="background:' + team.color + '33;color:' + team.color + '">' + esc(team.name) + '</span>' +
      (team.captain ? '<span class="badge badge-captain">👑 ' + esc(captainName) + ' (Captain)</span>' : '') +
    '</div>' +
    '<p class="mt" style="font-size:.88rem">👑 <strong>Active Captain:</strong> <span class="accent">' + esc(captainName) + '</span></p>' +
    '<p class="muted mt" style="font-size:.85rem">Members: ' + team.members.map(m => esc(displayNameOf(team.id, m)) + (m === team.captain ? ' (C)' : '')).join(', ') + '</p>' +
    '<p class="muted" style="font-size:.85rem">Secret code: <code>' + esc(team.secretCode) + '</code></p>';

  const live = state.matches.filter(m => m.status === 'live');
  document.getElementById('dash-live').innerHTML =
    '<h3 class="card-title"><span class="pulse" style="margin-right:6px"></span>Live Scoreboards</h3>' +
    (live.length
      ? live.map(m =>
          '<div class="spread"><div><strong>' + esc(m.name) + '</strong><br/><span class="muted" style="font-size:.8rem">' + esc(summaryLine(m)) + ' · ' + modeLabel(m.mode) + '</span></div>' +
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
        '<div class="mode-option' + (uiMode === 'quick' ? ' is-selected' : '') + '" data-mode="quick"><div class="m-title">⚡ Quick Match</div><div class="m-desc">Fast totals (runs &amp; wickets directly).</div></div>' +
        '<div class="mode-option' + (uiMode === 'detailed' ? ' is-selected' : '') + '" data-mode="detailed"><div class="m-title">📋 Live Detailed</div><div class="m-desc">Live ball-by-ball striker run pad.</div></div>' +
        '<div class="mode-option' + (uiMode === 'retro' ? ' is-selected' : '') + '" data-mode="retro"><div class="m-title">🗂 Post-Match Retro</div><div class="m-desc">Quick retroactive totals &amp; overs.</div></div>' +
        '<div class="mode-option' + (uiMode === 'post-detailed' ? ' is-selected' : '') + '" data-mode="post-detailed"><div class="m-title">📝 Post-Match Detailed</div><div class="m-desc">Complete player-by-player batting &amp; bowling scorecard.</div></div>' +
      '</div>' +
      '<button type="submit" class="btn btn-primary btn-block">🚀 Start / Log Match</button>' +
    '</form>';
}
function renderLiveArea() {
  const el = document.getElementById('live-match');
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
  const isPostDetailed = m.mode === 'post-detailed';
  const isRetro = m.mode === 'retro';
  const isQuick = m.mode === 'quick';
  // Allow seamless input across both teams for Post-Match Detailed, Retro, and Quick modes
  const canEditBoth = isPostDetailed || isRetro || isQuick;
  const cards = Object.keys(m.teams || {}).map(tid =>
    teamCardHTML(tid, m.teams[tid], getTeam(tid), m.mode, canEditBoth || tid === (state.user ? state.user.teamId : null))).join('');
  const headerAction = m.status === 'live'
    ? '<button class="btn btn-danger btn-sm" data-action="end-match" data-id="' + m.id + '">🏁 ' + (isPostDetailed || isRetro ? 'Save & Finalize Match' : 'End Match') + '</button>'
    : '<div class="row"><span class="badge badge-won">✓ Completed</span><button class="btn btn-sm btn-ghost" data-action="reopen-match" data-id="' + m.id + '" title="Reopen match to edit">✏️ Edit</button></div>';
  return '' +
    '<div class="spread">' +
      '<div><div class="row">' + (m.status === 'live' ? '<span class="pulse"></span>' : '') + '<h3 class="card-title" style="margin:0">' + esc(m.name) + '</h3></div>' +
      '<div class="muted" style="font-size:.82rem">' + modeLabel(m.mode) + ' · updated ' + fmtDate(m.updatedAt) + '</div></div>' +
      headerAction +
    '</div>' +
    (isPostDetailed ? '<p class="hint" style="margin-top:6px">📝 <strong>Post-Match Detailed Mode</strong>: Log runs, balls, 4s, 6s, dismissal out/not-out, and bowling figures for both teams seamlessly.</p>' : '') +
    (isRetro ? '<p class="hint" style="margin-top:6px">🗂 <strong>Post-Match Retro</strong>: Enter match total runs, wickets, and overs for both teams.</p>' : '') +
    '<div class="grid grid-2 mt">' + cards + '</div>';
}
function teamCardHTML(tid, t, meta, mode, isYou) {
  const color = meta.color || '#3b82f6';
  t = t || { runs: 0, wickets: 0, overs: 0, players: [], bowlers: [] };
  let body = '';
  if (mode === 'quick') {
    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (t.runs || 0) + '</span><span class="score-meta">/ ' + (t.wickets || 0) + ' wickets</span></div>' +
      '<div class="grid grid-2 mt">' +
        '<label class="field"><span>Team Runs</span><input type="number" min="0" inputmode="numeric" value="' + (t.runs || 0) + '" data-score data-team="' + tid + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Wickets Fallen</span><input type="number" min="0" max="10" inputmode="numeric" value="' + (t.wickets || 0) + '" data-score data-team="' + tid + '" data-field="wickets"' + (isYou ? '' : ' disabled') + ' /></label>' +
      '</div>';
  } else if (mode === 'post-detailed') {
    const rows = (t.players || []).map((p, i) => {
      const label = playerLabel(p, tid);
      const nameHtml = p.member
        ? '<div class="pd-name"><span class="badge badge-you" style="font-size:.7rem;padding:2px 8px">' + esc(meta.short) + '</span> ' + esc(label) + '</div>'
        : '<div class="row" style="flex:1"><input type="text" value="' + esc(p.name) + '" data-rename data-team="' + tid + '" data-idx="' + i + '" class="p-name-input" placeholder="Player name" /><button type="button" class="btn btn-sm btn-ghost" data-action="remove-player" data-team="' + tid + '" data-idx="' + i + '" title="Remove">✕</button></div>';
      const sr = p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';

      return '' +
        '<div class="player-detailed-card' + (p.out ? ' is-dismissed' : '') + '">' +
          '<div class="pd-header">' +
            nameHtml +
            '<span class="pd-sr">SR: ' + sr + '</span>' +
          '</div>' +
          '<div class="pd-inputs">' +
            '<div class="pd-input-wrap"><label>Runs</label><input type="number" min="0" inputmode="numeric" value="' + (p.runs || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>Balls</label><input type="number" min="0" inputmode="numeric" value="' + (p.balls || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="balls"' + (isYou ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>4s</label><input type="number" min="0" inputmode="numeric" value="' + (p.fours || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="fours"' + (isYou ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>6s</label><input type="number" min="0" inputmode="numeric" value="' + (p.sixes || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="sixes"' + (isYou ? '' : ' disabled') + ' /></div>' +
          '</div>' +
          '<div class="pd-footer">' +
            '<label class="pd-status-toggle' + (p.out ? ' is-out' : ' not-out') + '">' +
              '<input type="checkbox" data-out data-team="' + tid + '" data-idx="' + i + '"' + (p.out ? ' checked' : '') + (isYou ? '' : ' disabled') + ' />' +
              '<span>' + (p.out ? '❌ Out (Dismissed)' : '🏏 Not Out') + '</span>' +
            '</label>' +
          '</div>' +
        '</div>';
    }).join('');

    const bowlingRows = (t.bowlers || []).map((b, i) => {
      const bLabel = b.member ? displayNameOf(tid, b.member) : b.name;
      const balls = b.balls || 0;
      const oversVal = fmtOvers(balls);
      const econ = balls > 0 ? (b.runs / (balls / 6)).toFixed(1) : '0.0';

      const nameHtml = b.member
        ? '<div class="bd-name">' + esc(bLabel) + '</div>'
        : '<div class="row" style="flex:1"><input type="text" value="' + esc(b.name) + '" data-rename-bowler data-team="' + tid + '" data-idx="' + i + '" class="p-name-input" placeholder="Bowler name" /><button type="button" class="btn btn-sm btn-ghost" data-action="remove-bowler" data-team="' + tid + '" data-idx="' + i + '" title="Remove">✕</button></div>';

      return '' +
        '<div class="bowl-detailed-card">' +
          '<div class="bd-header">' +
            nameHtml +
            '<div class="bd-econ">Econ: ' + econ + '</div>' +
          '</div>' +
          '<div class="bd-inputs">' +
            '<div class="pd-input-wrap"><label>Overs (e.g. 2.4)</label><input type="number" step="0.1" min="0" inputmode="decimal" value="' + oversVal + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="overs"' + (isYou ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>Runs</label><input type="number" min="0" inputmode="numeric" value="' + (b.runs || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></div>' +
            '<div class="pd-input-wrap"><label>Wickets</label><input type="number" min="0" inputmode="numeric" value="' + (b.wickets || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="wickets"' + (isYou ? '' : ' disabled') + ' /></div>' +
          '</div>' +
        '</div>';
    }).join('');

    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (t.runs || 0) + '</span><span class="score-meta">/ ' + (t.wickets || 0) + ' wickets</span></div>' +
      '<div class="scorecard-subhead"><span>🏏 Batting Scorecard</span>' + (isYou ? '<button type="button" class="btn btn-sm btn-ghost" data-action="add-player" data-team="' + tid + '">＋ Add Batter</button>' : '') + '</div>' +
      '<div>' + (rows || '<div class="empty" style="padding:12px">No batters yet.</div>') + '</div>' +
      '<div class="scorecard-subhead mt"><span>🎯 Bowling Figures</span>' + (isYou ? '<button type="button" class="btn btn-sm btn-ghost" data-action="add-bowler" data-team="' + tid + '">＋ Add Bowler</button>' : '') + '</div>' +
      '<div>' + (bowlingRows || '<div class="empty" style="padding:12px">No bowlers yet.</div>') + '</div>';
  } else if (mode === 'retro') {
    const rows = (t.players || []).map((p, i) => {
      const label = playerLabel(p, tid);
      const nameHtml = p.member
        ? '<div class="p-name">' + esc(label) + '</div>'
        : '<input type="text" value="' + esc(p.name) + '" data-rename data-team="' + tid + '" data-idx="' + i + '" class="p-name-input" placeholder="Player name" />';
      return '' +
        '<div class="player-row">' + nameHtml +
          '<div class="p-inputs">' +
            '<label>Runs<input type="number" min="0" inputmode="numeric" value="' + (p.runs || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>Balls<input type="number" min="0" inputmode="numeric" value="' + (p.balls || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="balls"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>4s<input type="number" min="0" inputmode="numeric" value="' + (p.fours || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="fours"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>6s<input type="number" min="0" inputmode="numeric" value="' + (p.sixes || 0) + '" data-score data-team="' + tid + '" data-idx="' + i + '" data-field="sixes"' + (isYou ? '' : ' disabled') + ' /></label>' +
          '</div>' +
          '<label class="p-out' + (p.out ? ' is-out' : '') + '"><input type="checkbox" data-out data-team="' + tid + '" data-idx="' + i + '"' + (p.out ? ' checked' : '') + (isYou ? '' : ' disabled') + ' /> Out (dismissed)</label>' +
        '</div>';
    }).join('');
    const bowling = '<div class="card-title mt">🎯 Bowling</div>' +
      '<div class="bowlers">' + (t.bowlers || []).map((b, i) =>
        '<div class="bowl-row">' +
          '<div class="b-name">' + esc(b.member ? displayNameOf(tid, b.member) : b.name) + '</div>' +
          '<div class="b-overs">' + fmtOvers(b.balls || 0) + ' ov</div>' +
          '<div class="b-inputs">' +
            '<label>Overs<input type="number" step="0.1" min="0" inputmode="decimal" value="' + fmtOvers(b.balls || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="overs"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>Runs<input type="number" min="0" inputmode="numeric" value="' + (b.runs || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>Wkts<input type="number" min="0" inputmode="numeric" value="' + (b.wickets || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="wickets"' + (isYou ? '' : ' disabled') + ' /></label>' +
          '</div>' +
        '</div>').join('') + '</div>';
    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (t.runs || 0) + '</span><span class="score-meta">/ ' + (t.wickets || 0) + ' wickets</span></div>' +
      '<div class="grid grid-2 mt">' +
        '<label class="field"><span>Team Runs</span><input type="number" min="0" inputmode="numeric" value="' + (t.runs || 0) + '" data-score data-team="' + tid + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
        '<label class="field"><span>Wickets Fallen</span><input type="number" min="0" max="10" inputmode="numeric" value="' + (t.wickets || 0) + '" data-score data-team="' + tid + '" data-field="wickets"' + (isYou ? '' : ' disabled') + ' /></label>' +
      '</div>' +
      '<div class="mt">' + rows + '</div>' +
      bowling +
      (isYou ? '<button type="button" class="btn btn-sm btn-ghost mt" data-action="add-player" data-team="' + tid + '">＋ Add Player</button>' : '');
  } else {
    const striker = t.striker || 0;
    const rows = (t.players || []).map((p, i) => {
      const isStriker = i === striker;
      const label = playerLabel(p, tid);
      const clickAttr = isYou ? ' data-action="set-striker" data-team="' + tid + '" data-idx="' + i + '"' : '';
      return '' +
        '<div class="prow' + (isStriker ? ' is-striker' : '') + (p.out ? ' is-out' : '') + '"' + clickAttr + '>' +
          '<div class="p-name">' + esc(label) +
            (isStriker ? ' <span class="badge badge-live">batting</span>' : '') +
            (p.out ? ' <span class="badge badge-lost">out</span>' : '') +
          '</div>' +
          '<div class="p-stat">' + (p.runs || 0) + ' runs · ' + (p.balls || 0) + ' balls' + (p.fours ? ' · ' + p.fours + '×4' : '') + (p.sixes ? ' · ' + p.sixes + '×6' : '') + '</div>' +
        '</div>';
    }).join('');
    const strikerName = (t.players[striker] && playerLabel(t.players[striker], tid)) || '—';
    const runpad = isYou
      ? '<div class="runpad">' +
          [0, 1, 2, 3, 4, 6].map(r => '<button type="button" class="run-btn" data-action="ball" data-team="' + tid + '" data-runs="' + r + '">' + r + '</button>').join('') +
          '<button type="button" class="run-btn wicket" data-action="wicket" data-team="' + tid + '">W</button>' +
          '<button type="button" class="run-btn undo" data-action="undo" data-team="' + tid + '">↩</button>' +
        '</div>'
      : '';
    const bowling = '<div class="card-title mt">🎯 Bowling</div>' +
      '<div class="bowlers">' + (t.bowlers || []).map((b, i) =>
        '<div class="bowl-row">' +
          '<div class="b-name">' + esc(b.member ? displayNameOf(tid, b.member) : b.name) + '</div>' +
          '<div class="b-overs">' + fmtOvers(b.balls || 0) + ' ov</div>' +
          '<div class="b-inputs">' +
            '<label>Overs<input type="number" step="0.1" min="0" inputmode="decimal" value="' + fmtOvers(b.balls || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="overs"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>Runs<input type="number" min="0" inputmode="numeric" value="' + (b.runs || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="runs"' + (isYou ? '' : ' disabled') + ' /></label>' +
            '<label>Wkts<input type="number" min="0" inputmode="numeric" value="' + (b.wickets || 0) + '" data-bowl data-team="' + tid + '" data-idx="' + i + '" data-field="wickets"' + (isYou ? '' : ' disabled') + ' /></label>' +
          '</div>' +
        '</div>').join('') + '</div>';
    body =
      '<div class="scoreline mt"><span class="score-big" id="totals-' + tid + '">' + (t.runs || 0) + '</span>' +
      '<span class="score-meta">/ <span id="wkts-' + tid + '">' + (t.wickets || 0) + '</span> · <span id="overs-' + tid + '">' + fmtOvers(totalBalls(t)) + '</span> ov</span></div>' +
      '<div class="batting-line" id="batting-' + tid + '">Batting: <strong>' + esc(strikerName) + '</strong></div>' +
      '<div class="over-dots" id="dots-' + tid + '">' + overDots(totalBalls(t)) + '</div>' +
      runpad +
      '<div class="batters" id="batters-' + tid + '">' + rows + '</div>' +
      bowling +
      (isYou ? '<button type="button" class="btn btn-sm btn-ghost mt" data-action="add-player" data-team="' + tid + '">＋ Add Batter</button>' : '');
  }
  return '' +
    '<div class="glass card team-card" style="border-top-color:' + color + '">' +
      '<div class="t-head"><span class="t-name">' + esc(meta.name) + '</span>' + (isYou ? '<span class="badge badge-you">Your team</span>' : '') + '</div>' +
      body +
    '</div>';
}

function getActiveMatch() { return state.matches.find(m => m.id === state.activeMatchId); }
function recomputeTeam(t) {
  if (t.players && t.players.length) {
    t.runs = t.players.reduce((s, p) => s + (+p.runs || 0), 0);
    t.wickets = t.players.filter(p => p.out).length;
  }
}
function updateTotalsEl(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t) return;
  const totals = document.getElementById('totals-' + teamId);
  if (totals) totals.textContent = t.runs || 0;
  const wkts = document.getElementById('wkts-' + teamId);
  if (wkts) wkts.textContent = t.wickets || 0;
}

function startMatch() {
  const nameEl = document.getElementById('match-name');
  const name = (nameEl.value || '').trim();
  if (!name) return toast('Please enter a match name.', 'error');
  const id = 'm_' + uid();
  const teams = {};
  const hasRoster = (uiMode === 'detailed' || uiMode === 'post-detailed');

  Object.values(state.teams).forEach(t => {
    teams[t.id] = {
      runs: 0,
      wickets: 0,
      overs: 0,
      striker: 0,
      bowler: 0,
      players: hasRoster
        ? t.members.map(m => ({ key: m, name: displayNameOf(t.id, m), member: m, runs: 0, balls: 0, fours: 0, sixes: 0, out: false }))
        : [],
      bowlers: hasRoster
        ? t.members.map(m => ({ key: m, name: displayNameOf(t.id, m), member: m, balls: 0, overs: 0, runs: 0, wickets: 0 }))
        : []
    };
  });
  const match = { id, name, mode: uiMode, status: 'live', createdAt: Date.now(), updatedAt: Date.now(), teams };
  db.saveMatch(match).then(() => {
    if (!state.matches.some(x => x.id === id)) state.matches.push(match);
    state.activeMatchId = id;
    nameEl.value = '';
    showSection('scoreboard-section');
    renderMatchPanel();
    toast('Match "' + name + '" started — ' + modeLabel(uiMode) + '! 🏏', 'success');
  });
}

async function endMatch(id) {
  const m = state.matches.find(x => x.id === id); if (!m) return;
  if (!confirm('Finalize and save match "' + m.name + '"?')) return;
  m.status = 'completed';
  m.updatedAt = Date.now();
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
async function addPlayer(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t) return;
  if (!t.players) t.players = [];
  t.players.push({ key: 'guest-' + uid(), name: 'Player ' + (t.players.length + 1), member: null, runs: 0, balls: 0, fours: 0, sixes: 0, out: false });
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}
async function addBowler(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t) return;
  if (!t.bowlers) t.bowlers = [];
  t.bowlers.push({ key: 'guest-bowl-' + uid(), name: 'Bowler ' + (t.bowlers.length + 1), member: null, balls: 0, overs: 0, runs: 0, wickets: 0 });
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}
async function removePlayer(teamId, idx) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t || !t.players) return;
  t.players.splice(idx, 1);
  recomputeTeam(t);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}
async function removeBowler(teamId, idx) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t || !t.bowlers) return;
  t.bowlers.splice(idx, 1);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  renderLiveArea();
}
async function renameBowler(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const b = t.bowlers && t.bowlers[+el.dataset.idx]; if (!b) return;
  const name = (el.value || '').trim();
  if (name) { b.name = name; if (!b.member) b.key = name; }
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}

/* ---------- 11. Ball-by-ball scoring (Detailed Mode) ---------- */
function totalBalls(t) { return (t.players || []).reduce((s, p) => s + (+p.balls || 0), 0); }
function nextAvailable(t, from) {
  const n = (t.players || []).length;
  if (!n) return 0;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (!t.players[i].out) return i;
  }
  return from % n;
}
function normalizeStriker(t) {
  const n = (t.players || []).length;
  if (!n) return 0;
  let s = (t.striker || 0) % n;
  if (t.players[s].out) s = nextAvailable(t, s);
  t.striker = s;
  return s;
}
function snapshotTeam(t) {
  return {
    runs: t.runs, wickets: t.wickets, striker: t.striker || 0,
    players: (t.players || []).map(p => ({ runs: p.runs || 0, balls: p.balls || 0, fours: p.fours || 0, sixes: p.sixes || 0, out: !!p.out }))
  };
}
function pushUndo(matchId, teamId, t) {
  const m = undoStack[matchId] || (undoStack[matchId] = {});
  const stack = m[teamId] || (m[teamId] = []);
  stack.push(snapshotTeam(t));
  if (stack.length > 20) stack.shift();
}
function applyBall(teamId, runs) {
  const m = getActiveMatch(); if (!m) return;
  if (m.mode !== 'detailed') return;
  const t = m.teams[teamId]; if (!t) return;
  const idx = normalizeStriker(t);
  const p = t.players[idx];
  if (!p) return toast('Add a batter first.', 'error');
  if (p.out) return toast(esc(p.name) + ' is out — tap another batter.', 'error');
  pushUndo(m.id, teamId, t);
  p.runs = (p.runs || 0) + runs;
  p.balls = (p.balls || 0) + 1;
  if (runs === 4) p.fours = (p.fours || 0) + 1;
  if (runs === 6) p.sixes = (p.sixes || 0) + 1;
  recomputeTeam(t);
  m.updatedAt = Date.now();
  markLocalEdit();
  db.saveMatch(m);
  refreshTeamCard(teamId);
}
function applyWicket(teamId) {
  const m = getActiveMatch(); if (!m) return;
  if (m.mode !== 'detailed') return;
  const t = m.teams[teamId]; if (!t) return;
  const idx = normalizeStriker(t);
  const p = t.players[idx];
  if (!p) return;
  if (p.out) return toast(esc(p.name) + ' is already out.', 'error');
  pushUndo(m.id, teamId, t);
  p.out = true;
  p.balls = (p.balls || 0) + 1;
  t.striker = nextAvailable(t, (idx + 1) % (t.players.length || 1));
  recomputeTeam(t);
  m.updatedAt = Date.now();
  markLocalEdit();
  db.saveMatch(m);
  refreshTeamCard(teamId);
}
function setStriker(teamId, idx) {
  const m = getActiveMatch(); if (!m) return;
  if (!state.user || state.user.teamId !== teamId) return;
  const t = m.teams[teamId]; if (!t) return;
  if (!t.players[idx]) return;
  if (t.players[idx].out) return toast('That batter is out.', 'error');
  t.striker = idx;
  m.updatedAt = Date.now();
  markLocalEdit();
  db.saveMatch(m);
  refreshTeamCard(teamId);
}
function undoBall(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const stack = undoStack[m.id] && undoStack[m.id][teamId];
  if (!stack || !stack.length) return toast('Nothing to undo.', 'error');
  const snap = stack.pop();
  const t = m.teams[teamId];
  t.runs = snap.runs; t.wickets = snap.wickets; t.striker = snap.striker;
  (t.players || []).forEach((p, i) => {
    const s = snap.players[i];
    if (s) { p.runs = s.runs; p.balls = s.balls; p.fours = s.fours; p.sixes = s.sixes; p.out = s.out; }
  });
  m.updatedAt = Date.now();
  markLocalEdit();
  db.saveMatch(m);
  refreshTeamCard(teamId);
}
function refreshTeamCard(teamId) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[teamId]; if (!t) return;
  const striker = t.striker || 0;
  const totals = document.getElementById('totals-' + teamId);
  if (totals) totals.textContent = t.runs || 0;
  const wkts = document.getElementById('wkts-' + teamId);
  if (wkts) wkts.textContent = t.wickets || 0;
  const balls = document.getElementById('overs-' + teamId);
  if (balls) balls.textContent = fmtOvers(totalBalls(t));
  const dots = document.getElementById('dots-' + teamId);
  if (dots) dots.innerHTML = overDots(totalBalls(t));
  const batting = document.getElementById('batting-' + teamId);
  if (batting) {
    const p = t.players[striker];
    batting.innerHTML = 'Batting: <strong>' + esc(p ? playerLabel(p, teamId) : '—') + '</strong>';
  }
  const batters = document.getElementById('batters-' + teamId);
  if (batters) {
    Array.prototype.forEach.call(batters.querySelectorAll('.prow'), (row, i) => {
      const p = t.players[i];
      if (!p) return;
      row.classList.toggle('is-striker', i === striker);
      row.classList.toggle('is-out', !!p.out);
      const stat = row.querySelector('.p-stat');
      if (stat) stat.textContent = (p.runs || 0) + ' runs · ' + (p.balls || 0) + ' balls' + (p.fours ? ' · ' + p.fours + '×4' : '') + (p.sixes ? ' · ' + p.sixes + '×6' : '');
      const name = row.querySelector('.p-name');
      if (name) name.innerHTML = esc(playerLabel(p, teamId)) +
        (i === striker ? ' <span class="badge badge-live">batting</span>' : '') +
        (p.out ? ' <span class="badge badge-lost">out</span>' : '');
    });
  }
}

function updateBowlerLocal(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const b = (t.bowlers || [])[+el.dataset.idx]; if (!b) return;
  if (el.dataset.field === 'overs') {
    b.balls = parseOversToBalls(el.value);
    b.overs = parseFloat(el.value) || 0;
  } else {
    b[el.dataset.field] = Math.max(0, parseInt(el.value, 10) || 0);
  }
  const card = el.closest('.bowl-detailed-card') || el.closest('.bowl-row');
  if (card) {
    const ov = card.querySelector('.b-overs');
    if (ov) ov.textContent = fmtOvers(b.balls || 0) + ' ov';
    const econ = card.querySelector('.bd-econ');
    if (econ) econ.textContent = 'Econ: ' + (b.balls > 0 ? (b.runs / (b.balls / 6)).toFixed(1) : '0.0');
  }
}
async function saveBowlerField(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const b = (t.bowlers || [])[+el.dataset.idx]; if (!b) return;
  if (el.dataset.field === 'overs') {
    b.balls = parseOversToBalls(el.value);
    b.overs = parseFloat(el.value) || 0;
  } else {
    b[el.dataset.field] = Math.max(0, parseInt(el.value, 10) || 0);
  }
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}

/* ---------- 12. Scoring input handlers ---------- */
function updateScoreLocal(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const val = Math.max(0, parseInt(el.value, 10) || 0);
  if (m.mode === 'quick' || m.mode === 'retro') {
    t[el.dataset.field] = val;
  } else {
    const p = t.players && t.players[+el.dataset.idx]; if (!p) return;
    p[el.dataset.field] = val;
    recomputeTeam(t);
    const card = el.closest('.player-detailed-card');
    if (card) {
      const sr = card.querySelector('.pd-sr');
      if (sr) sr.textContent = 'SR: ' + (p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0');
    }
  }
  m.updatedAt = Date.now();
  updateTotalsEl(el.dataset.team);
}
async function saveScoreField(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const val = Math.max(0, parseInt(el.value, 10) || 0);
  if (m.mode === 'quick' || m.mode === 'retro') {
    t[el.dataset.field] = val;
  } else {
    const p = t.players && t.players[+el.dataset.idx];
    if (p) {
      p[el.dataset.field] = val;
      recomputeTeam(t);
    }
  }
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}
async function toggleOut(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const p = t.players && t.players[+el.dataset.idx]; if (!p) return;
  p.out = el.checked;
  recomputeTeam(t);
  m.updatedAt = Date.now();
  await db.saveMatch(m);
  updateTotalsEl(el.dataset.team);

  const card = el.closest('.player-detailed-card');
  if (card) {
    card.classList.toggle('is-dismissed', p.out);
    const toggle = card.querySelector('.pd-status-toggle');
    if (toggle) {
      toggle.className = 'pd-status-toggle ' + (p.out ? 'is-out' : 'not-out');
      const span = toggle.querySelector('span');
      if (span) span.textContent = p.out ? '❌ Out (Dismissed)' : '🏏 Not Out';
    }
  }
}
async function renamePlayer(el) {
  const m = getActiveMatch(); if (!m) return;
  const t = m.teams[el.dataset.team]; if (!t) return;
  const p = t.players && t.players[+el.dataset.idx]; if (!p) return;
  const name = (el.value || '').trim();
  if (name) { p.name = name; if (!p.member) p.key = name; }
  m.updatedAt = Date.now();
  await db.saveMatch(m);
}

/* ---------- 12b. History ---------- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!state.matches.length) {
    el.innerHTML = '<div class="empty"><span class="e-emoji">📭</span>No matches yet. Start one from the Match tab.</div>';
    return;
  }
  el.innerHTML = state.matches.map(matchSummaryHTML).join('');
}

/* ---------- 13. Analysis (charts + awards) ---------- */
function getMatchesForFilter(filter) {
  if (filter === '__series__') {
    return state.matches;
  }
  if (filter === '__this_week__') {
    const now = new Date();
    // Monday of the current calendar week
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const mondayTs = monday.getTime();
    // Also include matches within last 7 days for weekend safety
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const threshold = Math.min(mondayTs, sevenDaysAgo);
    return state.matches.filter(m => (m.createdAt || 0) >= threshold);
  }
  if (filter === '__last_match__') {
    const completed = state.matches.filter(m => m.status === 'completed').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const last = completed[0] || state.matches[0];
    return last ? [last] : [];
  }
  // Specific match ID
  const single = state.matches.find(m => m.id === filter);
  return single ? [single] : [];
}

function renderAnalysis() {
  const sel = document.getElementById('chart-select');
  if (!sel) return;
  const prev = sel.value;

  // Chronologically sorted matches (oldest to newest)
  const chronoMatches = state.matches.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  let html = '';
  html += '<optgroup label="Summary Totals">';
  html += '<option value="__series__">🏆 Series Total (all matches combined)</option>';
  html += '<option value="__this_week__">📅 This Week Match (current week)</option>';
  html += '<option value="__last_match__">⚡ Last Match Total (most recently completed)</option>';
  html += '</optgroup>';

  if (chronoMatches.length > 0) {
    html += '<optgroup label="Individual Matches (Chronological)">';
    chronoMatches.forEach((m, idx) => {
      const statusIcon = m.status === 'live' ? '🔴 LIVE: ' : '🏏 ';
      const dateStr = fmtDate(m.createdAt);
      html += '<option value="' + esc(m.id) + '">' + statusIcon + 'Match #' + (idx + 1) + ': ' + esc(m.name) + ' (' + dateStr + ')</option>';
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
    ctx.parentElement.innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">Chart library unavailable (check connection).</div>';
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
      const matchTeam = m.teams && m.teams[t.id];
      return sum + (+(matchTeam && matchTeam.runs) || 0);
    }, 0);
    teamData.push(teamRuns);
    teamColors.push(t.color || '#3b82f6');
  });

  chartTeam = drawPie('pie-team', chartTeam, teamLabels, teamData, teamColors);

  // 2. Player Run Distribution Pie Chart
  const note = document.getElementById('player-chart-note');
  const playerMap = {};

  filteredMatches.forEach(m => {
    if (!isDetailedMatch(m)) return;
    Object.entries(m.teams || {}).forEach(([tid, t]) => {
      const meta = getTeam(tid);
      (t.players || []).forEach(p => {
        const runs = +p.runs || 0;
        if (runs > 0) {
          const key = p.member || p.name;
          const label = playerLabel(p, tid);
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
      if (filteredMatches.length === 0) {
        note.textContent = 'No matches found for this filter.';
      } else {
        note.textContent = 'No individual player runs recorded for this view (play or log a Detailed match).';
      }
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
  if (!evalMatches.length) evalMatches = targetMatches; // fallback so live or in-progress matches also compute

  const series = {};
  const bowlerStats = {};
  let bestPlayer = null; // most runs
  let bestBowler = null; // most wickets (tie breaker: lowest runs, lowest economy)
  let mom = null;        // highest total match impact in a single match

  evalMatches.forEach(m => {
    if (!isDetailedMatch(m)) return;
    let matchTop = null;

    Object.entries(m.teams || {}).forEach(([tid, t]) => {
      // Batter impact
      (t.players || []).forEach(p => {
        const runs = +p.runs || 0;
        const balls = +p.balls || 0;
        const fours = +p.fours || 0;
        const sixes = +p.sixes || 0;
        const impact = runs + fours + (sixes * 2);
        const key = p.member || p.name;
        const label = playerLabel(p, tid);

        if (!series[key]) {
          series[key] = { key, label, teamId: tid, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, bowlRuns: 0, bowlBalls: 0, impact: 0, matches: 0 };
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
            key,
            label,
            runs,
            balls,
            fours,
            sixes,
            matchName: m.name,
            sr: balls ? ((runs / balls) * 100).toFixed(1) : '0.0'
          };
        }

        if (!matchTop || impact > matchTop.impact) {
          matchTop = { label, impact, matchName: m.name, detail: runs + ' runs (' + balls + 'b)' };
        }
      });

      // Bowler impact
      (t.bowlers || []).forEach(b => {
        const wkts = +b.wickets || 0;
        const runs = +b.runs || 0;
        const balls = +b.balls || 0;
        const bowlImpact = (wkts * 20) + Math.max(0, balls - runs);
        const key = b.member || b.name;
        const label = b.member ? displayNameOf(tid, b.member) : b.name;

        if (series[key]) {
          series[key].impact += bowlImpact;
          series[key].wickets += wkts;
          series[key].bowlRuns += runs;
          series[key].bowlBalls += balls;
        }

        if (!bowlerStats[key]) {
          bowlerStats[key] = { key, label, teamId: tid, wickets: 0, runs: 0, balls: 0, matches: 0, matchName: m.name };
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

  // Calculate Best Wicket-Taker
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

  document.getElementById('awards').innerHTML =
    '<h3 class="card-title">🏆 Automatic Awards' + esc(titleSuffix) + '</h3>' +
    '<div class="award-grid">' +
      card('🥇', 'Best Batter', a.bestPlayer && a.bestPlayer.label, batterSub, !!a.bestPlayer) +
      card('🎯', 'Best Wicket-Taker', a.bestBowler && a.bestBowler.label, bowlerSub, !!a.bestBowler) +
      card('🏅', 'Man of the Match', a.mom && a.mom.label, momSub, !!a.mom) +
      card('👑', posTitle, a.pos && a.pos.label, posSub, !!a.pos) +
    '</div>';
}

/* ---------- 13b. Printable summary ---------- */
function printMatchHTML(m, matchNum) {
  const res = resultOf(m);
  const ids = Object.keys(m.teams || {});
  const hasDetailed = isDetailedMatch(m);

  let resultClass = 'print-result-win';
  let resultText = res && res.draw ? 'Draw' : (res ? 'Winner: ' + res.winnerName : 'In Progress');
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
  h += '      <div style="font-size:10.5px;color:#64748b">' + fmtDate(m.createdAt) + ' · ' + modeLabel(m.mode) + '</div>';
  h += '    </div>';
  h += '    <div class="print-match-result ' + resultClass + '">' + esc(resultText) + '</div>';
  h += '  </div>';

  h += '  <div class="print-teams-row">';
  ids.forEach(id => {
    const t = m.teams[id] || {}, meta = getTeam(id);
    const balls = totalBalls(t);
    const oversText = hasDetailed && balls > 0 ? ' (' + fmtOvers(balls) + ' ov)' : '';
    h += '<div class="print-team-box" style="border-left-color:' + (meta.color || '#0284c7') + '">';
    h += '  <div class="print-tb-title">' + esc(meta.name) + '</div>';
    h += '  <div class="print-tb-score">' + (t.runs || 0) + '/' + (t.wickets || 0) + oversText + '</div>';
    h += '</div>';
  });
  h += '  </div>';

  if (hasDetailed) {
    ids.forEach(id => {
      const t = m.teams[id] || {}, meta = getTeam(id);
      if (t.players && t.players.length) {
        h += '<div style="font-weight:700;font-size:11.5px;color:#1e3a8a;margin-top:8px">🏏 ' + esc(meta.name) + ' — Batting Scorecard</div>';
        h += '<table class="print-table"><thead><tr><th>Batter</th><th>Runs</th><th>Balls</th><th>4s</th><th>6s</th><th>SR</th><th>Dismissal</th></tr></thead><tbody>';
        t.players.forEach(p => {
          const sr = p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : '0.0';
          const statusSpan = p.out ? '<span class="print-badge-out">Out</span>' : '<span class="print-badge-notout">Not Out</span>';
          h += '<tr>';
          h += '  <td><strong>' + esc(playerLabel(p, id)) + '</strong></td>';
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

      if (t.bowlers && t.bowlers.length) {
        h += '<div style="font-weight:700;font-size:11.5px;color:#1e3a8a;margin-top:6px">🎯 ' + esc(meta.name) + ' — Bowling Figures</div>';
        h += '<table class="print-table"><thead><tr><th>Bowler</th><th>Overs</th><th>Runs Conceded</th><th>Wickets</th><th>Economy</th></tr></thead><tbody>';
        t.bowlers.forEach(b => {
          const bBalls = b.balls || 0;
          const econ = bBalls > 0 ? (b.runs / (bBalls / 6)).toFixed(1) : '0.0';
          const bName = b.member ? displayNameOf(id, b.member) : b.name;
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
  h += '  <div class="print-sub">Official Squad Scorecard, Ball-by-Ball Analysis &amp; Series Leaderboard</div>';
  h += '  <div class="print-meta-chips">';
  h += '    <span class="print-chip">📅 ' + esc(new Date().toLocaleDateString([], { dateStyle: 'full' })) + '</span>';
  h += '    <span class="print-chip">📍 Scope: ' + esc(reportScope) + '</span>';
  if (u) h += '    <span class="print-chip">👤 Generated by ' + esc(u.displayName) + ' (' + esc(getTeam(u.teamId).name) + ')</span>';
  h += '    <span class="print-chip">👥 Squad: 6 Players</span>';
  h += '  </div>';
  h += '</div>';

  // 1. Automatic Awards Section (4 cards)
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
    const ms = targetMatches.filter(m => m.teams && m.teams[t.id]);
    const runs = ms.reduce((s, m) => s + ((m.teams[t.id] && m.teams[t.id].runs) || 0), 0);
    const wkts = ms.reduce((s, m) => s + ((m.teams[t.id] && m.teams[t.id].wickets) || 0), 0);
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

  // 3. Match Scorecards
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

  document.getElementById('print-area').innerHTML = h;
  window.print();
}

/* ---------- 14. Team profile, Captain Election & Secret-code vote ---------- */
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

/* ---------- 14b. Team Captain Selection with Majority Voting ---------- */
function proposeCaptain(candidate) {
  const u = state.user; if (!u) return;
  const teamId = u.teamId;
  const team = getTeam(teamId);
  const clean = (candidate || '').trim();
  if (!team.members.includes(clean)) return toast('Please select a member of your squad.', 'error');
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
  if (a && (a.closest('#team-profile') || a.closest('#team-captain') || a.closest('#team-vote') || a.closest('#theme-customizer'))) return; // don't clobber active typing
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
      team.members.map(m =>
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
            team.members.map(m => '<option value="' + esc(m) + '"' + (m === team.captain ? ' selected' : '') + '>' + esc(displayNameOf(team.id, m)) + (m === team.captain ? ' (Current Captain)' : '') + '</option>').join('') +
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

  // 4. Per-Player Theme Customizer
  const themeEl = document.getElementById('theme-customizer');
  if (themeEl) {
    const activeTheme = getSavedTheme();
    themeEl.innerHTML =
      '<h3 class="card-title">🎨 Per-Player Theme Switcher</h3>' +
      '<p class="muted" style="font-size:.85rem">Saved locally for this browser only. Customize your look without changing other players’ themes.</p>' +
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

/* ---------- 15. Event wiring ---------- */
function globalClick(e) {
  const modeOpt = e.target.closest('.mode-option');
  if (modeOpt) { uiMode = modeOpt.dataset.mode; renderSetupForm(); return; }
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
    case 'open-match': state.activeMatchId = el.dataset.id; renderLiveArea(); showSection('scoreboard-section'); break;
    case 'end-match': endMatch(el.dataset.id); break;
    case 'reopen-match': reopenMatch(el.dataset.id); break;
    case 'delete-match': deleteMatch(el.dataset.id); break;
    case 'add-player': addPlayer(el.dataset.team); break;
    case 'add-bowler': addBowler(el.dataset.team); break;
    case 'remove-player': removePlayer(el.dataset.team, +el.dataset.idx); break;
    case 'remove-bowler': removeBowler(el.dataset.team, +el.dataset.idx); break;
    case 'vote-yes': voteYes(); break;
    case 'vote-captain-yes': voteCaptainYes(); break;
    case 'set-theme':
      applyTheme(el.dataset.themeId);
      renderTeam();
      const tObj = THEMES.find(x => x.id === el.dataset.themeId);
      toast('Theme set to ' + (tObj ? tObj.name : el.dataset.themeId) + ' ✨', 'success');
      break;
    case 'go-match': showSection('match-setup-section'); break;
    case 'ball': applyBall(el.dataset.team, +el.dataset.runs); break;
    case 'wicket': applyWicket(el.dataset.team); break;
    case 'undo': undoBall(el.dataset.team); break;
    case 'set-striker': setStriker(el.dataset.team, +el.dataset.idx); break;
  }
}
function globalSubmit(e) {
  const kind = e.target && e.target.dataset ? e.target.dataset.form : null;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'start') startMatch();
  else if (kind === 'profile') saveDisplayName(document.getElementById('display-name-input').value);
  else if (kind === 'vote') voteForCode(document.getElementById('vote-code-input').value);
  else if (kind === 'captain') proposeCaptain(document.getElementById('captain-candidate-select').value);
}
function globalInput(e) {
  const el = e.target;
  if (!el || !el.dataset) return;
  if (el.dataset.score !== undefined) updateScoreLocal(el);
  else if (el.dataset.bowl !== undefined) updateBowlerLocal(el);
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

/* ---------- 16. Init ---------- */
async function init() {
  populateLoginSelect();
  renderSyncStatus();
  const mode = await db.init();
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
    if (b) showSection(b.dataset.section);
  });
  document.getElementById('chart-select').addEventListener('change', () => {
    renderCharts();
    renderAwards();
  });
  document.getElementById('print-btn').addEventListener('click', buildPrintSummary);

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

