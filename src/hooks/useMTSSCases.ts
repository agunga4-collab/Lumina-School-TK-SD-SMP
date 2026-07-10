import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ElementaryMTSSCase } from '../types/elementaryMTSS';

export function useMTSSCases() {
  const [cases, setCases] = useState<ElementaryMTSSCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const colRef = collection(db, 'elementary_mtss_cases');
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: ElementaryMTSSCase[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as ElementaryMTSSCase);
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
