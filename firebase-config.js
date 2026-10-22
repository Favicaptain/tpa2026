import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyACiIbclDif5HJ05vtRS9YQkiY_8hJmBbg",
    authDomain: "tpa2026.firebaseapp.com",
    projectId: "tpa2026",
    storageBucket: "tpa2026.firebasestorage.app",
    messagingSenderId: "733653848772",
    appId: "1:733653848772:web:210c223fa8c729c8d8ef91"
};

export const app     = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);

