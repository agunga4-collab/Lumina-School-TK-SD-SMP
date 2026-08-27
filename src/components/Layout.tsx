import * as React from 'react';
import { 
  Home, Bell, Grid, LogOut, ChevronRight, LayoutDashboard, 
  Map as MapIcon, Smile, Camera, History, Heart, CheckSquare, BookOpen, 
  Eye, Clock, ShieldAlert, ShieldCheck, ClipboardList, ClipboardCheck, Target, Mail, RefreshCw,
  Baby, TrendingUp, Folder, BarChart3, FileText, Sparkles, Settings, GraduationCap, User, Users,
  Menu, X, Presentation, MessageSquare, Compass, Calendar, Link
} from 'lucide-react';
import { NavLink, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import type { UserRole, UnitType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import { useMenuVisibility } from '../context/MenuVisibilityContext';
import { LuminaLogo } from './LuminaLogo';
import { NotificationBell } from './NotificationBell';
import { useBehaviorAlerts } from '../hooks/useBehaviorAlerts';
import LuminaChat from './LuminaChat';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { db, getParentStudentLinks, getStudentById } from '../lib/firebase';
import { toast } from 'sonner';
import type { Student } from '../types';

export function Layout() {
  const { profile, signOut } = useAuth();
  const currentUser = profile;
  const { activeYear, activeSemester } = useAcademicYear();
  const { isMenuVisible } = useMenuVisibility();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [pendingLXDCount, setPendingLXDCount] = React.useState(0);
  const [resolvedStudentName, setResolvedStudentName] = React.useState<string>("");
  const [resolvedStudentClass, setResolvedStudentClass] = React.useState<string>("");

  React.useEffect(() => {
    if (currentUser && currentUser.role === 'STUDENT' && currentUser.luminaId) {
      const fetchMasterStudentData = async () => {
        try {
          const studentId = currentUser.luminaId.trim();
          // Fetch student name from master students table
          const studentSnap = await getDoc(doc(db, 'students', studentId));
          if (studentSnap.exists()) {
            const sData = studentSnap.data();
            if (sData.name) {
              setResolvedStudentName(sData.name);
            }
          }

          // Fetch enrollment class
          if (activeYear) {
            const qEnroll = query(
              collection(db, 'enrollments'),
              where('studentId', '==', studentId),
              where('academicYear', '==', activeYear)
            );
            const qEnrollSnap = await getDocs(qEnroll);
            if (!qEnrollSnap.empty) {
              const enrollment = qEnrollSnap.docs[0].data();
              
              // Now get the class name
              const classDocSnap = await getDoc(doc(db, 'classes', enrollment.classId));
              if (classDocSnap.exists()) {
                const cData = classDocSnap.data();
                if (cData.name) {
                  setResolvedStudentClass(cData.name);
                }
              } else {
                // Try query by class name
                const qClass = query(
                  collection(db, 'classes'),
                  where('name', '==', enrollment.classId)
                );
                const qClassSnap = await getDocs(qClass);
                if (!qClassSnap.empty) {
                  const cData = qClassSnap.docs[0].data();
                  if (cData.name) {
                    setResolvedStudentClass(cData.name);
                  }
                } else {
                  setResolvedStudentClass(enrollment.classId);
                }
              }
            }
          }
        } catch (err) {
          console.error("Error resolving master student profile details in Layout:", err);
        }
      };
      fetchMasterStudentData();
    } else {
      setResolvedStudentName("");
      setResolvedStudentClass("");
    }
  }, [currentUser, activeYear]);
  const [logos, setLogos] = React.useState<{
    KINDERGARTEN: { rectangular: string; square: string };
    ELEMENTARY: { rectangular: string; square: string };
    JUNIOR_HIGH: { rectangular: string; square: string };
  }>({
    KINDERGARTEN: { rectangular: "", square: "" },
    ELEMENTARY: { rectangular: "", square: "" },
    JUNIOR_HIGH: { rectangular: "", square: "" },
  });

  const schoolLogo = React.useMemo(() => {
    return logos?.KINDERGARTEN?.square || logos?.ELEMENTARY?.square || logos?.JUNIOR_HIGH?.square ||
           logos?.KINDERGARTEN?.rectangular || logos?.ELEMENTARY?.rectangular || logos?.JUNIOR_HIGH?.rectangular || "";
  }, [logos]);

  React.useEffect(() => {
    const fetchLogos = async () => {
      try {
        const logoDoc = await getDoc(doc(db, "settings", "logos"));
        if (logoDoc.exists()) {
          setLogos(logoDoc.data() as any);
        } else {
          const localLogos = localStorage.getItem("lumina_school_logos");
          if (localLogos) {
            setLogos(JSON.parse(localLogos));
          }
        }
      } catch (err) {
        console.warn("Failed to load school logos in Layout selector:", err);
        const localLogos = localStorage.getItem("lumina_school_logos");
        if (localLogos) {
          try {
            setLogos(JSON.parse(localLogos));
          } catch (_) {}
        }
      }
    };
    fetchLogos();
  }, []);
  
  // Close sidebar on navigation (mobile only)
  React.useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  // Open sidebar on desktop by default on mount
  React.useEffect(() => {
    if (window.innerWidth >= 1024) {
      setSidebarOpen(true);
    }
  }, []);

  // Listen for pending LXD count for admins
  React.useEffect(() => {
    if (profile?.role === 'HEAD_UNIT' || profile?.role === 'SUPER_ADMIN') {
      const q = query(
        collection(db, 'lxd'),
        where('status', '==', 'PENDING_APPROVAL')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log('Sidebar LXD pending count:', snapshot.docs.length);
        setPendingLXDCount(snapshot.docs.length);
      }, (error) => {
        console.error("Error listening for pending LXD count:", error);
      });
      
      return () => unsubscribe();
    }
  }, [profile?.role]);
  
  // Call the alert scanner hook
  useBehaviorAlerts();

  const [hasKindyClassAssignment, setHasKindyClassAssignment] = React.useState(false);
  const [hasElementaryClassAssignment, setHasElementaryClassAssignment] = React.useState(false);

  React.useEffect(() => {
    if (!currentUser || !activeYear) {
      setHasKindyClassAssignment(false);
      setHasElementaryClassAssignment(false);
      return;
    }
    const checkKindyClass = async () => {
      try {
        const qAssigned = query(
          collection(db, 'classes'),
          where('unitId', '==', 'KINDERGARTEN'),
          where('academicYear', '==', activeYear),
          where('assignedTeacherIds', 'array-contains', currentUser.uid)
        );
        const qLegacy = query(
          collection(db, 'classes'),
          where('unitId', '==', 'KINDERGARTEN'),
          where('academicYear', '==', activeYear),
          where('homeroomTeacherId', '==', currentUser.uid)
        );
        const [snapAssigned, snapLegacy] = await Promise.all([getDocs(qAssigned), getDocs(qLegacy)]);
        setHasKindyClassAssignment(!snapAssigned.empty || !snapLegacy.empty);
      } catch (err) {
        console.error('Error checking kindy class assignment in layout:', err);
        setHasKindyClassAssignment(false);
      }
    };
    const checkElementaryClass = async () => {
      try {
        const qAssigned = query(
          collection(db, 'classes'),
          where('unitId', '==', 'ELEMENTARY'),
          where('academicYear', '==', activeYear),
          where('assignedTeacherIds', 'array-contains', currentUser.uid)
        );
        const qLegacy = query(
          collection(db, 'classes'),
          where('unitId', '==', 'ELEMENTARY'),
          where('academicYear', '==', activeYear),
          where('homeroomTeacherId', '==', currentUser.uid)
        );
        const [snapAssigned, snapLegacy] = await Promise.all([getDocs(qAssigned), getDocs(qLegacy)]);
        setHasElementaryClassAssignment(!snapAssigned.empty || !snapLegacy.empty);
      } catch (err) {
        console.error('Error checking elementary class assignment in layout:', err);
        setHasElementaryClassAssignment(false);
      }
    };
    checkKindyClass();
    checkElementaryClass();
  }, [currentUser, activeYear]);

  // Use state for activeUnit so Super Admin and Parents can switch
  const [activeUnit, setActiveUnit] = React.useState<UnitType | null>(() => {
    if (profile?.role === 'HEAD_UNIT' && profile?.unitId === 'KINDERGARTEN') {
      return 'KINDERGARTEN';
    }
    const saved = localStorage.getItem('lumina_active_unit');
    return (saved as UnitType) || null;
  });

  const [showChatView, setShowChatView] = React.useState(false);

  React.useEffect(() => {
    if (profile?.role === 'HEAD_UNIT' && profile?.unitId === 'KINDERGARTEN') {
      if (activeUnit !== 'KINDERGARTEN') {
        setActiveUnit('KINDERGARTEN');
      }
    }
  }, [profile, activeUnit]);

  React.useEffect(() => {
    if (activeUnit) {
      localStorage.setItem('lumina_active_unit', activeUnit);
    } else {
      localStorage.removeItem('lumina_active_unit');
    }
  }, [activeUnit]);

  const [parentAccessibleUnits, setParentAccessibleUnits] = React.useState<UnitType[]>([]);
  const [parentStudents, setParentStudents] = React.useState<Student[]>([]);
  const [parentCheckTrigger, setParentCheckTrigger] = React.useState(0);

  // Listen to parent student linkage edits
  React.useEffect(() => {
    const handleRefetch = () => {
      setParentCheckTrigger(prev => prev + 1);
    };
    window.addEventListener('parent_student_linked_changed', handleRefetch);
    return () => {
      window.removeEventListener('parent_student_linked_changed', handleRefetch);
    };
  }, []);

  // Fetch linked students to determine accessible units and filter students for parents
  React.useEffect(() => {
    if (currentUser && currentUser.role === 'PARENT') {
      const getParentUnitsAndStudents = async () => {
        try {
          const linkData = await getParentStudentLinks(currentUser?.email);
          if (linkData && linkData.studentIds.length > 0) {
            const studentPromises = linkData.studentIds.map(id => getStudentById(id));
            const studentData = await Promise.all(studentPromises);
            const validStudents = studentData.filter(s => s !== null) as Student[];
            
            // Deduplicate students by normalized id (preferring luminaId/NIS)
            const uniqueStudentsMap = new Map<string, Student>();
            validStudents.forEach(s => {
              const studentId = (s as any).luminaId || s.id;
              if (!uniqueStudentsMap.has(studentId)) {
                uniqueStudentsMap.set(studentId, { ...s, id: studentId });
              }
            });
            const deduplicatedStudents = Array.from(uniqueStudentsMap.values()) as Student[];
            
            setParentStudents(deduplicatedStudents);
            
            // Extract unique units
            const units = Array.from(new Set(deduplicatedStudents.map((s: any) => {
              const u = s.unitId || s.currentUnit || '';
              return u.toUpperCase() as UnitType;
            }).filter(Boolean)));
            setParentAccessibleUnits(units);
          } else {
            setParentStudents([]);
            if (currentUser.unitId) {
              setParentAccessibleUnits([currentUser.unitId as UnitType]);
            } else {
              setParentAccessibleUnits([]);
            }
          }
        } catch (err) {
          console.error("Error retrieving parent students and units:", err);
          if (currentUser.unitId) {
            setParentAccessibleUnits([currentUser.unitId as UnitType]);
          }
        }
      };
      getParentUnitsAndStudents();
    }
  }, [currentUser, parentCheckTrigger]);

  // Automatically bypass unit selector ONLY for students
  React.useEffect(() => {
    if (currentUser && currentUser.role === 'STUDENT') {
      setActiveUnit((currentUser.unitId as UnitType) || 'JUNIOR_HIGH');
    }
  }, [currentUser]);

  // Student selection for Parents
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(() => {
    const saved = localStorage.getItem('lumina_selected_student_id');
    return saved || currentUser?.linkedStudents?.[0] || null;
  });

  React.useEffect(() => {
    if (selectedStudentId) {
      localStorage.setItem('lumina_selected_student_id', selectedStudentId);
    } else {
      localStorage.removeItem('lumina_selected_student_id');
    }
  }, [selectedStudentId]);

  // Automatically select the first student belonging to the selected unit when a parent switches unit
  React.useEffect(() => {
    if (currentUser?.role === 'PARENT' && activeUnit && parentStudents.length > 0) {
      const studentsInUnit = parentStudents.filter(s => {
        const u = s.unitId || s.currentUnit || '';
        return u.toUpperCase() === activeUnit.toUpperCase();
      });
      if (studentsInUnit.length > 0) {
        const currentSelectedInUnit = studentsInUnit.some(s => s.id === selectedStudentId);
        if (!currentSelectedInUnit) {
          setSelectedStudentId(studentsInUnit[0].id);
        }
      }
    }
  }, [activeUnit, parentStudents, currentUser, selectedStudentId]);

  if (!currentUser) return null;

  const currentUnit = (currentUser.role === 'kindergarten_subject_teacher' || (currentUser.role === 'HEAD_UNIT' && currentUser.unitId === 'KINDERGARTEN'))
    ? 'KINDERGARTEN'
    : (activeUnit || (currentUser.unitId as UnitType) || 'JUNIOR_HIGH');

  if (location.pathname.includes('/conference/presentation/')) {
    return (
      <main className="min-h-screen bg-gray-50/50 w-full" id="presentation-layout-wrapper">
        <Outlet context={{ 
          currentUser, 
          activeUnit: currentUnit, 
          selectedStudentId, 
          setSelectedStudentId,
          parentStudents
        }} />
      </main>
    );
  }

  const getUnitName = (unit: UnitType) => {
    switch(unit) {
      case 'KINDERGARTEN': return 'Lumina Kindergarten';
      case 'ELEMENTARY': return 'Lumina Elementary';
      case 'JUNIOR_HIGH': return 'Lumina Junior High';
      default: return 'Lumina Academy';
    }
  };

  const getUnitColor = (unit: UnitType) => {
    switch(unit) {
      case 'KINDERGARTEN': return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      case 'ELEMENTARY': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'JUNIOR_HIGH': return 'text-blue-600 bg-blue-50 border-blue-100';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const ALL_UNITS: { value: UnitType; label: string }[] = [
    { value: 'KINDERGARTEN', label: 'Kindergarten' },
    { value: 'ELEMENTARY', label: 'Elementary' },
    { value: 'JUNIOR_HIGH', label: 'Junior High' },
  ];

  const getAccessibleUnits = (user: any): UnitType[] => {
    if (!user) return [];
    if (user.role === 'SUPER_ADMIN') {
      return ['KINDERGARTEN', 'ELEMENTARY', 'JUNIOR_HIGH'];
    }
    if (user.role === 'PARENT') {
      const unitsSet = new Set<UnitType>();
      
      // 1. Units from linked students
      parentAccessibleUnits.forEach(u => {
        if (u) unitsSet.add(u);
      });
      
      // 2. Units from parent's assignedUnits field
      if (Array.isArray(user.assignedUnits)) {
        user.assignedUnits.forEach((u: any) => {
          if (u) unitsSet.add(u as UnitType);
        });
      }
      
      // 3. Unit from parent's main unitId field
      if (user.unitId) {
        unitsSet.add(user.unitId as UnitType);
      }
      
      if (unitsSet.size > 0) {
        return Array.from(unitsSet);
      }
      return ['JUNIOR_HIGH'];
    }
    if (Array.isArray(user.assignedUnits) && user.assignedUnits.length > 0) {
      return user.assignedUnits as UnitType[];
    }
    if (user.unitId) {
      return [user.unitId as UnitType];
    }
    return [];
  };

  const handleSelectUnit = (selectedUnit: UnitType) => {
    const accessibleUnits = getAccessibleUnits(currentUser);
    const hasAccess = currentUser?.role === 'SUPER_ADMIN' || accessibleUnits.includes(selectedUnit);

    if (!hasAccess) {
      toast.error('Akses Ditolak', {
        description: 'Anda tidak memiliki izin untuk masuk ke unit ini.'
      });
      return;
    }

    setActiveUnit(selectedUnit);
  };

  // If activeUnit is not chosen yet, show unit selection dashboard for staff and parents
  if (!activeUnit && currentUser.role !== 'STUDENT' && currentUser.role !== 'kindergarten_subject_teacher') {
    const accessibleUnits = getAccessibleUnits(currentUser);

    if (showChatView && currentUser.role !== 'PARENT' && currentUser.role !== 'STUDENT') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
          <div className="max-w-4xl w-full space-y-6 my-auto">
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                   <LuminaLogo size="md" />
                   <div>
                      <h1 className="text-2xl font-black text-gray-900 tracking-tight">Lumina Chat AI</h1>
                      <p className="text-xs text-gray-500 font-medium">Asisten AI Resmi Lazuardi GCS</p>
                   </div>
                </div>
                <button 
                  onClick={() => setShowChatView(false)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-gray-50 transition-all shadow-sm cursor-pointer"
                >
                   ← Kembali ke Portal
                </button>
             </div>

             {/* Lumina Grounded AI Chat Assistant */}
             <LuminaChat userId={currentUser.uid} />

             <div className="text-center pt-4">
                <button 
                  onClick={signOut}
                  className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
                >
                   Keluar & Ganti Akun
                </button>
             </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 md:p-12 overflow-y-auto">
        <div className="max-w-4xl w-full space-y-8 my-auto">
           <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-3 mb-4">
                 <LuminaLogo size="lg" />
                 <h1 className="text-3xl font-black text-gray-900 tracking-tight text-blue-600">LUMINA</h1>
              </div>
              <h2 className="text-xl font-bold text-gray-800">Pilih Unit Pendidikan</h2>
              <p className="text-gray-500">Pilih unit utama yang ingin Anda gunakan hari ini.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ALL_UNITS.map(unitObj => {
                  const unit = unitObj.value;
                  const isAccessible = currentUser.role === 'SUPER_ADMIN' || accessibleUnits.includes(unit);

                  return (
                      <button 
                        key={unit}
                        onClick={() => handleSelectUnit(unit)}
                        className={cn(
                          "group bg-white p-8 rounded-[2.5rem] border shadow-sm transition-all text-left flex flex-col justify-between aspect-square relative overflow-hidden",
                          isAccessible 
                            ? "hover:shadow-xl hover:border-blue-200 border-gray-100 cursor-pointer" 
                            : "border-gray-200 opacity-60 cursor-not-allowed bg-gray-50/50"
                        )}
                      >
                         {!isAccessible && (
                            <div className="absolute top-4 right-4 bg-gray-100/80 text-gray-400 p-1.5 rounded-full border border-gray-200" title="Terkunci - Tidak ada akses">
                               <ShieldAlert size={14} />
                            </div>
                         )}
                         {logos[unit]?.rectangular || logos[unit]?.square ? (
                           <div className="w-full h-32 flex items-center justify-start mb-4 overflow-hidden rounded-2xl">
                             <img 
                               src={logos[unit].rectangular || logos[unit].square} 
                               alt={`${getUnitName(unit)} Logo`} 
                               className={cn(
                                 "max-h-full max-w-full object-contain mix-blend-multiply transition-transform group-hover:scale-105 duration-300",
                                 !isAccessible && "grayscale opacity-50 whitespace-nowrap"
                               )}
                               referrerPolicy="no-referrer"
                             />
                           </div>
                         ) : (
                           <div className={cn(
                             "p-8 rounded-[2rem] w-fit mb-4 group-hover:scale-105 transition-transform flex items-center justify-center", 
                             isAccessible 
                               ? getUnitColor(unit).split(' ')[1] 
                               : "text-gray-400 bg-gray-100"
                           )}>
                              {unit === 'KINDERGARTEN' && <Heart size={48} className={isAccessible ? "text-emerald-600" : "text-gray-400"} />}
                              {unit === 'ELEMENTARY' && <Baby size={48} className={isAccessible ? "text-emerald-500" : "text-gray-400"} />}
                              {unit === 'JUNIOR_HIGH' && <Target size={48} className={isAccessible ? "text-blue-500" : "text-gray-400"} />}
                           </div>
                         )}
                         <div>
                            <h3 className={cn(
                              "text-lg font-black transition-colors",
                              isAccessible 
                                ? "text-gray-900 group-hover:text-blue-600" 
                                : "text-gray-500"
                            )}>
                              {getUnitName(unit)}
                            </h3>
                            <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-widest leading-loose">
                              {isAccessible ? "Masuk Portal" : "Terkunci"}
                            </p>
                         </div>
                      </button>
                  );
              })}

              {/* Lumina Chat Portal Card */}
              {currentUser.role !== 'PARENT' && currentUser.role !== 'STUDENT' && (
                <button 
                  onClick={() => setShowChatView(true)}
                  className="group bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all text-left flex flex-col justify-between aspect-square relative overflow-hidden cursor-pointer"
                >
                   <div className="mb-4">
                      <LuminaLogo size="double" className="group-hover:scale-105 transition-transform duration-300 shadow-sm" />
                   </div>
                   <div>
                      <h3 className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors">
                        Lumina Chat AI
                      </h3>
                      <p className="text-xs text-gray-400 font-bold mt-1 uppercase tracking-widest leading-loose">
                        Tanya Asisten AI
                      </p>
                   </div>
                </button>
              )}
           </div>

           <div className="text-center">
              <button 
                onClick={signOut}
                className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
              >
                 Keluar & Ganti Akun
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex flex-col shadow-xl lg:shadow-sm z-40 lg:z-20 transition-transform duration-300 transform",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div>
             <div className="flex items-center gap-2 mb-1">
               {currentUnit && logos[currentUnit]?.square ? (
                 <img 
                   src={logos[currentUnit].square} 
                   alt={`${getUnitName(currentUnit)} Logo`} 
                   className="w-10 h-10 object-contain rounded-lg"
                   referrerPolicy="no-referrer"
                 />
               ) : currentUnit && logos[currentUnit]?.rectangular ? (
                 <img 
                   src={logos[currentUnit].rectangular} 
                   alt={`${getUnitName(currentUnit)} Logo`} 
                   className="h-10 object-contain rounded-lg"
                   referrerPolicy="no-referrer"
                 />
               ) : (
                 <LuminaLogo size="sm" />
               )}
               <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">LUMINA</h1>
             </div>
             <p className={cn("text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border w-fit mt-2", getUnitColor(currentUnit))}>
              {getUnitName(currentUnit)}
            </p>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-900 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 px-4 overflow-y-auto space-y-6 pb-8">
          {/* Dashboard Navigation */}
          <div className="space-y-1">
             <NavSectionLabel label="Utama" />
             
             {currentUser.role === 'STUDENT' ? (
                <>
                  {currentUnit !== 'KINDERGARTEN' && (
                    <NavItem to="/student/dashboard" icon={<Home size={18} />} label="Dashboard Siswa" />
                  )}
                  {currentUser.role === 'STUDENT' && currentUnit === 'JUNIOR_HIGH' && (
                    <>
                      <NavItem to="/student/learning-power-up" icon={<CheckSquare size={18} />} label="Learning Power-Up" />
                      <NavItem to="/student/unit-activities" icon={<Compass size={18} />} label="Unit Aktivitas" />
                      <NavItem to="/student/monthly-reports" icon={<FileText size={18} />} label="Rapor Bulanan" />
                    </>
                  )}
                  {currentUnit !== 'KINDERGARTEN' && (
                    <>
                      <NavItem to="/self-exploration/my" icon={<Sparkles size={18} />} label="Self Exploration" />
                      <NavItem to="/student/goal-setting" icon={<Target size={18} />} label="Goal Setting" />
                      <NavItem to="/student/my-presentation" icon={<Presentation size={18} />} label="My Presentation" />
                    </>
                  )}
                  {/* <NavItem to="/student/smart-goal-tracker" icon={<TrendingUp size={18} />} label="SMART Goal Tracker" /> */}
                  {(currentUnit === 'KINDERGARTEN' || isMenuVisible(currentUnit, 'reportCards')) && (
                    <NavItem to="/student/reports" icon={<FileText size={18} />} label="Rapor Saya" />
                  )}
                </>
             ) : currentUser.role === 'PARENT' ? (
                <>
                  <NavItem to="/parent/dashboard" icon={<Home size={18} />} label="Dashboard Ortu" />
                  {isMenuVisible(currentUnit, 'reportCards') && (
                    <NavItem to="/parent/reports" icon={<FileText size={18} />} label="Rapor Anak" />
                  )}
                  <NavItem to="/parent/students" icon={<Users size={18} />} label="Data Siswa" />
                </>
             ) : (
                // Hide traditional "Dashboard" menu for Head roles (Head Unit, Head Junior, Super Admin)
                !['HEAD_UNIT', 'HEAD_JUNIOR', 'SUPER_ADMIN'].includes(currentUser.role) && (
                  <NavItem to="/" icon={<Home size={18} />} label="Dashboard" />
                )
             )}
             
             {/* Render "Analisis Unit" first for Head Unit, Head Junior, and Super Admin roles */}
             {['HEAD_UNIT', 'HEAD_JUNIOR', 'SUPER_ADMIN'].includes(currentUser.role) && (
                <>
                  <NavItem 
                    to={
                      currentUnit === 'ELEMENTARY' 
                        ? '/dashboard/head-elementary' 
                        : currentUnit === 'KINDERGARTEN' 
                          ? '/dashboard/head-kindy' 
                          : '/'
                    } 
                    icon={<LayoutDashboard size={18} />} 
                    label="Analisis Unit" 
                  />
                  <NavItem to="/child/passport" icon={<MapIcon size={18} />} label="Student Portfolio" />
                </>
             )}
          </div>

          {/* Unit Specific Menus (Teacher & Admin Only) */}
          {(currentUser.role === 'TEACHER' || currentUser.role === 'HEAD_UNIT' || currentUser.role === 'HEAD_JUNIOR' || currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'BK_MENTOR' || currentUser.role === 'kindergarten_subject_teacher') && (
            <>
              {currentUnit === 'KINDERGARTEN' && (
                <div className="space-y-1">
                  <NavSectionLabel label="Keseharian & Belajar" />
                  {currentUser.role !== 'kindergarten_subject_teacher' && (
                    <>
                      {(['SUPER_ADMIN', 'HEAD_UNIT'].includes(currentUser.role) || hasKindyClassAssignment) && (
                        <NavItem to="/kindy/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard" />
                      )}
                      <NavItem to="/class-data" icon={<Users size={18} />} label="Data Kelas" />
                      <NavItem to="/kindy/aap-assessment" icon={<ClipboardCheck size={18} />} label="Asesmen Awal Pembelajaran" />
                      <NavItem to="/kindy/aap-report" icon={<FileText size={18} />} label="Hasil & Analisis AAP" />
                      <NavItem to="/kindy/checklist" icon={<Smile size={18} />} label="Attendance & Emotional Checklist" />
                    </>
                  )}
                  <NavItem to="/kindy/observation" icon={<Camera size={18} />} label="Observation Data" />
                  {currentUser.role !== 'kindergarten_subject_teacher' && (
                    <>
                      <NavItem to="/kindy/weekly-summary" icon={<Sparkles size={18} />} label="Weekly Summary & AI" />
                      <NavItem to="/kindy/weekly-review" icon={<History size={18} />} label="Weekly Report (Final)" />
                      <NavItem to="/kindy/attendance-recap" icon={<FileText size={18} />} label="Rekap Absensi (H/S/I/A)" />
                    </>
                  )}
                </div>
              )}

              {currentUnit === 'ELEMENTARY' && (
                <div className="space-y-1">
                  <NavSectionLabel label="Akademik" />
                  {(['SUPER_ADMIN', 'HEAD_UNIT'].includes(currentUser.role) || hasElementaryClassAssignment) && (
                    <NavItem to="/elementary/dashboard" icon={<LayoutDashboard size={18} />} label="Dashboard Guru Kelas" />
                  )}
                  <NavItem to="/class-data" icon={<Users size={18} />} label="Data Kelas" />
                  <NavItem to="/lateness" icon={<Clock size={18} />} label="Keterlambatan" />
                  <NavItem to="/attendance" icon={<CheckSquare size={18} />} label="Kehadiran" />
                  <NavItem to="/elementary/anecdote" icon={<MessageSquare size={18} />} label="Anekdot Kelas" />
                  {isMenuVisible(currentUnit, 'learningGoals') && (
                    <NavItem to="/academic/learning-goals" icon={<Target size={18} />} label="Learning Goals" />
                  )}
                  {isMenuVisible(currentUnit, 'lxd') && (
                    <NavItem to="/academic/lxd" icon={<BookOpen size={18} />} label="LXD" />
                  )}
                  <NavItem to="/elementary/literasi-numerasi" icon={<BookOpen size={18} />} label="Literasi & Numerasi" />
                  <NavItem to="/elementary/mtss-academic" icon={<GraduationCap size={18} />} label="MTSS Academic" />
                  <NavItem to="/elementary/ldss" icon={<ClipboardCheck size={18} />} label="LDSS" />
                </div>
              )}

              {currentUnit === 'JUNIOR_HIGH' && (
                <div className="space-y-1">
                  <NavSectionLabel label="Akademik & MTSS" />
                  <NavItem to="/class-data" icon={<Users size={18} />} label="Data Kelas" />
                  <NavItem to="/lateness" icon={<Clock size={18} />} label="Keterlambatan & Pelanggaran Ringan" />
                  <NavItem to="/attendance" icon={<CheckSquare size={18} />} label="Kehadiran" />
                  {isMenuVisible(currentUnit, 'learningGoals') && (
                    <NavItem to="/academic/learning-goals" icon={<Target size={18} />} label="Learning Goals" />
                  )}
                  {isMenuVisible(currentUnit, 'lxd') && (
                    <NavItem to="/academic/lxd" icon={<BookOpen size={18} />} label="LXD" />
                  )}
                  {isMenuVisible(currentUnit, 'lxd') && (currentUser.role === 'HEAD_UNIT' || currentUser.role === 'SUPER_ADMIN') && (
                    <NavItem 
                      to="/academic/lxd/approval-queue" 
                      icon={<ClipboardList size={18} />} 
                      label="Approval Queue" 
                      badge={pendingLXDCount > 0 ? pendingLXDCount.toString() : undefined}
                    />
                  )}
                  {isMenuVisible(currentUnit, 'gradebook') && (
                    <NavItem to="/academic/buku-nilai" icon={<BarChart3 size={18} />} label="Buku Nilai" />
                  )}
                  {isMenuVisible(currentUnit, 'reportCards') && (
                    <NavItem to="/academic/rapor" icon={<FileText size={18} />} label="Rapor" />
                  )}
                  <NavItem to="/junior-high/literasi-numerasi" icon={<BookOpen size={18} />} label="Literasi & Numerasi" />
                  <NavItem to="/junior-high/learning-power-up" icon={<CheckSquare size={18} />} label="Learning Power-Up" />
                  <NavItem to="/self-exploration" icon={<Sparkles size={18} />} label="Self-Exploration" />
                  {['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL'].includes(currentUser.role) && (
                    <NavItem to="/self-exploration/compilation" icon={<ClipboardList size={18} />} label="Kompilasi Refleksi SE" />
                  )}
                  {['SUPER_ADMIN', 'HEAD_JUNIOR', 'TEACHER'].includes(currentUser.role) && (
                    <NavItem to="/junior-high/unit-activities" icon={<Compass size={18} />} label="Unit Aktivitas" />
                  )}
                  {['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'HOMEROOM_TEACHER', 'COORDINATOR', 'COUNSELOR', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'PRINCIPAL', 'VICE_PRINCIPAL'].includes(currentUser.role) && (
                    <>
                      <NavItem to="/junior-high/monthly-report" icon={<FileText size={18} />} label="Monthly Report Summary" />
                      <NavItem to="/junior-high/monthly-comments" icon={<MessageSquare size={18} />} label="Monthly Report Comments" />
                      <NavItem to="/junior-high/monthly-report-preview" icon={<Eye size={18} />} label="Monthly Report Preview" />
                      <NavItem to="/junior-high/monthly-report-template" icon={<FileText size={18} />} label="Monthly Report Template" />
                      <NavItem to="/junior-high/monthly-report-pdf" icon={<FileText size={18} />} label="Monthly Report PDF" />
                      <NavItem to="/junior-high/monthly-report-pdf-link" icon={<Link size={18} />} label="Monthly Report PDF Link" />
                    </>
                  )}
                  <NavItem to="/junior-high/behavior/mtss/overview" icon={<ShieldAlert size={18} />} label="MTSS Behavior" />
                  <NavItem to="/junior-high/academic/mtss/overview" icon={<GraduationCap size={18} />} label="MTSS Academic" />
                  {['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'].includes(currentUser.role) && (
                    <>
                      <NavItem to="/junior-high/conference/workspace" icon={<Users size={18} />} label="3-Way Conf Workspace" />
                      {/* <NavItem to="/junior-high/conference/tracker" icon={<TrendingUp size={18} />} label="SMART Goal Tracker" /> */}
                    </>
                  )}
                  {currentUser.role === 'SUPER_ADMIN' && (
                    <NavItem to="/junior-high/conference/admin" icon={<Settings size={18} />} label="3-Way Conf Settings" />
                  )}
                </div>
              )}
            </>
          )}

          {/* Shared Sections */}
          {!(currentUser.role === 'STUDENT' && currentUnit === 'KINDERGARTEN') && (
            <div className="space-y-1">
              <NavSectionLabel label="Komunikasi" />
               {/* Refleksi Diri removed - replaced by Self Exploration in Academic for SMP */}
            </div>
          )}

          {((currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'HEAD_UNIT') && 
            !(currentUser.role === 'HEAD_UNIT' && currentUser.unitId === 'KINDERGARTEN')) && (
            <div className="space-y-1">
              <NavSectionLabel label="Sistem" />
              <NavItem to="/settings/report-config" icon={<Settings size={18} />} label="Report Config" />
              <NavItem to="/admin/attendance-calendar" icon={<Calendar size={18} />} label="Kalender Kehadiran" />
              {currentUser.role === 'SUPER_ADMIN' && (
                <NavItem to="/admin" icon={<ShieldCheck size={18} />} label="Panel Super Admin" />
              )}
            </div>
          )}
        </div>

        {/* User profile & Sign Out */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white shadow-sm border border-gray-100 mb-4">
             <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border-2 border-white shadow-sm ring-1 ring-blue-50 overflow-hidden">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt={resolvedStudentName || currentUser.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  (resolvedStudentName || currentUser.displayName)[0]
                )}
             </div>
             <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-bold text-gray-900 truncate">{resolvedStudentName || currentUser.displayName}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{resolvedStudentClass || currentUser.jobTitle || currentUser.role.replace('_', ' ')}</p>
             </div>
          </div>
          
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm font-bold rounded-xl transition-colors mb-1",
                isActive
                  ? "bg-blue-50 text-blue-600 shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )
            }
          >
            <User size={18} />
            My Profile
          </NavLink>

          <button 
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 overflow-y-auto relative h-full transition-all duration-300",
        sidebarOpen ? "lg:pl-72" : "lg:pl-0"
      )}>
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 py-3 px-4 lg:px-8 sticky top-0 z-10 flex justify-between items-center h-[64px] lg:h-[72px]">
          <div className="flex items-center gap-3 lg:gap-4">
             <button 
               onClick={() => setSidebarOpen(!sidebarOpen)}
               className="p-2 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 border border-gray-100 flex items-center justify-center transition-all cursor-pointer"
             >
                <Menu size={20} />
             </button>
             
             <div>
                <h2 className="text-sm lg:text-lg font-bold text-gray-900 leading-tight">
                  {getUnitName(currentUnit)}
                </h2>
                <p className="text-[10px] lg:text-[11px] font-medium text-gray-500">Beranda Portal Lumina</p>
             </div>

             {currentUser.role !== 'STUDENT' && currentUser.role !== 'kindergarten_subject_teacher' && !(currentUser.role === 'HEAD_UNIT' && currentUser.unitId === 'KINDERGARTEN') && (
                <div className="ml-4 pl-4 border-l border-gray-100">
                   <button 
                     onClick={() => setActiveUnit(null)}
                     className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-100 transition-all border border-blue-100 shadow-sm shadow-blue-50"
                   >
                      <RefreshCw size={14} />
                      Ganti Unit
                   </button>
                </div>
             )}
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 border-r border-gray-100 pr-6 mr-6 hidden md:flex">
               <NotificationBell />
               <button className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                  <Grid size={20} />
               </button>
            </div>
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold text-gray-900 leading-none mb-1">
                {new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
              </span>
              <span className="text-[10px] text-gray-300 font-bold tracking-widest uppercase">Semester {activeSemester} • {activeYear}</span>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          <Outlet context={{ 
            currentUser, 
            activeUnit: currentUnit, 
            selectedStudentId, 
            setSelectedStudentId,
            parentStudents
          }} />
        </div>
      </main>
    </div>
  );
}

function NavSectionLabel({ label }: { label: string }) {
  return (
    <div className="pt-4 pb-2 px-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">
      {label}
    </div>
  );
}

function NavItem({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 group",
          isActive
            ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
        )
      }
    >
      <div className="flex items-center gap-3">
        <span className={cn("transition-transform group-hover:scale-110", "duration-200")}>{icon}</span>
        <span>{label}</span>
      </div>
      {badge && (
        <span className={cn(
          "px-1.5 py-0.5 rounded-md text-[10px] font-black",
          "bg-red-500 text-white"
        )}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}
