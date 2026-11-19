// ⚠️ SECURITY: Do NOT commit your real Firebase apiKey / config to a public GitHub repo.
// Inject the complete web config at deploy time or store it in localStorage.tc_firebase_config.

export const FIREBASE_PROJECT_ID = "thursday-cricket";

let services = {
  auth: null,
  db: null,
  online: false,
  configured: false,
  configurationError: null,
  ready: Promise.resolve(false)
};

function readConfig() {
  if (window.__TC_FIREBASE_CONFIG__) return window.__TC_FIREBASE_CONFIG__;
  try {
    return JSON.parse(localStorage.getItem("tc_firebase_config") ?? "null");
  } catch (error) {
    console.warn("The stored Firebase configuration is invalid.", error);
    return null;
  }
}

function updateOnlineStatus() {
  services.online = navigator.onLine;
}

export function initFirebase() {
  const config = readConfig();
  const sdk = window.firebase;
  if (!config || !sdk?.initializeApp || !sdk?.auth || !sdk?.firestore) {
    services = {
      auth: null,
      db: null,
      online: navigator.onLine,
      configured: false,
      configurationError: null,
      ready: Promise.resolve(false)
    };
    return services;
  }
  if (config.projectId && config.projectId !== FIREBASE_PROJECT_ID) {
    const error = new Error(`Firebase must be configured for project "${FIREBASE_PROJECT_ID}".`);
    services = { auth: null, db: null, online: navigator.onLine, configured: false, configurationError: error, ready: Promise.resolve(false) };
    return services;
  }
  if (typeof config.apiKey !== "string" || !config.apiKey.trim() || typeof config.appId !== "string" || !config.appId.trim()) {
    const error = new Error("Provide the Firebase web app apiKey and appId for project thursday-cricket.");
    services = { auth: null, db: null, online: navigator.onLine, configured: false, configurationError: error, ready: Promise.resolve(false) };
    return services;
  }

  try {
    const fullConfig = { ...config, projectId: FIREBASE_PROJECT_ID };
    const app = sdk.apps?.length ? sdk.app() : sdk.initializeApp(fullConfig);
    const auth = app.auth();
    const db = app.firestore();
    services = {
      auth,
      db,
      online: navigator.onLine,
      configured: true,
      configurationError: null,
      ready: Promise.resolve(false)
    };
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    services.ready = (async () => {
      try {
        await db.enablePersistence({ synchronizeTabs: true });
      } catch (error) {
        if (!["failed-precondition", "unimplemented"].includes(error?.code)) {
          console.warn("Firestore persistence is unavailable; live cloud sync remains enabled.", error);
        }
      }
      await ensureAnonymousAuth();
      return true;
    })();
  } catch (error) {
    console.error("Firebase could not be initialized.", error);
    services = {
      auth: null,
      db: null,
      online: navigator.onLine,
      configured: false,
      configurationError: error,
      ready: Promise.resolve(false)
    };
  }
  return services;
}

export function getFirebaseServices() {
  return services;
}

export async function ensureAnonymousAuth() {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  if (services.auth.currentUser) return services.auth.currentUser;
  const credential = await services.auth.signInAnonymously();
  return credential.user;
}

export async function writeFirestore(path, data) {
  const { db } = services;
  if (!db) throw new Error("Firebase Firestore is not configured.");
  const segments = String(path).split("/").filter(Boolean);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new TypeError("Firestore path must identify a document.");
  }
  let reference = db;
  for (let index = 0; index < segments.length; index += 1) {
    reference = index % 2 === 0
      ? reference.collection(segments[index])
      : reference.doc(segments[index]);
  }
  await reference.set({ ...data }, { merge: true });
}

export async function readFirestoreCollection(name) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  const snapshot = await services.db.collection(String(name)).get();
  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
}

export function subscribeFirestoreCollection(name, onRecords, onError) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  if (typeof onRecords !== "function" || typeof onError !== "function") {
    throw new TypeError("Firestore snapshot callbacks are required.");
  }
  return services.db.collection(String(name)).onSnapshot(
    (snapshot) => onRecords(snapshot.docs.map((document) => ({ ...document.data(), id: document.id }))),
    onError
  );
}

export async function signInWithFirebase(email, password) {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  const result = await services.auth.signInWithEmailAndPassword(email, password);
  return { uid: result.user.uid, email: result.user.email };
}

export async function registerWithFirebase(email, password) {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  const result = await services.auth.createUserWithEmailAndPassword(email, password);
  return { uid: result.user.uid, email: result.user.email };
}

export async function signOutFirebase() {
  if (services.auth?.currentUser) await services.auth.signOut();
}
