// ⚠️ SECURITY: Do NOT commit your real Firebase apiKey / config to a public GitHub repo.
// Move these values into a private config.js excluded by .gitignore, or inject at deploy time.
// The placeholders below are safe to publish because Firestore rules enforce request.auth != null.

let services = { auth: null, db: null, online: false };

export function initFirebase() {
  let config = window.__TC_FIREBASE_CONFIG__;
  if (!config) {
    try {
      config = JSON.parse(localStorage.getItem("tc_firebase_config") ?? "null");
    } catch (error) {
      console.warn("The stored Firebase configuration is invalid; local mode is available.", error);
    }
  }
  const sdk = window.firebase;
  if (!config || !sdk?.initializeApp || !sdk?.auth || !sdk?.firestore) {
    services = { auth: null, db: null, online: false };
    return services;
  }
  try {
    const app = sdk.apps?.length ? sdk.app() : sdk.initializeApp(config);
    services = {
      auth: app.auth(),
      db: app.firestore(),
      online: navigator.onLine
    };
    window.addEventListener("online", () => { services.online = true; });
    window.addEventListener("offline", () => { services.online = false; });
  } catch (error) {
    console.error("Firebase could not be initialized; local mode is available.", error);
    services = { auth: null, db: null, online: false };
  }
  return services;
}

export function getFirebaseServices() {
  return services;
}

export async function writeFirestore(path, data) {
  const { db } = services;
  if (!db) throw new Error("Firebase Firestore is not configured.");
  const segments = String(path).split("/").filter(Boolean);
  if (segments.length < 2) throw new TypeError("Firestore path must identify a document.");
  const ref = segments.reduce((collection, segment, index) => {
    if (index % 2 === 0) return collection.collection(segment);
    return collection.doc(segment);
  }, db);
  await ref.set({ ...data }, { merge: true });
}

export async function readFirestoreCollection(name) {
  if (!services.db) throw new Error("Firebase Firestore is not configured.");
  const snapshot = await services.db.collection(String(name)).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
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
