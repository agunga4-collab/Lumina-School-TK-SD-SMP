import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getKindergartenClasses, getKindergartenStudents } from '../lib/kindergartenMetadataCache';

export interface KindergartenRosterStudent {
  id: string;
  name: string;
  nickName: string;
  email?: string;
  classId: string; // Normalized to the official targetClass.id
  className: string; // Literal class name
  unitId: string;
  ageGroup: 'PRA_TK' | 'TK_A' | 'TK_B';
}

interface GetKindergartenActiveRosterParams {
  classId: string;
  academicYearId: string;
  unit?: string; // defaults to "KINDERGARTEN"
}

export async function getKindergartenActiveRoster({
  classId,
  academicYearId,
  unit = "KINDERGARTEN"
}: GetKindergartenActiveRosterParams): Promise<KindergartenRosterStudent[]> {
  if (!classId || !academicYearId) return [];

  // 1. Fetch all classes for the unit & academic year
  const classes = await getKindergartenClasses(academicYearId);
  const targetClass = classes.find(c => c.id === classId || c.name === classId);
  if (!targetClass) {
    console.warn(`[getKindergartenActiveRoster] Class not found for classId: ${classId} and year: ${academicYearId}`);
    return [];
  }

  // 2. Fetch active enrollments for this class and academic year
  const enrollmentsQuery = query(
    collection(db, 'enrollments'),
    where('unitId', '==', unit),
    where('academicYear', '==', academicYearId)
  );
  
  const enrollmentsSnap = await getDocs(enrollmentsQuery);
  const enrollments = enrollmentsSnap.docs
    .map(doc => doc.data())
    .filter(e => {
      // Must be active status
      const isActive = e.status === 'active' || !e.status;
      // Must match class ID or class Name
      const matchesClass = e.classId === targetClass.id || e.classId === targetClass.name;
      return isActive && matchesClass;
    });

  if (enrollments.length === 0) return [];

  const enrolledStudentIds = new Set(enrollments.map(e => e.studentId).filter(Boolean));

  // 3. Get all resolved students for this year from cache
  const allStudents = await getKindergartenStudents(academicYearId);

  // 4. Filter and map students who have active enrollments
  const roster: KindergartenRosterStudent[] = [];

  // Determine ageGroup for the class to ensure correct rubric mapping
  let ageGroup: 'PRA_TK' | 'TK_A' | 'TK_B' = 'TK_A';
  const grade = String(targetClass.grade || '').toUpperCase();
  const name = String(targetClass.name || '').toUpperCase();
  const cid = String(targetClass.id || '').toUpperCase();
  
  if (cid.includes('TKB') || cid.includes('TK-B') || cid.includes('BUTTERFLY') || grade.includes('TK_B') || grade === 'TK B' || grade === 'TKB') {
    ageGroup = 'TK_B';
  } else if (cid.includes('TKA') || cid.includes('TK-A') || cid.includes('CATERPILLAR') || grade.includes('TK_A') || grade === 'TK A' || grade === 'TKA') {
    ageGroup = 'TK_A';
  } else if (cid.includes('PRA_TK') || cid.includes('PRA-TK') || cid.includes('PLAYGROUP') || cid.includes('PG') || cid.includes('BUNAKEN') || grade.includes('PRA') || grade === 'PRA TK' || grade === 'PLAYGROUP') {
    ageGroup = 'PRA_TK';
  }

  // Map enrolled students
  enrolledStudentIds.forEach(studentId => {
    // Find in the resolved students master list
    const found = allStudents.find(s => s.id === studentId);
    if (found) {
      roster.push({
        id: studentId,
        name: found.name || 'Siswa Tanpa Nama',
        nickName: found.nickName || found.nickname || found.name?.split(' ')[0] || 'Siswa',
        email: found.email || '',
        classId: targetClass.id, // Normalize to the official Class ID
        className: targetClass.name,
        unitId: unit,
        ageGroup: ageGroup
      });
    } else {
      // Fallback if not found in resolved list, create basic record
      roster.push({
        id: studentId,
        name: 'Siswa Tanpa Nama',
        nickName: 'Siswa',
        classId: targetClass.id,
        className: targetClass.name,
        unitId: unit,
        ageGroup: ageGroup
      });
    }
  });

  // Sort by student name alphabetically
  return roster.sort((a, b) => a.name.localeCompare(b.name));
}
