import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, browserSessionPersistence,
  setPersistence, connectAuthEmulator, onIdTokenChanged, getMultiFactorResolver,
  multiFactor, TotpMultiFactorGenerator, reauthenticateWithPopup,
  type MultiFactorResolver, type MultiFactorError, type TotpSecret } from 'firebase/auth';
import config from './firebase-config.json';

export const firebaseApp = initializeApp(config);
export const firebaseAuth = getAuth(firebaseApp);
const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === 'true';
if (emulator && ['localhost','127.0.0.1'].includes(location.hostname)) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
const persistenceReady = setPersistence(firebaseAuth, browserSessionPersistence);
let pendingMfa: MultiFactorResolver | null = null;
export const MFA_EVENT = 'seo-local:mfa-required';
export function pendingTotpChallenge() { return pendingMfa !== null; }
function handleMfa(error: unknown) {
  if ((error as {code?:string})?.code !== 'auth/multi-factor-auth-required') throw error;
  pendingMfa = getMultiFactorResolver(firebaseAuth, error as MultiFactorError);
  window.dispatchEvent(new Event(MFA_EVENT));
}
export async function finishTotpChallenge(code: string) {
  if (!pendingMfa) throw new Error('Sua sessão de verificação expirou. Entre novamente.');
  const hint = pendingMfa.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error('A conta não possui um aplicativo autenticador compatível.');
  await pendingMfa.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
  pendingMfa = null;
  location.assign('/');
}
export function cancelTotpChallenge() { pendingMfa = null; window.dispatchEvent(new Event(MFA_EVENT)); }
export function enrolledTotp() {
  const user = firebaseAuth.currentUser;
  return !!user && multiFactor(user).enrolledFactors.some(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}
export async function startTotpEnrollment(): Promise<TotpSecret> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) throw new Error('Entre com seu Google verificado antes de configurar a segurança.');
  return TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession());
}
export async function finishTotpEnrollment(secret: TotpSecret, code: string) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Sua sessão expirou.');
  await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Aplicativo autenticador');
  await user.getIdToken(true);
}
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
    try {
      if ((_options as {max_age?:number})?.max_age === 0 && firebaseAuth.currentUser) {
        await reauthenticateWithPopup(firebaseAuth.currentUser, provider);
      } else {
        await signInWithPopup(firebaseAuth, provider);
      }
      location.assign('/');
    } catch (error) { handleMfa(error); }
  },
  async signinRedirectCallback() { return this.getUser(); },
  async removeUser() { await signOut(firebaseAuth); },
};
export async function currentFirebaseToken() {
  await firebaseAuth.authStateReady();
  return firebaseAuth.currentUser?.getIdToken() ?? null;
}
export { onIdTokenChanged };
