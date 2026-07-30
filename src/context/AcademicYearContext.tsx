import * as React from 'react';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

interface AcademicYearContextType {
  activeYear: string;
  activeSemester: number;
  isLoading: boolean;
  updateAcademicYear: (year: string, semester: number) => Promise<void>;
}

const AcademicYearContext = React.createContext<AcademicYearContextType | undefined>(undefined);

export function AcademicYearProvider({ children }: { children: React.ReactNode }) {
  const [activeYear, setActiveYear] = React.useState<string>('2026/2027');
  const [activeSemester, setActiveSemester] = React.useState<number>(1);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    const docRef = doc(db, 'systemConfig', 'academicYear');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.activeAcademicYear) {
          setActiveYear(data.activeAcademicYear);
        }
        if (data.activeSemester !== undefined) {
          setActiveSemester(Number(data.activeSemester));
        }
      } else {
        setActiveYear('2026/2027');
        setActiveSemester(1);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching academic year config:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateAcademicYear = async (year: string, semester: number) => {
    const docRef = doc(db, 'systemConfig', 'academicYear');
    await setDoc(docRef, {
      activeAcademicYear: year,
      activeSemester: semester,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.email || 'unknown_admin'
    });
  };

  return (
    <AcademicYearContext.Provider value={{ activeYear, activeSemester, isLoading, updateAcademicYear }}>
      {children}
    </AcademicYearContext.Provider>
  );
}

export function useAcademicYear() {
  const context = React.useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
}
