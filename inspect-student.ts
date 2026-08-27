import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("=== Inspecting Student Data ===");
  const q = query(collection(db, 'students'), where('name', '>=', 'Lauzah'), limit(5));
  const snap = await getDocs(q);
  if (snap.empty) {
    console.log("No student found starting with Lauzah");
    // Let's do a case-insensitive search or look for any student with Lauzah in their name
    const allSnap = await getDocs(collection(db, 'students'));
    const matches = allSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(s => s.name?.toLowerCase().includes('lauzah'));
    console.log(`Found ${matches.length} matches via filter:`, JSON.stringify(matches, null, 2));
  } else {
    snap.docs.forEach(doc => {
      console.log(`ID: ${doc.id}`, JSON.stringify(doc.data(), null, 2));
    });
  }

  console.log("\n=== Inspecting Active SE Periods ===");
  const periodSnap = await getDocs(collection(db, 'sePeriods'));
  const periods = periodSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  console.log("Periods count:", periods.length);
  periods.forEach(p => {
    console.log(`Period ID: ${p.id}, Label: ${p.label}, IsActive: ${p.isActive}, AcademicYear: ${p.academicYear}, Semester: ${p.semester}, Unit: ${p.unit}`);
  });

  console.log("\n=== Inspecting Active SE Cycles ===");
  const cycleSnap = await getDocs(collection(db, 'seReflectionCycles'));
  const cycles = cycleSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  console.log("Cycles count:", cycles.length);
  cycles.forEach(c => {
    console.log(`Cycle ID: ${c.id}, Title: ${c.title}, Status: ${c.status}, AcademicYear: ${c.academicYear}, Semester: ${c.semester}, EligibleGrades: ${JSON.stringify(c.eligibleGrades)}, Unit: ${c.unit}`);
  });
}

run().catch(console.error);
