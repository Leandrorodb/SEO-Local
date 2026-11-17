import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, browserSessionPersistence,
  setPersistence, connectAuthEmulator, onIdTokenChanged } from 'firebase/auth';
import config from './firebase-config.json';

export const firebaseApp = initializeApp(config);
export const firebaseAuth = getAuth(firebaseApp);
const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
if (emulator && ['localhost','127.0.0.1'].includes(location.hostname)) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
const persistenceReady = setPersistence(firebaseAuth, browserSessionPersistence);
export const firebaseIdentity = {
  async getUser() {
    await persistenceReady;
    await firebaseAuth.authStateReady();
    const user = firebaseAuth.currentUser;
    return user ? { expired: false, id_token: await user.getIdToken(), access_token: await user.getIdToken() } : null;
  },
  async signinRedirect(_options?: unknown) {
    await persistenceReady;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(firebaseAuth, provider);
    location.assign('/');
  },
  async signinRedirectCallback() { return this.getUser(); },
  async removeUser() { await signOut(firebaseAuth); },
};
export async function currentFirebaseToken() {
  await firebaseAuth.authStateReady();
  return firebaseAuth.currentUser?.getIdToken() ?? null;
}
export { onIdTokenChanged };
