import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk8q3K7lPL8HQv4eJane9kytumur4eo-Q",
  authDomain: "lkjlj-d4f05.firebaseapp.com",
  projectId: "lkjlj-d4f05",
  storageBucket: "lkjlj-d4f05.firebasestorage.app",
  messagingSenderId: "920703286928",
  appId: "1:920703286928:web:a1f74631120f085864e215"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const storeConfig = {
  name: "صالون 3D",
  logo: "https://bunny.net/logo.png",
  whatsapp: "9647762209987"
};
