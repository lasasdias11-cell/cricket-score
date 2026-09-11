import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";


/* =========================================================
   FIREBASE CONFIG
   =========================================================

   Replace these values with your Firebase project values.
*/

const firebaseConfig = {
  apiKey: "AIzaSyCaA5DXo3JkWGqGdjFBMPnKj5PlwAbCT-Y",
  authDomain: "thursday-cricket.firebaseapp.com",
  projectId: "thursday-cricket",
  storageBucket: "thursday-cricket.firebasestorage.app",
  messagingSenderId: "752945537542",
  appId: "1:752945537542:web:84be60617247fc045fd987",
  measurementId: "G-SBLP9HHY5C"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


/* =========================================================
   TEAM DATA
   ========================================================= */

const TEAMS = {

  white: {
    id: "white",
    name: "White Tigers",

    players: [
      "Dilusha",
      "Isala",
      "Anuk"
    ]
  },

  black: {
    id: "black",
    name: "Black Panthers",

    players: [
      "Jevon",
      "Lasas",
      "Shenal"
    ]
  }

};


/*
   Internal emails.

   Firebase Authentication sees these as email addresses.
   Users only see Player ID + Team Code.
*/

const PLAYER_EMAILS = {

  Dilusha: "dilusha@whitetigers.cricket",
  Isala: "isala@whitetigers.cricket",
  Anuk: "anuk@whitetigers.cricket",

  Jevon: "jevon@blackpanthers.cricket",
  Lasas: "lasas@blackpanthers.cricket",
  Shenal: "shenal@blackpanthers.cricket"

};


const PLAYER_TEAM = {

  Dilusha: "white",
  Isala: "white",
  Anuk: "white",

  Jevon: "black",
  Lasas: "black",
  Shenal: "black"

};


/* =========================================================
   DEFAULT DATA
   ========================================================= */

const DEFAULT_CODES = {

  white: "White@tiger",

  black: "Black@panthers"

};


/* =========================================================
   APP STATE
   ========================================================= */

let currentUser = null;
let currentPlayer = null;
let currentTeam = null;

let activeMatch = null;

let unsubscribeMatch = null;
let unsubscribeVote = null;

let chartInstance = null;


/* =========================================================
   DOM
   ========================================================= */

const $ = (id) => document.getElementById(id);


/* =========================================================
   UTILITIES
   ========================================================= */

function showToast(message) {

  const toast = $("toast");

  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


function showMessage(element, message, error = false) {

  element.textContent = message;

  element.style.color = error
    ? "#ff8294"
    : "#7fbaff";
}


function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function slugify(value) {

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}


function playersForTeam(team) {

  return TEAMS[team].players;
}


/* =========================================================
   LOGIN
   ========================================================= */

$("togglePassword").addEventListener("click", () => {

  const input = $("teamCode");

  if (input.type === "password") {

    input.type = "text";

    $("togglePassword").textContent = "🙈";

  } else {

    input.type = "password";

    $("togglePassword").textContent = "👁";

  }

});


$("playerId").addEventListener("change", () => {

  const player = $("playerId").value;

  if (!player) return;

  const team = PLAYER_TEAM[player];

  $("teamCode").placeholder =
    `${TEAMS[team].name} code`;

});


$("loginForm").addEventListener("submit", async (event) => {

  event.preventDefault();

  const player = $("playerId").value;
  const password = $("teamCode").value.trim();

  if (!player || !password) return;

  const email = PLAYER_EMAILS[player];

  const message = $("loginMessage");

  showMessage(
    message,
    "Signing in..."
  );

  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  } catch (error) {

    console.error(error);

    showMessage(
      message,
      "Invalid Player ID or Team Secret Code.",
      true
    );

  }

});


/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(auth, async (user) => {

  if (!user) {

    currentUser = null;

    currentPlayer = null;
    currentTeam = null;

    $("loginPage").classList.add("active");
    $("appPage").classList.remove("active");

    return;
  }

  currentUser = user;

  await loadUserProfile(user);

  $("loginPage").classList.remove("active");
  $("appPage").classList.add("active");

  await loadActiveMatch();

  await loadMatchHistory();

  updateProfileUI();

  startVoteListener();

});


/* =========================================================
   USER PROFILE
   ========================================================= */

async function loadUserProfile(user) {

  const usersRef = doc(
    db,
    "users",
    user.uid
  );

  const snapshot = await getDoc(usersRef);

  if (snapshot.exists()) {

    const data = snapshot.data();

    currentPlayer = data.playerId;
    currentTeam = data.team;

    return;
  }


  /*
     Existing Firebase account but no Firestore profile.

     We determine the player from the email.
  */

  const email = user.email || "";

  currentPlayer = Object.keys(PLAYER_EMAILS)
    .find(
      player => PLAYER_EMAILS[player] === email
    );

  if (!currentPlayer) {

    await signOut(auth);

    throw new Error("Unknown player account.");

  }

  currentTeam = PLAYER_TEAM[currentPlayer];


  await setDoc(
    usersRef,
    {
      playerId: currentPlayer,
      displayName: currentPlayer,
      team: currentTeam,
      createdAt: serverTimestamp()
    },
    {
      merge: true
    }
  );

}


function updateProfileUI() {

  if (!currentPlayer) return;

  const team = TEAMS[currentTeam];

  $("currentUser").textContent =
    `${currentPlayer} · ${team.name}`;

  $("profileName").textContent =
    currentPlayer;

  $("profileTeam").textContent =
    team.name;

  $("profileAvatar").textContent =
    currentPlayer.charAt(0).toUpperCase();

  $("displayName").value =
    currentPlayer;

}


/* =========================================================
   NAVIGATION
   ========================================================= */

document.querySelectorAll(".nav-button")
  .forEach(button => {

    button.addEventListener("click", () => {

      const target = button.dataset.page;

      openSection(target);

    });

  });


document.querySelectorAll("[data-goto]")
  .forEach(button => {

    button.addEventListener("click", () => {

      openSection(
        button.dataset.goto
      );

    });

  });


function openSection(section) {

  document.querySelectorAll(".content-section")
    .forEach(element => {

      element.classList.toggle(
        "active",
        element.id === section
      );

    });


  document.querySelectorAll(".nav-button")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === section
      );

    });


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   LOGOUT
   ========================================================= */

$("logoutBtn").addEventListener(
  "click",
  async () => {

    if (unsubscribeMatch) {
      unsubscribeMatch();
      unsubscribeMatch = null;
    }

    if (unsubscribeVote) {
      unsubscribeVote();
      unsubscribeVote = null;
    }

    await signOut(auth);

  }
);


/* =========================================================
   CREATE MATCH
   ========================================================= */

$("matchForm").addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const name =
      $("matchName").value.trim();

    const scoringType =
      document.querySelector(
        "input[name='scoringType']:checked"
      ).value;


    if (!name) return;


    const newMatch = {

      name,

      scoringType,

      status: "live",

      createdBy: currentUser.uid,

      createdByName: currentPlayer,

      createdAt: serverTimestamp(),

      white: {
        runs: 0,
        wickets: 0,
        overs: 0,
        players: {}
      },

      black: {
        runs: 0,
        wickets: 0,
        overs: 0,
        players: {}
      }

    };


    try {

      const matchRef =
        await addDoc(
          collection(db, "matches"),
          newMatch
        );


      await setDoc(
        doc(db, "app", "activeMatch"),
        {
          matchId: matchRef.id,
          updatedAt: serverTimestamp()
        }
      );


      showMessage(
        $("setupMessage"),
        "Match created successfully."
      );


      $("matchName").value = "";

      openSection("dashboard");

      await loadActiveMatch();

    } catch (error) {

      console.error(error);

      showMessage(
        $("setupMessage"),
        "Could not create match.",
        true
      );

    }

  }
);


/* =========================================================
   ACTIVE MATCH
   ========================================================= */

async function loadActiveMatch() {

  const activeRef =
    doc(db, "app", "activeMatch");

  const activeSnapshot =
    await getDoc(activeRef);


  if (!activeSnapshot.exists()) {

    renderNoMatch();

    return;
  }


  const active =
    activeSnapshot.data();


  if (!active.matchId) {

    renderNoMatch();

    return;
  }


  const matchRef =
    doc(db, "matches", active.matchId);


  if (unsubscribeMatch) {
    unsubscribeMatch();
  }


  unsubscribeMatch =
    onSnapshot(
      matchRef,
      snapshot => {

        if (!snapshot.exists()) {

          renderNoMatch();

          return;
        }


        activeMatch = {

          id: snapshot.id,

          ...snapshot.data()

        };


        renderMatch();

      },

      error => {

        console.error(error);

        showToast(
          "Unable to sync live score."
        );

      }
    );

}


function renderNoMatch() {

  activeMatch = null;

  $("matchTitle").textContent =
    "No active match";

  $("matchStatus").textContent =
    "Waiting";

  $("emptyMatch").classList.remove("hidden");

  $("scoringPanel").classList.add("hidden");

  $("whiteScore").textContent = "0/0";
  $("blackScore").textContent = "0/0";

}


function renderMatch() {

  $("emptyMatch").classList.add("hidden");

  $("scoringPanel").classList.remove("hidden");

  $("matchTitle").textContent =
    activeMatch.name;

  $("matchStatus").textContent =
    activeMatch.status === "live"
      ? "LIVE"
      : "Finished";


  renderTeamScore(
    "white",
    activeMatch.white
  );

  renderTeamScore(
    "black",
    activeMatch.black
  );


  const detailed =
    activeMatch.scoringType === "detailed";

  $("quickScoring")
    .classList.toggle(
      "hidden",
      detailed
    );

  $("detailedScoring")
    .classList.toggle(
      "hidden",
      !detailed
    );


  if (detailed) {
    renderDetailedPlayers();
  }


  $("finishMatchBtn")
    .classList.toggle(
      "hidden",
      activeMatch.status !== "live"
    );

}


function renderTeamScore(
  team,
  data
) {

  const safeData = data || {};

  const runs =
    Number(safeData.runs || 0);

  const wickets =
    Number(safeData.wickets || 0);

  const overs =
    Number(safeData.overs || 0);


  $(`${team}Score`).textContent =
    `${runs}/${wickets}`;

  $(`${team}Overs`).textContent =
    `${overs.toFixed(1)} overs`;

  $(`${team}Runs`).textContent =
    `${runs} runs`;

}


/* =========================================================
   TEAM SELECTOR
   ========================================================= */

$("scoringTeam").addEventListener(
  "change",
  () => {

    const team =
      $("scoringTeam").value;

    $("scoringTeamTitle").textContent =
      TEAMS[team].name;

    if (activeMatch) {

      const data =
        activeMatch[team];

      $("quickRuns").value =
        data.runs || 0;

      $("quickWickets").value =
        data.wickets || 0;

      $("quickOvers").value =
        data.overs || 0;

    }

  }
);


/* =========================================================
   QUICK SCORE
   ========================================================= */

$("saveQuickScore").addEventListener(
  "click",
  async () => {

    if (!activeMatch) return;

    const team =
      $("scoringTeam").value;


    const runs =
      Math.max(
        0,
        Number($("quickRuns").value) || 0
      );

    const wickets =
      Math.max(
        0,
        Number($("quickWickets").value) || 0
      );

    const overs =
      Math.max(
        0,
        Number($("quickOvers").value) || 0
      );


    try {

      await updateDoc(
        doc(db, "matches", activeMatch.id),
        {
          [`${team}.runs`]: runs,
          [`${team}.wickets`]: wickets,
          [`${team}.overs`]: overs,
          updatedAt: serverTimestamp()
        }
      );


      showToast(
        `${TEAMS[team].name} updated.`
      );

    } catch (error) {

      console.error(error);

      showToast(
        "Could not save score."
      );

    }

  }
);


/* =========================================================
   DETAILED SCORING
   ========================================================= */

function renderDetailedPlayers() {

  const container =
    $("playerScoreList");

  container.innerHTML = "";


  const team =
    $("scoringTeam").value;

  const players =
    playersForTeam(team);

  const existing =
    activeMatch[team]?.players || {};


  players.forEach(player => {

    const stats =
      existing[player] || {
        runs: 0,
        wickets: 0
      };


    const row =
      document.createElement("div");

    row.className =
      "player-score-row";


    row.innerHTML = `

      <div>
        <strong>
          ${escapeHTML(player)}
        </strong>

        <small>
          Player score
        </small>
      </div>

      <input
        type="number"
        min="0"
        value="${Number(stats.runs || 0)}"
        data-player="${escapeHTML(player)}"
        data-stat="runs"
      >

      <input
        type="number"
        min="0"
        value="${Number(stats.wickets || 0)}"
        data-player="${escapeHTML(player)}"
        data-stat="wickets"
      >

    `;


    container.appendChild(row);

  });

}


$("saveDetailedScore").addEventListener(
  "click",
  async () => {

    if (!activeMatch) return;


    const team =
      $("scoringTeam").value;


    const inputs =
      $("playerScoreList")
        .querySelectorAll("input");


    const players = {};

    let totalRuns = 0;
    let totalWickets = 0;


    inputs.forEach(input => {

      const player =
        input.dataset.player;

      const stat =
        input.dataset.stat;

      const value =
        Math.max(
          0,
          Number(input.value) || 0
        );


      if (!players[player]) {

        players[player] = {
          runs: 0,
          wickets: 0
        };

      }


      players[player][stat] =
        value;


      if (stat === "runs") {
        totalRuns += value;
      }

      if (stat === "wickets") {
        totalWickets += value;
      }

    });


    try {

      await updateDoc(
        doc(db, "matches", activeMatch.id),
        {

          [`${team}.players`]:
            players,

          [`${team}.runs`]:
            totalRuns,

          [`${team}.wickets`]:
            totalWickets,

          updatedAt:
            serverTimestamp()

        }
      );


      showToast(
        "Player scores saved."
      );

    } catch (error) {

      console.error(error);

      showToast(
        "Could not save player scores."
      );

    }

  }
);


/* =========================================================
   FINISH MATCH
   ========================================================= */

$("finishMatchBtn").addEventListener(
  "click",
  async () => {

    if (!activeMatch) return;


    const confirmed =
      confirm(
        "Finish this match?"
      );


    if (!confirmed) return;


    try {

      await updateDoc(
        doc(db, "matches", activeMatch.id),
        {
          status: "finished",
          finishedAt: serverTimestamp()
        }
      );


      await setDoc(
        doc(db, "app", "activeMatch"),
        {
          matchId: null,
          updatedAt: serverTimestamp()
        }
      );


      showToast(
        "Match finished."
      );


      await loadMatchHistory();


    } catch (error) {

      console.error(error);

      showToast(
        "Could not finish match."
      );

    }

  }
);


/* =========================================================
   MATCH HISTORY
   ========================================================= */

async function loadMatchHistory() {

  const container =
    $("matchHistory");


  try {

    const matchesQuery =
      query(
        collection(db, "matches"),
        orderBy("createdAt", "desc"),
        limit(30)
      );


    const snapshot =
      await getDocs(matchesQuery);


    if (snapshot.empty) {

      container.innerHTML = `
        <div class="glass empty-state">

          <div class="empty-icon">
            📊
          </div>

          <h3>No matches yet</h3>

          <p>
            Your completed matches will appear here.
          </p>

        </div>
      `;

      return;
    }


    container.innerHTML = "";


    snapshot.forEach(matchDoc => {

      const match =
        matchDoc.data();


      const white =
        match.white || {};

      const black =
        match.black || {};


      const element =
        document.createElement("article");


      element.className =
        "glass match-item";


      element.innerHTML = `

        <div class="match-item-top">

          <div>

            <h3>
              ${escapeHTML(match.name)}
            </h3>

            <p>
              ${match.status === "finished"
                ? "Finished"
                : "Live"}
            </p>

          </div>

          <span class="status-pill">
            ${match.status}
          </span>

        </div>


        <div class="match-result">

          <div>

            <strong>
              ${Number(white.runs || 0)}/
              ${Number(white.wickets || 0)}
            </strong>

            <span>
              White Tigers
            </span>

          </div>


          <span>
            VS
          </span>


          <div>

            <strong>
              ${Number(black.runs || 0)}/
              ${Number(black.wickets || 0)}
            </strong>

            <span>
              Black Panthers
            </span>

          </div>

        </div>

      `;


      element.addEventListener(
        "click",
        () => {

          showMatchAnalysis(
            matchDoc.id,
            match
          );

        }
      );


      container.appendChild(element);

    });


  } catch (error) {

    console.error(error);

    container.innerHTML = `
      <div class="glass empty-state">
        Unable to load match history.
      </div>
    `;

  }

}


/* =============================================
