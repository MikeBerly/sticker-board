/*
 * firebase-config.js — turns on syncing.
 *
 * While firebaseConfig is null, the app saves on each device only (as before).
 * To sync, paste the config object from the Firebase console
 * (Project settings → Your apps → Web app → "SDK setup and configuration → Config").
 * These values are not secret: access is controlled by firestore.rules and by signing in.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyCJ57oUtRnPxACTxfEyIDxLLwyqKrRXABU',
  authDomain: 'sticker-board-b7047.firebaseapp.com',
  projectId: 'sticker-board-b7047',
  storageBucket: 'sticker-board-b7047.firebasestorage.app',
  messagingSenderId: '1054842777575',
  appId: '1:1054842777575:web:22cf6bcff04b364f6fd742',
};

// Every signed-in family member reads and writes this one shared board.
export const FAMILY_ID = 'family';
