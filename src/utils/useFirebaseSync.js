import { useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export function useFirebaseSync(key, localValue, setLocalValue, transformToLocal = (v) => v, transformToRemote = (v) => v) {
  const { user } = useAuth();

  // Load from remote when user logs in
  useEffect(() => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data[key] !== undefined) {
          setLocalValue(transformToLocal(data[key]));
        }
      }
    });

    return () => unsubscribe();
  }, [user, key, setLocalValue, transformToLocal]);

  // Sync to remote when local value changes (debounced or directly)
  // Actually, we need a way to only save when local changes, but not when we receive a snapshot.
  // It's easier to just provide a save function that the component calls when it updates the state.
}
