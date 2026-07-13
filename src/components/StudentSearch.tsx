import * as React from 'react';
import { Search, User, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface StudentSearchResult {
  id: string;
  name: string;
  nickname?: string;
  classId?: string;
  className?: string;
}

interface StudentSearchProps {
  onSelect: (student: StudentSearchResult) => void;
  placeholder?: string;
  className?: string;
  classId?: string;
}

export default function StudentSearch({ onSelect, placeholder = "Cari siswa...", className, classId }: StudentSearchProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [results, setResults] = React.useState<StudentSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const searchStudents = async () => {
      setLoading(true);
      try {
        // 1. Search in 'users' collection (for onboarded active students)
        const usersRef = collection(db, 'users');
        const usersQ = query(usersRef, where('role', '==', 'STUDENT'));
        const usersSnap = await getDocs(usersQ);
        
        const activeStudents = usersSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.displayName || data.name || 'Unknown',
            nickname: data.nickname,
            className: data.jobTitle,
            classId: data.classId
          };
        });

        // 2. Search in 'roleInvites' for non-onboarded students
        const invitesRef = collection(db, 'roleInvites');
        const invitesQ = query(invitesRef, where('role', '==', 'STUDENT'));
        const invitesSnap = await getDocs(invitesQ);
        const invitedStudents = invitesSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: `INVITE_${doc.id}`,
            name: data.name || '',
            nickname: data.nickname,
            className: data.jobTitle,
            classId: data.classId
          };
        });

        // 3. Search in master 'students' collection
        const studentsRef = collection(db, 'students');
        const studentsSnap = await getDocs(studentsRef);
        const masterStudents = studentsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || data.fullName || 'Unknown',
            nickname: data.nickname,
            className: data.className || data.jobTitle,
            classId: data.classId
          };
        });

        // Resolve enrollments of selected class to find enrolled student ids
        let enrolledStudentIds: string[] = [];
        let targetClassName = '';
        if (classId) {
          try {
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
              targetClassName = classDoc.data().name || '';
            }
            
            const enrollmentsRef = collection(db, 'enrollments');
            const queries = [
              query(enrollmentsRef, where('classId', '==', classId))
            ];
            if (targetClassName) {
              queries.push(query(enrollmentsRef, where('classId', '==', targetClassName)));
            }
            const snaps = await Promise.all(queries.map(q => getDocs(q)));
            snaps.forEach(snap => {
              snap.docs.forEach(d => {
                const data = d.data();
                if (data.studentId && !enrolledStudentIds.includes(data.studentId)) {
                  enrolledStudentIds.push(data.studentId);
                }
              });
            });
          } catch (e) {
            console.warn("Error resolving enrollments in StudentSearch:", e);
          }
        }

        // Merge and filter
        const allStudents = [...activeStudents, ...invitedStudents, ...masterStudents];
        
        // De-duplicate by ID (active/students collection preferred over invites)
        const uniqueStudentsMap = new Map();
        allStudents.forEach(s => {
          if (!uniqueStudentsMap.has(s.id) || !s.id.startsWith('INVITE_')) {
            const existing = uniqueStudentsMap.get(s.id);
            // Reconcile and merge metadata
            uniqueStudentsMap.set(s.id, {
              ...existing,
              ...s,
              classId: s.classId || existing?.classId,
              className: s.className || existing?.className
            });
          }
        });
        
        const uniqueStudents = Array.from(uniqueStudentsMap.values());

        const filtered = uniqueStudents.filter(s => {
          if (classId) {
            const matchesEnrollment = enrolledStudentIds.includes(s.id);
            const matchesClassId = s.classId === classId;
            const matchesClassName = targetClassName && s.className && s.className.toLowerCase() === targetClassName.toLowerCase();
            if (!matchesEnrollment && !matchesClassId && !matchesClassName) {
              return false;
            }
          }

          const nameStr = s.name || '';
          const lowerName = nameStr.toLowerCase();
          // Stricter filtering for class placeholders and mock accounts
          const isClassPlaceholder = 
            lowerName === 'gc smp' || 
            lowerName.includes('grade ') || 
            lowerName.includes('kelas ') ||
            lowerName.includes('general class') ||
            lowerName.includes('placeholder') ||
            lowerName.includes('test student');
            
          return !isClassPlaceholder && nameStr.length > 2 && (
            lowerName.includes(searchTerm.toLowerCase()) || 
            (s.nickname && s.nickname.toLowerCase().includes(searchTerm.toLowerCase()))
          );
        }).slice(0, 50);

        setResults(filtered);
      } catch (err) {
        console.error('Error searching students:', err);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(searchStudents, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, classId]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder={placeholder}
          className="w-full pl-12 pr-10 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {searchTerm && (
          <button 
            onClick={() => {
              setSearchTerm('');
              setResults([]);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (searchTerm.length >= 2 || loading) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 w-full mt-2 bg-white rounded-3xl shadow-2xl border border-gray-100 max-h-60 overflow-y-auto"
          >
            {loading ? (
              <div className="p-8 flex items-center justify-center gap-3 text-gray-400">
                <Loader2 size={20} className="animate-spin text-blue-500" />
                <span className="text-xs font-black uppercase tracking-widest">Mencari...</span>
              </div>
            ) : results.length > 0 ? (
              <div className="p-2">
                {results.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => {
                      onSelect(student);
                      setSearchTerm('');
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-blue-50 text-left transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center group-hover:bg-white group-hover:text-blue-600 transition-colors">
                      <User size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                         <p className="font-bold text-gray-900">{student.name}</p>
                         {student.nickname && (
                           <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                             {student.nickname}
                           </span>
                         )}
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {student.className || 'Tidak ada kelas'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                <p className="text-xs font-black uppercase tracking-widest">Tidak ada hasil</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
