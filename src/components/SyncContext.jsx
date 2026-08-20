import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const SyncContext = createContext();

export function SyncProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user) {
      setData(null);
      return;
    }
    
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setData(docSnap.data());
      } else {
        // Initialize if no account document exists yet.
        setDoc(userRef, {
          bookmarks: [],
          assessments: [],
          appearance: {},
          selectedSubject: null,
          selectedLevel: 12,
          mySubjects: [],
          viewedPapers: [],
          completedPapers: [],
          practiceReviews: [],
          mistakeLog: [],
          updatedAt: new Date(),
        });

      }
    });

    return unsubscribe;
  }, [user]);

  const updateRemote = useCallback(async (key, value) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { [key]: value, updatedAt: new Date() }, { merge: true });
  }, [user]);

  const updateRemoteFields = useCallback(async (patch) => {
    if (!user || !patch || Object.keys(patch).length === 0) return;
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { ...patch, updatedAt: new Date() }, { merge: true });
  }, [user]);

  return (
    <SyncContext.Provider value={{ data, updateRemote, updateRemoteFields }}>
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => useContext(SyncContext);
