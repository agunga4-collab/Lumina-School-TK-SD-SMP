import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ElementaryMTSSCase } from '../types/elementaryMTSS';
import { ElementaryProgressRecord } from '../types/elementaryLiteracyNumeracy';

export function useMTSSCases() {
  const [cases, setCases] = useState<ElementaryMTSSCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const colRef = collection(db, 'elementary_mtss_cases');
    const recordsCol = collection(db, 'elementary_literacy_numeracy_records');

    let mtssCases: ElementaryMTSSCase[] = [];
    let progressRecords: ElementaryProgressRecord[] = [];

    const handleUpdate = (casesList: ElementaryMTSSCase[], recordsList: ElementaryProgressRecord[]) => {
      // Find all studentId_area keys that have at least one record with supportStatus MONITOR (Tier 2) or NEEDS_SUPPORT (Tier 3)
      const validKeys = new Set<string>();
      recordsList.forEach((rec) => {
        if (rec.studentId && rec.area) {
          if (rec.supportStatus === 'MONITOR' || rec.supportStatus === 'NEEDS_SUPPORT') {
            const key = `${rec.studentId}_${rec.area}`;
            validKeys.add(key);
          }
        }
      });

      // Filter cases: Only include cases where the student was actually recorded in Tier 2 or Tier 3 for that subject
      const filtered = casesList.filter((c) => {
        // Map subject to area
        let area = '';
        if (c.subject === 'Bahasa Indonesia') area = 'BAHASA_INDONESIA';
        else if (c.subject === 'English') area = 'ENGLISH_READING';
        else if (c.subject === 'Numeracy') area = 'NUMERACY';
        else if (c.subject === 'Mengaji') area = 'MENGAJI';

        const key = `${c.studentId}_${area}`;
        return validKeys.has(key);
      });

      setCases(filtered);
      setLoading(false);
    };

    const unsubCases = onSnapshot(
      query(colRef),
      (snapshot) => {
        const list: ElementaryMTSSCase[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as ElementaryMTSSCase);
        });
        mtssCases = list;
        handleUpdate(mtssCases, progressRecords);
      },
      (err) => {
        console.error('Error fetching MTSS cases in hook:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    const unsubRecords = onSnapshot(
      query(recordsCol),
      (snapshot) => {
        const list: ElementaryProgressRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as ElementaryProgressRecord);
        });
        progressRecords = list;
        handleUpdate(mtssCases, progressRecords);
      },
      (err) => {
        console.error('Error fetching literacy/numeracy records in hook:', err);
      }
    );

    return () => {
      unsubCases();
      unsubRecords();
    };
  }, []);

  return { cases, loading, error };
}
