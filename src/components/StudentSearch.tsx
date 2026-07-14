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
  unitId?: string;
  academicYear?: string;
}

export default function StudentSearch({ 
  onSelect, 
  placeholder = "Cari siswa...", 
  className, 
  classId,
  unitId,
  academicYear
}: StudentSearchProps) {
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
        // 1. Resolve class metadata and enrollments based on either classId OR (unitId + academicYear)
        let classIds: string[] = [];
        let classNames: string[] = [];
        const classNameMap: Record<string, string> = {};
        const enrollmentMap: Record<string, { classId: string; className: string }> = {};
        let enrolledStudentIds: string[] = [];
        let targetClassName = '';

        if (classId) {
          try {
            const classDoc = await getDoc(doc(db, 'classes', classId));
            if (classDoc.exists()) {
              targetClassName = classDoc.data().name || '';
              classNameMap[classId] = targetClassName;
            }
            classIds.push(classId);
            if (targetClassName) classNames.push(targetClassName.toLowerCase());
            
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
                if (data.studentId) {
                  if (!enrolledStudentIds.includes(data.studentId)) {
                    enrolledStudentIds.push(data.studentId);
                  }
                  enrollmentMap[data.studentId] = {
                    classId: classId, // Normalize to the stable document class ID
                    className: targetClassName || data.classId
                  };
                }
              });
            });
          } catch (e) {
            console.warn("Error resolving enrollments in StudentSearch:", e);
          }
        } else if (unitId && academicYear) {
          try {
            const classesRef = collection(db, 'classes');
            const classesQ = query(
              classesRef, 
              where('unitId', '==', unitId),
              where('academicYear', '==', academicYear)
            );
            const classesSnap = await getDocs(classesQ);
            const nameToIdMap: Record<string, string> = {};
            classesSnap.docs.forEach(doc => {
              const data = doc.data();
              if (data.status !== 'archived') {
                classIds.push(doc.id);
                if (data.name) {
                  classNames.push(data.name.toLowerCase());
                  classNameMap[doc.id] = data.name;
                  nameToIdMap[data.name.toLowerCase()] = doc.id;
                }
              }
            });

            if (classIds.length > 0) {
              const enrollmentsRef = collection(db, 'enrollments');
              const enrollmentsQ = query(
                enrollmentsRef,
                where('academicYear', '==', academicYear),
                where('status', '==', 'active')
              );
              const enrollmentsSnap = await getDocs(enrollmentsQ);
              enrollmentsSnap.docs.forEach(doc => {
                const data = doc.data();
                const matchedClassId = data.classId ? (classIds.includes(data.classId) ? data.classId : nameToIdMap[data.classId.toLowerCase()]) : null;
                if (data.studentId && matchedClassId) {
                  if (!enrolledStudentIds.includes(data.studentId)) {
                    enrolledStudentIds.push(data.studentId);
                  }
                  enrollmentMap[data.studentId] = {
                    classId: matchedClassId,
                    className: classNameMap[matchedClassId] || data.classId
                  };
                }
              });
            }
          } catch (e) {
            console.warn("Error resolving unit classes and enrollments in StudentSearch:", e);
          }
        }

        // Helper to normalize classes/names based on the active classes metadata
        const normalizeStudent = (s: any) => {
          let resolvedClassId = s.classId;
          let resolvedClassName = s.className;

          if (resolvedClassId && !classIds.includes(resolvedClassId)) {
            // Check if classId in record is actually class name
            const matchByName = Object.entries(classNameMap).find(
              ([_, name]) => name.toLowerCase() === resolvedClassId.toLowerCase()
            );
            if (matchByName) {
              resolvedClassId = matchByName[0];
              resolvedClassName = matchByName[1];
            } else {
              // Try soft matching against list of active classIds or classNames
              const lowerId = resolvedClassId.toLowerCase();
              const matchedId = classIds.find(id => id.toLowerCase().includes(lowerId) || lowerId.includes(id.toLowerCase()));
              if (matchedId) {
                resolvedClassId = matchedId;
                resolvedClassName = classNameMap[matchedId];
              }
            }
          }

          if (!resolvedClassName && resolvedClassId) {
            resolvedClassName = classNameMap[resolvedClassId] || resolvedClassId;
          }

          return {
            ...s,
            classId: resolvedClassId,
            className: resolvedClassName
          };
        };

        // 2. Fetch master lists (users, roleInvites, students)
        const usersRef = collection(db, 'users');
        const usersQ = query(usersRef, where('role', '==', 'STUDENT'));
        const usersSnap = await getDocs(usersQ);
        
        const activeStudents = usersSnap.docs.map(doc => {
          const data = doc.data();
          const mappedEnrollment = enrollmentMap[doc.id];
          return normalizeStudent({
            id: doc.id,
            name: data.displayName || data.name || 'Unknown',
            nickname: data.nickname,
            className: mappedEnrollment?.className || data.jobTitle,
            classId: mappedEnrollment?.classId || data.classId
          });
        });

        const invitesRef = collection(db, 'roleInvites');
        const invitesQ = query(invitesRef, where('role', '==', 'STUDENT'));
        const invitesSnap = await getDocs(invitesQ);
        const invitedStudents = invitesSnap.docs.map(doc => {
          const data = doc.data();
          const inviteId = `INVITE_${doc.id}`;
          const mappedEnrollment = enrollmentMap[inviteId] || enrollmentMap[doc.id];
          return normalizeStudent({
            id: inviteId,
            name: data.name || '',
            nickname: data.nickname,
            className: mappedEnrollment?.className || data.jobTitle,
            classId: mappedEnrollment?.classId || data.classId
          });
        });

        const studentsRef = collection(db, 'students');
        const studentsSnap = await getDocs(studentsRef);
        const masterStudents = studentsSnap.docs.map(doc => {
          const data = doc.data();
          const mappedEnrollment = enrollmentMap[doc.id];
          return normalizeStudent({
            id: doc.id,
            name: data.name || data.fullName || 'Unknown',
            nickname: data.nickname,
            className: mappedEnrollment?.className || data.className || data.jobTitle,
            classId: mappedEnrollment?.classId || data.classId
          });
        });

        // 3. Merge and De-duplicate by student ID
        const allStudents = [...activeStudents, ...invitedStudents, ...masterStudents];
        const uniqueStudentsMap = new Map();
        allStudents.forEach(s => {
          if (!uniqueStudentsMap.has(s.id) || !s.id.startsWith('INVITE_')) {
            const existing = uniqueStudentsMap.get(s.id);
            uniqueStudentsMap.set(s.id, {
              ...existing,
              ...s,
              classId: s.classId || existing?.classId,
              className: s.className || existing?.className
            });
          }
        });
        
        const uniqueStudents = Array.from(uniqueStudentsMap.values());

        // 4. Filter according to query/class/unit and check for name or nickname matches
        const filtered = uniqueStudents.filter(s => {
          // If filtering by classId, must match the target class or enrollments
          if (classId) {
            const matchesEnrollment = enrolledStudentIds.includes(s.id);
            const matchesClassId = s.classId === classId || (s.classId && targetClassName && s.classId.toLowerCase() === targetClassName.toLowerCase());
            const matchesClassName = targetClassName && s.className && s.className.toLowerCase() === targetClassName.toLowerCase();
            if (!matchesEnrollment && !matchesClassId && !matchesClassName) {
              return false;
            }
          }

          // If filtering by unitId, must be enrolled in one of the unit's active classes
          if (unitId) {
            const matchesEnrollment = enrolledStudentIds.includes(s.id);
            const matchesClassId = s.classId && (classIds.includes(s.classId) || classNames.includes(s.classId.toLowerCase()));
            const matchesClassName = s.className && classNames.includes(s.className.toLowerCase());
            if (!matchesEnrollment && !matchesClassId && !matchesClassName) {
              return false;
            }
          }

          const nameStr = s.name || '';
          const lowerName = nameStr.toLowerCase();
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
  }, [searchTerm, classId, unitId, academicYear]);

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
