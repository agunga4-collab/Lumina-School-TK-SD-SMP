import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import { ElementaryMTSSCase } from '../types/elementaryMTSS';

export function useMTSSCases() {
  const [cases, setCases] = useState<ElementaryMTSSCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const colRef = collection(db, 'elementary_mtss_cases');
    const q = query(colRef);

    // Setup real-time listener conforming to firebase integration guidelines
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ElementaryMTSSCase[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ElementaryMTSSCase;
          // Filter tier 2 or tier 3 as specified by user instructions
          if (data.tier === 'Tier 2' || data.tier === 'Tier 3') {
            list.push(data);
          }
        });
        setCases(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching MTSS cases in hook:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { cases, loading, error };
}
