// Firebase is loaded dynamically so the app can still start in local-only mode offline.
export const FIREBASE_PROJECT_ID = "thursday-cricket";

const services = {
  app: null,
  auth: null,
  db: null,
  modules: null,
  online: navigator.onLine,
  configured: false,
  configurationError: null,
  ready: Promise.resolve(false)
};

function readConfig(configOverride) {
  if (configOverride) return configOverride;
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

export function initFirebase(configOverride, loadModules) {
  const config = readConfig(configOverride);
  if (!config) {
    services.configured = false;
    services.configurationError = null;
    services.ready = Promise.resolve(false);
    return services;
  }
  if (config.projectId !== FIREBASE_PROJECT_ID) {
    const error = new Error(`Firebase must be configured for project "${FIREBASE_PROJECT_ID}".`);
    services.configured = false;
    services.configurationError = error;
    services.ready = Promise.resolve(false);
    return services;
  }
  if (typeof config.apiKey !== "string" || !config.apiKey.trim() || typeof config.appId !== "string" || !config.appId.trim()) {
    const error = new Error("Provide the Firebase web app apiKey and appId for project thursday-cricket.");
    services.configured = false;
    services.configurationError = error;
    services.ready = Promise.resolve(false);
    return services;
  }
  if (typeof loadModules !== "function") {
    const error = new TypeError("A Firebase modular SDK loader is required.");
    services.configured = false;
    services.configurationError = error;
    services.ready = Promise.resolve(false);
    return services;
  }

  services.configured = true;
  services.configurationError = null;
  services.ready = (async () => {
    const modules = await loadModules();
    const existingApp = modules.getApps().find((item) => item.name === "[DEFAULT]");
    services.app = existingApp ?? modules.initializeApp(config);
    services.auth = modules.getAuth(services.app);
    services.db = modules.getFirestore(services.app);
    services.modules = modules;
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    try {
      await modules.enableMultiTabIndexedDbPersistence(services.db);
    } catch (error) {
      if (!["failed-precondition", "unimplemented"].includes(error?.code)) {
        console.warn("Firestore persistence is unavailable; live cloud sync remains enabled.", error);
      }
    }
    return true;
  })().catch((error) => {
    services.configured = false;
    services.configurationError = error;
    throw error;
  });
  return services;
}

export function observeFirebaseAuth(onChange, onError) {
  if (!services.auth || typeof onChange !== "function") {
    throw new TypeError("Firebase Authentication and an auth-state callback are required.");
  }
  return services.modules.onAuthStateChanged(services.auth, onChange, onError);
}

export async function writeFirestore(path, data) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  const segments = String(path).split("/").filter(Boolean);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new TypeError("Firestore path must identify a document.");
  }
  const reference = services.modules.doc(services.db, ...segments);
  await services.modules.setDoc(reference, { ...data }, { merge: true });
}

export async function readFirestoreCollection(name) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  const snapshot = await services.modules.getDocs(services.modules.collection(services.db, String(name)));
  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
}

export function subscribeFirestoreCollection(name, onRecords, onError, options = {}) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  if (typeof onRecords !== "function" || typeof onError !== "function") {
    throw new TypeError("Firestore snapshot callbacks are required.");
  }
  const reference = services.modules.collection(services.db, String(name));
  const target = options.orderByCreatedAt
    ? services.modules.query(reference, services.modules.orderBy("createdAt", "desc"))
    : reference;
  return services.modules.onSnapshot(
    target,
    (snapshot) => onRecords(snapshot.docs.map((document) => ({ ...document.data(), id: document.id }))),
    onError
  );
}

export async function signInWithFirebase(email, password) {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  const credential = await services.modules.signInWithEmailAndPassword(services.auth, email, password);
  return credential.user;
}

export async function registerWithFirebase(email, password) {
  if (!services.auth) throw new Error("Firebase Authentication is not configured.");
  const credential = await services.modules.createUserWithEmailAndPassword(services.auth, email, password);
  return credential.user;
}

export async function updateFirebaseProfile(user, profile) {
  if (!services.auth || !user) throw new Error("A signed-in Firebase user is required.");
  await services.modules.updateProfile(user, profile);
}

export async function signOutFirebase() {
  if (services.auth?.currentUser) await services.modules.signOut(services.auth);
}
