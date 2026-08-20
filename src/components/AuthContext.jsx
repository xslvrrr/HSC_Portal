import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, signInWithGoogle, logOut, getRedirectResult } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
        }
      })
      .catch((err) => {
        console.error("Redirect auth error:", err);
        setAuthError(err.message || 'Authentication failed');
      });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Sign in failed:", err);
      let msg = err.message || 'Sign in failed';
      if (err.code === 'auth/unauthorized-domain') {
        msg = 'This domain is not authorized in Firebase Console. Please add your domain to Firebase Auth Authorized Domains.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign in popup was closed before completing.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = 'Google Sign-In is not enabled in Firebase Console.';
      }
      setAuthError(msg);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, setAuthError, signInWithGoogle: handleSignIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

