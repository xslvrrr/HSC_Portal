import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked') {
      try {
        return await signInWithRedirect(auth, googleProvider);
      } catch (redirectError) {
        console.error("signInWithRedirect error:", redirectError);
        throw redirectError;
      }
    }
    console.error("signInWithGoogle error:", error);
    throw error;
  }
};

export const logOut = () => signOut(auth);
export { onAuthStateChanged, getRedirectResult };

