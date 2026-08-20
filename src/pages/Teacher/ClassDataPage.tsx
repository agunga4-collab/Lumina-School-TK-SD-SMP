import React, { useState, useEffect } from "react";
import { 
  Users, Search, ArrowUpDown, Loader2, X, AlertCircle, Calendar, GraduationCap,
  Plus, Edit2, Trash2, Upload
} from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { 
  getClasses, getAllInvites, getTeachers,
  addClass, updateClass, deleteClass, addInvite, updateInvite
} from "../../lib/firebase";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, where, doc, setDoc, getDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { Class, RoleInvite, User, ClassTeacherAssignment } from "../../types";
import { isTeacherAssignedToClass } from "../../services/classTeacherAssignmentService";
import { toast } from "sonner";

export default function ClassDataPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  if (profile?.role === 'kindergarten_subject_teacher') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-red-600">Akses Ditolak</h1>
        <p className="text-gray-500 mt-2">Anda tidak memiliki izin untuk membuka halaman ini.</p>
      </div>
    );
  }

  // Active unit from useOutletContext (layout context) or user profile/unitId fallback
  const outletCtx = useOutletContext<{ activeUnit?: string }>() || {};
  const activeUnit = outletCtx.activeUnit || profile?.currentUnit || profile?.unitId || "JUNIOR_HIGH";

  // Data State
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [invites, setInvites] = useState<(RoleInvite & { id: string })[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Administrative privilege check
  const canManage = (profile?.role === 'HEAD_UNIT' && activeUnit === 'KINDERGARTEN') || profile?.role === 'SUPER_ADMIN';

  // Class Form States
  const [isClassFormOpen, setIsClassFormOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classFormGrade, setClassFormGrade] = useState("Pra TK");
  const [classFormClassName, setClassFormClassName] = useState("");
  const [classFormHomeroom, setClassFormHomeroom] = useState("");
  const [classFormGpkIds, setClassFormGpkIds] = useState<string[]>([]);
  const [classFormSignature, setClassFormSignature] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Student Form States
  const [isStudentFormOpen, setIsStudentFormOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentFormName, setStudentFormName] = useState("");
  const [studentFormLuminaId, setStudentFormLuminaId] = useState("");
  const [studentFormNisn, setStudentFormNisn] = useState("");
  const [studentFormNickname, setStudentFormNickname] = useState("");
  const [studentFormGender, setStudentFormGender] = useState("L");
  const [studentFormEmail, setStudentFormEmail] = useState("");
  const [studentFormParentEmail, setStudentFormParentEmail] = useState("");
  const [studentFormParentName, setStudentFormParentName] = useState("");

  // Sorting State for Classes
  const [classSortField, setClassSortField] = useState<"name" | "studentsCount" | "grade" | "homeroom" | "gpk">("name");
  const [classSortDirection, setClassSortDirection] = useState<"asc" | "desc">("asc");

  // Selected Class & Roster Modal State
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [studentSortField, setStudentSortField] = useState<"name" | "nis" | "nisn" | "gender" | "email">("name");
  const [studentSortDirection, setStudentSortDirection] = useState<"asc" | "desc">("asc");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  // This acts as our "cache key" and reset trigger. When unit/year changes:
  // 1. Clear previous class lists.
  // 2. Close active student modal/drawers.
  // 3. Reset search filters and sort settings.
  // 4. Force state to loading (never show old data while loading new unit).
  useEffect(() => {
    setClasses([]);
    setSelectedClass(null);
    setStudentSearchQuery("");
    setClassSortField("name");
    setClassSortDirection("asc");
    setStudentSortField("name");
    setStudentSortDirection("asc");
    setLoading(true);
  }, [activeUnit, activeYear]);

  useEffect(() => {
    async function loadData() {
      if (!profile || !activeYear || !activeUnit) return;
      try {
        // Query class data at server/backend level with strict filters (unitId AND academicYear)
        let fetchedClasses: Class[] = [];
        try {
          const qCompound = query(
            collection(db, "classes"),
            where("unitId", "==", activeUnit),
            where("academicYear", "==", activeYear)
          );
          const snap = await getDocs(qCompound);
          fetchedClasses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
        } catch (err) {
          console.warn("Compound query failed (possibly missing index), falling back to client-side filtering:", err);
          try {
            // Fallback 1: Filter by unitId on firestore
            const qUnit = query(collection(db, "classes"), where("unitId", "==", activeUnit));
            const snap = await getDocs(qUnit);
            fetchedClasses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
          } catch (err2) {
            console.error("Unit query fallback failed, retrieving all:", err2);
            // Fallback 2: Retrieve all classes
            fetchedClasses = await getClasses();
          }
        }

        const [tchs, invs] = await Promise.all([
          getTeachers(),
          getAllInvites()
        ]);

        setClasses(fetchedClasses || []);
        setTeachers(tchs || []);
        setInvites((invs || []).filter(i => i.role === "STUDENT") as any);

        // Fetch enrollments for the active academic year to optimize
        try {
          const enrollsSnap = await getDocs(
            query(collection(db, "enrollments"), where("academicYear", "==", activeYear))
          );
          setAllEnrollments(enrollsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.warn("Failed to load enrollments from Firestore:", err);
        }
      } catch (err) {
        console.error("Error loading Class Data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [profile, activeYear, activeUnit, refreshTrigger]);

  // Keep modal view updated when database changes
  useEffect(() => {
    if (selectedClass) {
      const updated = classes.find(c => c.id === selectedClass.id);
      if (updated) {
        setSelectedClass(updated);
      }
    }
  }, [classes]);

  // Translate unit ID to full name for the badge
  const getUnitName = (unit: string) => {
    switch (unit) {
      case "KINDERGARTEN": return "Lumina Kindergarten";
      case "ELEMENTARY": return "Lumina Elementary";
      case "JUNIOR_HIGH": return "Lumina Junior High";
      default: return "Lumina Academy";
    }
  };

  const getUnitColor = (unit: string) => {
    switch (unit) {
      case "KINDERGARTEN": return "text-emerald-700 bg-emerald-50 border-emerald-100";
      case "ELEMENTARY": return "text-emerald-600 bg-emerald-50 border-emerald-100";
      case "JUNIOR_HIGH": return "text-blue-600 bg-blue-50 border-blue-100";
      default: return "text-gray-600 bg-gray-50 border-gray-100";
    }
  };

  // --- CLASS ACTIONS ---
  const handleOpenAddClass = () => {
    setEditingClassId(null);
    setClassFormGrade("Pra TK");
    setClassFormClassName("");
    setClassFormHomeroom("");
    setClassFormGpkIds([]);
    setClassFormSignature("");
    setIsClassFormOpen(true);
  };

  const handleOpenEditClass = (cls: Class) => {
    setEditingClassId(cls.id);
    setClassFormGrade(cls.grade || "Pra TK");
    // Extract name without grade prefix
    const gradePrefix = cls.grade || "";
    const extractedName = cls.name.replace(gradePrefix, "").trim();
    setClassFormClassName(extractedName);
    setClassFormHomeroom(cls.homeroomTeacherId || "");
    const gpkIds = (cls.teacherAssignments || [])
      .filter(a => a.role === "GPK")
      .map(a => a.userId);
    setClassFormGpkIds(gpkIds);
    setClassFormSignature(cls.teacherSignatureUrl || "");
    setIsClassFormOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classFormClassName.trim()) {
      toast.error("Nama kelas tidak boleh kosong");
      return;
    }
    if (!classFormHomeroom) {
      toast.error("Wali kelas wajib dipilih");
      return;
    }

    setFormSaving(true);
    try {
      const fullClassName = `${classFormGrade} ${classFormClassName.trim()}`;
      
      const hrTeacher = teachers.find(t => t.uid === classFormHomeroom);
      if (!hrTeacher) {
        toast.error("Guru wali kelas tidak valid");
        setFormSaving(false);
        return;
      }

      // Compile assignments list
      const assignments: ClassTeacherAssignment[] = [];
      
      // Homeroom assignment
      assignments.push({
        userId: hrTeacher.uid,
        displayName: hrTeacher.displayName || hrTeacher.name || "Guru",
        email: hrTeacher.email || null,
        role: "HOMEROOM_TEACHER",
        unitId: activeUnit,
        isPrimary: true,
        assignedAt: Date.now(),
        assignedBy: profile?.uid || "ADMIN"
      });

      // GPK assignments
      classFormGpkIds.forEach(gpkId => {
        const gpkTeacher = teachers.find(t => t.uid === gpkId);
        if (gpkTeacher) {
          assignments.push({
            userId: gpkTeacher.uid,
            displayName: gpkTeacher.displayName || gpkTeacher.name || "Guru GPK",
            email: gpkTeacher.email || null,
            role: "GPK",
            unitId: activeUnit,
            isPrimary: false,
            assignedAt: Date.now(),
            assignedBy: profile?.uid || "ADMIN"
          });
        }
      });

      const classData = {
        name: fullClassName,
        grade: classFormGrade,
        unitId: activeUnit,
        academicYear: activeYear || "2026/2027",
        homeroomTeacherId: hrTeacher.uid,
        homeroomTeacherName: (hrTeacher.displayName || hrTeacher.name || "Guru").replace(/^\s*\(UNDANGAN\)\s*/i, ""),
        teacherSignatureUrl: classFormSignature || null,
        status: "active" as const,
        teacherAssignments: assignments
      };

      if (editingClassId) {
        await updateClass(editingClassId, classData);
        toast.success("Kelas berhasil diperbarui");
      } else {
        await addClass(classData);
        toast.success("Kelas baru berhasil ditambahkan");
      }

      setIsClassFormOpen(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error("Failed to save class:", err);
      toast.error(`Gagal menyimpan kelas: ${err.message || err}`);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteClassClick = async (classId: string, className: string) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus kelas ${className}? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        await deleteClass(classId);
        toast.success(`Kelas ${className} berhasil dihapus`);
        setRefreshTrigger(prev => prev + 1);
      } catch (err: any) {
        console.error("Gagal menghapus kelas:", err);
        toast.error(`Gagal menghapus kelas: ${err.message || err}`);
      }
    }
  };

  // --- STUDENT ACTIONS ---
  const handleOpenAddStudent = () => {
    setEditingStudentId(null);
    setStudentFormName("");
    setStudentFormLuminaId("");
    setStudentFormNisn("");
    setStudentFormNickname("");
    setStudentFormGender("L");
    setStudentFormEmail("");
    setStudentFormParentEmail("");
    setStudentFormParentName("");
    setIsStudentFormOpen(true);
  };

  const handleOpenEditStudent = async (studentInvite: any) => {
    setEditingStudentId(studentInvite.id);
    setStudentFormName(studentInvite.name || "");
    setStudentFormLuminaId(studentInvite.luminaId || "");
    setStudentFormEmail(studentInvite.email || "");
    
    // Fetch detailed fields from 'students' master collection
    if (studentInvite.luminaId) {
      try {
        const snap = await getDoc(doc(db, "students", studentInvite.luminaId));
        if (snap.exists()) {
          const detail = snap.data();
          setStudentFormNisn(detail.nisn || "");
          setStudentFormNickname(detail.nickname || "");
          setStudentFormGender(detail.gender || "L");
          setStudentFormParentEmail(detail.parentEmail || "");
          setStudentFormParentName(detail.parentName || "");
        } else {
          setStudentFormNisn("");
          setStudentFormNickname("");
          setStudentFormGender("L");
          setStudentFormParentEmail("");
          setStudentFormParentName("");
        }
      } catch (err) {
        console.warn("Failed to load student details:", err);
      }
    } else {
      setStudentFormNisn("");
      setStudentFormNickname("");
      setStudentFormGender("L");
      setStudentFormParentEmail("");
      setStudentFormParentName("");
    }
    setIsStudentFormOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;
    if (!studentFormName.trim()) {
      toast.error("Nama siswa tidak boleh kosong");
      return;
    }
    if (!studentFormLuminaId.trim()) {
      toast.error("Lumina ID / NIS wajib diisi");
      return;
    }

    setFormSaving(true);
    try {
      const batch = writeBatch(db);
      
      // Determine invite id
      let finalInviteId = editingStudentId;
      if (!editingStudentId) {
        // Double check uniqueness of Lumina ID
        const testSnap = await getDoc(doc(db, "students", studentFormLuminaId.trim()));
        if (testSnap.exists() && !editingStudentId) {
          toast.error("Lumina ID / NIS ini sudah terdaftar di sistem");
          setFormSaving(false);
          return;
        }

        const studentInviteData = {
          name: studentFormName.trim(),
          email: studentFormEmail.trim() || null,
          role: "STUDENT" as const,
          unitId: "KINDERGARTEN" as const,
          academicYear: selectedClass.academicYear,
          classId: selectedClass.id,
          status: "ready" as const,
          luminaId: studentFormLuminaId.trim()
        };
        finalInviteId = await addInvite(studentInviteData);
      } else {
        // Update existing invite
        const studentInviteData = {
          name: studentFormName.trim(),
          email: studentFormEmail.trim() || null,
          luminaId: studentFormLuminaId.trim()
        };
        await updateInvite(editingStudentId, studentInviteData);
      }

      // Write to 'students' master collection
      const studentRef = doc(db, "students", studentFormLuminaId.trim());
      batch.set(studentRef, {
        id: studentFormLuminaId.trim(),
        luminaId: studentFormLuminaId.trim(),
        name: studentFormName.trim(),
        email: studentFormEmail.trim() || "",
        classId: selectedClass.id,
        unitId: "KINDERGARTEN" as const,
        academicYear: selectedClass.academicYear,
        nisn: studentFormNisn.trim() || "",
        nickname: studentFormNickname.trim() || "",
        gender: studentFormGender,
        parentEmail: studentFormParentEmail.trim() || "",
        parentName: studentFormParentName.trim() || "",
        status: "active",
        updatedAt: Date.now(),
        createdAt: Date.now()
      }, { merge: true });

      // Write 'enrollments' record
      const enrollmentId = `${studentFormLuminaId.trim()}_${selectedClass.academicYear.replace(/\//g, "-")}`;
      const enrollmentRef = doc(db, "enrollments", enrollmentId);
      batch.set(enrollmentRef, {
        id: enrollmentId,
        studentId: studentFormLuminaId.trim(),
        classId: selectedClass.id,
        unitId: "KINDERGARTEN" as const,
        academicYear: selectedClass.academicYear,
        status: "active",
        updatedAt: Date.now()
      }, { merge: true });

      // Handle Parent Invite
      if (studentFormParentEmail.trim()) {
        const parentEmailLower = studentFormParentEmail.trim().toLowerCase();
        
        // Find existing Parent Invite
        const existingInvites = await getAllInvites();
        const existingParent = existingInvites.find(
          i => i.email.toLowerCase() === parentEmailLower && i.role === "PARENT"
        );

        if (existingParent) {
          const currentLinks = existingParent.linkedStudents || [];
          if (!currentLinks.includes(studentFormLuminaId.trim())) {
            await updateInvite(existingParent.id, {
              linkedStudents: [...currentLinks, studentFormLuminaId.trim()]
            });
          }
        } else {
          const parentInvite = {
            name: studentFormParentName.trim() || `Orang Tua ${studentFormName.trim()}`,
            email: parentEmailLower,
            role: "PARENT" as const,
            unitId: "KINDERGARTEN" as const,
            status: "ready" as const,
            linkedStudents: [studentFormLuminaId.trim()]
          };
          await addInvite(parentInvite);
        }
      }

      await batch.commit();
      toast.success("Data siswa berhasil disimpan");
      setIsStudentFormOpen(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error("Gagal menyimpan siswa:", err);
      toast.error(`Gagal menyimpan data siswa: ${err.message || err}`);
    } finally {
      setFormSaving(false);
    }
  };

  const handleUnenrollStudentClick = async (studentInvite: any) => {
    if (!selectedClass) return;
    const confirmMsg = `Apakah Anda yakin ingin mengeluarkan ${studentInvite.name} dari roster kelas ${selectedClass.name}? Riwayat akademis di kelas ini akan dilepas.`;
    if (window.confirm(confirmMsg)) {
      try {
        const enrollmentId = `${studentInvite.luminaId}_${selectedClass.academicYear.replace(/\//g, "-")}`;
        await deleteDoc(doc(db, "enrollments", enrollmentId));
        toast.success(`Berhasil mengeluarkan ${studentInvite.name} dari kelas`);
        setRefreshTrigger(prev => prev + 1);
      } catch (err: any) {
        console.error("Gagal mengeluarkan siswa:", err);
        toast.error(`Gagal mengeluarkan siswa: ${err.message || err}`);
      }
    }
  };

  // Helper to find students of a specific class using same logic as Manajemen Kelas
  const getClassStudents = (cls: Class) => {
    return invites.filter((i) => {
      if (i.role !== "STUDENT") return false;
      
      // Check strict enrollment if they have a luminaId
      if (i.luminaId) {
        return allEnrollments.some(
          (e) =>
            e.studentId === i.luminaId &&
            (e.classId === cls.id || e.classId === cls.name) &&
            e.academicYear === cls.academicYear
        );
      }
      
      // Fallback
      const directClassMatch = i.classId === cls.id || i.classId === cls.name;
      const directYearMatch = !i.academicYear || i.academicYear === cls.academicYear;
      return directClassMatch && directYearMatch;
    });
  };

  // Apply filters: Unit & Active Year with extra frontend defensive checks
  const isUserAdmin = ["SUPER_ADMIN", "HEAD_UNIT", "HEAD_JUNIOR"].includes(profile?.role || "");
  
  const filteredClasses = classes.filter((cls) => {
    // DEFENSIVE EXTRA CHECK:
    const itemUnit = cls.unitId || (cls as any).unit || "";
    const itemYear = cls.academicYear || (cls as any).academicYearId || "";

    if (itemUnit !== activeUnit) return false;
    if (itemYear !== activeYear) return false;
    if (cls.status === "archived") return false;

    // Standard teachers only see assigned classes (homeroom or GPK)
    if (!isUserAdmin && profile?.uid) {
      return isTeacherAssignedToClass(cls, profile.uid);
    }
    return true;
  });

  // Sort classes
  const sortedClasses = [...filteredClasses].sort((a, b) => {
    let aVal: any = "";
    let bVal: any = "";

    if (classSortField === "name") {
      aVal = a.name || "";
      bVal = b.name || "";
    } else if (classSortField === "studentsCount") {
      aVal = getClassStudents(a).length;
      bVal = getClassStudents(b).length;
    } else if (classSortField === "grade") {
      aVal = a.grade || "";
      bVal = b.grade || "";
    } else if (classSortField === "homeroom") {
      aVal = a.homeroomTeacherName || "";
      bVal = b.homeroomTeacherName || "";
    } else if (classSortField === "gpk") {
      const aGpk = (a.teacherAssignments || []).filter(asg => asg.role === "GPK").map(asg => asg.displayName).join(", ");
      const bGpk = (b.teacherAssignments || []).filter(asg => asg.role === "GPK").map(asg => asg.displayName).join(", ");
      aVal = aGpk;
      bVal = bGpk;
    }

    if (typeof aVal === "string") {
      return classSortDirection === "asc"
        ? aVal.localeCompare(bVal, undefined, { numeric: true })
        : bVal.localeCompare(aVal, undefined, { numeric: true });
    } else {
      return classSortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }
  });

  // Render header sorting indicator
  const renderSortIndicator = (field: typeof classSortField) => {
    if (classSortField !== field) return <ArrowUpDown size={12} className="text-gray-300 group-hover:text-blue-500 ml-1 inline" />;
    return classSortDirection === "asc" 
      ? <span className="text-blue-600 ml-1">↑</span> 
      : <span className="text-blue-600 ml-1">↓</span>;
  };

  // Render modal student sorting indicator
  const renderStudentSortIndicator = (field: typeof studentSortField) => {
    if (studentSortField !== field) return <ArrowUpDown size={12} className="text-gray-300 group-hover:text-blue-500 ml-1 inline" />;
    return studentSortDirection === "asc"
      ? <span className="text-blue-600 ml-1">↑</span>
      : <span className="text-blue-600 ml-1">↓</span>;
  };

  const handleClassHeaderClick = (field: typeof classSortField) => {
    if (classSortField === field) {
      setClassSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setClassSortField(field);
      setClassSortDirection("asc");
    }
  };

  const handleStudentHeaderClick = (field: typeof studentSortField) => {
    if (studentSortField === field) {
      setStudentSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setStudentSortField(field);
      setStudentSortDirection("asc");
    }
  };

  return (
    <div id="class-data-page" className="w-full max-w-7xl mx-auto px-4 py-8 space-y-6">
      
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Data Kelas</h1>
          <p className="text-sm font-semibold text-gray-500 mt-1">
            Informasi kelas dan daftar siswa pada Tahun Ajaran Aktif.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              onClick={handleOpenAddClass}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-black uppercase tracking-widest shadow hover:shadow-md transition-all mr-2"
            >
              <Plus size={14} />
              Tambah Kelas
            </button>
          )}
          {/* Active Unit Badge */}
          <span className={`px-4 py-2 rounded-full border text-xs font-black uppercase tracking-widest shadow-sm ${getUnitColor(activeUnit)}`}>
            {getUnitName(activeUnit)}
          </span>
          {/* Read Only Academic Year Badge */}
          <span className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-blue-100 bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-widest shadow-sm">
            <Calendar size={13} />
            TA {activeYear}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat Data Kelas...</p>
        </div>
      ) : sortedClasses.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-gray-200 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center">
          <AlertCircle size={40} className="text-gray-400 mb-3" />
          <p className="text-sm font-black text-gray-500 uppercase tracking-wider">
            Belum ada kelas terdaftar untuk {getUnitName(activeUnit)} pada Tahun Ajaran Aktif {activeYear}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-3xl bg-white shadow-sm">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100 select-none">
                <th 
                  onClick={() => handleClassHeaderClick("name")}
                  className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                >
                  Unit / Nama Kelas {renderSortIndicator("name")}
                </th>
                <th 
                  onClick={() => handleClassHeaderClick("studentsCount")}
                  className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group text-center"
                >
                  Siswa {renderSortIndicator("studentsCount")}
                </th>
                <th 
                  onClick={() => handleClassHeaderClick("grade")}
                  className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group text-center"
                >
                  Grade {renderSortIndicator("grade")}
                </th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Tahun Ajaran
                </th>
                <th 
                  onClick={() => handleClassHeaderClick("homeroom")}
                  className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                >
                  Wali Kelas {renderSortIndicator("homeroom")}
                </th>
                <th 
                  onClick={() => handleClassHeaderClick("gpk")}
                  className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                >
                  GPK {renderSortIndicator("gpk")}
                </th>
                <th className="px-8 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedClasses.map((cls) => {
                const classStudents = getClassStudents(cls);
                const gpkAssignments = (cls.teacherAssignments || []).filter(a => a.role === "GPK");
                const resolvedGpk = gpkAssignments.length > 0 
                  ? gpkAssignments.map(a => a.displayName.replace(/^\s*\(UNDANGAN\)\s*/i, "")).join(", ")
                  : "-";

                return (
                  <tr key={cls.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5 text-sm font-extrabold text-slate-800">
                      {cls.name}
                    </td>
                    <td className="px-8 py-5 text-sm font-bold text-slate-700 text-center">
                      {classStudents.length} siswa
                    </td>
                    <td className="px-8 py-5 text-sm font-semibold text-slate-600 text-center">
                      Grade {cls.grade}
                    </td>
                    <td className="px-8 py-5 text-sm font-mono text-slate-500">
                      {cls.academicYear}
                    </td>
                    <td className="px-8 py-5 text-sm font-bold text-slate-700">
                      {cls.homeroomTeacherName ? cls.homeroomTeacherName.replace(/^\s*\(UNDANGAN\)\s*/i, "") : "-"}
                    </td>
                    <td className="px-8 py-5 text-sm font-semibold text-slate-700">
                      {resolvedGpk}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedClass(cls);
                            setStudentSearchQuery("");
                            setStudentSortField("name");
                            setStudentSortDirection("asc");
                          }}
                          className="px-4 py-1.5 bg-white border border-blue-100 hover:border-blue-200 text-blue-600 hover:text-blue-700 text-xs font-black uppercase tracking-wider rounded-xl shadow-sm hover:shadow transition-all"
                        >
                          Lihat Siswa
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => handleOpenEditClass(cls)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Edit Kelas"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteClassClick(cls.id, cls.name)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Hapus Kelas"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Roster Modal */}
      <AnimatePresence>
        {selectedClass && (() => {
          const classStudents = getClassStudents(selectedClass);
          
          // Apply Search
          const queryLower = studentSearchQuery.toLowerCase().trim();
          const searchedStudents = classStudents.filter((s) => {
            if (!queryLower) return true;
            return (
              (s.name || "").toLowerCase().includes(queryLower) ||
              (s.luminaId || "").toLowerCase().includes(queryLower) ||
              (s.nisn || "").toLowerCase().includes(queryLower) ||
              (s.email || "").toLowerCase().includes(queryLower)
            );
          });

          // Sort Students
          const sortedStudents = [...searchedStudents].sort((a, b) => {
            let aVal = "";
            let bVal = "";

            if (studentSortField === "name") {
              aVal = a.name || "";
              bVal = b.name || "";
            } else if (studentSortField === "nis") {
              aVal = a.luminaId || "";
              bVal = b.luminaId || "";
            } else if (studentSortField === "nisn") {
              aVal = a.nisn || "";
              bVal = b.nisn || "";
            } else if (studentSortField === "gender") {
              aVal = a.gender || "";
              bVal = b.gender || "";
            } else if (studentSortField === "email") {
              aVal = a.email || "";
              bVal = b.email || "";
            }

            // Put empty values always at the bottom
            if (!aVal && !bVal) return 0;
            if (!aVal) return 1;
            if (!bVal) return -1;

            return studentSortDirection === "asc"
              ? aVal.localeCompare(bVal, undefined, { numeric: true })
              : bVal.localeCompare(aVal, undefined, { numeric: true });
          });

          const gpkAssignments = (selectedClass.teacherAssignments || []).filter(a => a.role === "GPK");
          const resolvedGpk = gpkAssignments.length > 0 
            ? gpkAssignments.map(a => a.displayName.replace(/^\s*\(UNDANGAN\)\s*/i, "")).join(", ")
            : "-";

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedClass(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />

              {/* Modal Box */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2 }}
                className="relative w-full max-w-5xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100"
              >
                {/* Modal Header */}
                <div className="p-8 border-b border-gray-100 flex items-start justify-between bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <GraduationCap className="text-blue-600" size={20} />
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-full">
                        Daftar Siswa Terdaftar
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Kelas {selectedClass.name}</h2>
                    <p className="text-xs font-semibold text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Wali Kelas: <strong className="text-slate-700">{selectedClass.homeroomTeacherName ? selectedClass.homeroomTeacherName.replace(/^\s*\(UNDANGAN\)\s*/i, "") : "-"}</strong></span>
                      <span className="text-slate-300">•</span>
                      <span>GPK: <strong className="text-slate-700">{resolvedGpk}</strong></span>
                      <span className="text-slate-300">•</span>
                      <span>Tahun Ajaran: <strong className="text-slate-700">{selectedClass.academicYear}</strong></span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage && (
                      <button
                        onClick={handleOpenAddStudent}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow transition-all hover:shadow-md"
                      >
                        <Plus size={13} />
                        Tambah Siswa
                      </button>
                    )}
                    <button 
                      onClick={() => setSelectedClass(null)}
                      className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Modal Search Bar */}
                <div className="px-8 py-4 border-b border-gray-100 bg-white">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Cari nama, NIS, NISN, atau email..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-300 transition-colors bg-slate-50/50"
                    />
                  </div>
                </div>

                {/* Modal Content - Students Table */}
                <div className="flex-1 overflow-y-auto p-8 bg-white">
                  {sortedStudents.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 font-bold text-xs uppercase tracking-widest italic border border-dashed border-slate-200 rounded-3xl">
                      {classStudents.length === 0 
                        ? "Belum ada siswa terdaftar pada kelas ini."
                        : "Tidak ada siswa yang cocok dengan pencarian Anda."
                      }
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-100 select-none">
                            <th className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">
                              No
                            </th>
                            <th 
                              onClick={() => handleStudentHeaderClick("name")}
                              className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                            >
                              Nama Siswa {renderStudentSortIndicator("name")}
                            </th>
                            <th 
                              onClick={() => handleStudentHeaderClick("nis")}
                              className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                            >
                              NIS {renderStudentSortIndicator("nis")}
                            </th>
                            <th 
                              onClick={() => handleStudentHeaderClick("nisn")}
                              className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                            >
                              NISN {renderStudentSortIndicator("nisn")}
                            </th>
                            <th 
                              onClick={() => handleStudentHeaderClick("gender")}
                              className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                            >
                              Jenis Kelamin {renderStudentSortIndicator("gender")}
                            </th>
                            <th 
                              onClick={() => handleStudentHeaderClick("email")}
                              className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors group"
                            >
                              Email {renderStudentSortIndicator("email")}
                            </th>
                            {canManage && (
                              <th className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">
                                Aksi
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedStudents.map((s, index) => {
                            const genderVal = s.gender || "";
                            const genderLabel = genderVal.toUpperCase() === "L" || genderVal.toUpperCase() === "LAKI-LAKI" || genderVal.toUpperCase() === "LAKI_LAKI" 
                              ? "Laki-laki" 
                              : genderVal.toUpperCase() === "P" || genderVal.toUpperCase() === "PEREMPUAN" 
                                ? "Perempuan" 
                                : "-";

                            return (
                              <tr key={s.id} className="hover:bg-slate-50/30 transition-colors">
                                <td className="px-6 py-3 text-xs font-bold text-slate-400 text-center">
                                  {index + 1}
                                </td>
                                <td className="px-6 py-3 text-xs font-extrabold text-slate-800 uppercase">
                                  {s.name}
                                </td>
                                <td className="px-6 py-3 text-xs font-mono text-slate-500">
                                  {s.luminaId || "-"}
                                </td>
                                <td className="px-6 py-3 text-xs font-mono text-slate-500">
                                  {s.nisn || "-"}
                                </td>
                                <td className="px-6 py-3 text-xs font-semibold text-slate-600">
                                  {genderLabel}
                                </td>
                                <td className="px-6 py-3 text-xs text-slate-600">
                                  {s.email || "-"}
                                </td>
                                {canManage && (
                                  <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        onClick={() => handleOpenEditStudent(s)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Edit Siswa"
                                      >
                                        <Edit2 size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleUnenrollStudentClick(s)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                        title="Keluarkan dari Kelas"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-6 border-t border-gray-100 bg-slate-50/50 flex justify-end">
                  <button
                    onClick={() => setSelectedClass(null)}
                    className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-sm"
                  >
                    Tutup
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Class Form Modal */}
      <AnimatePresence>
        {isClassFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsClassFormOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-gray-100 max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  {editingClassId ? "Edit Kelas" : "Tambah Kelas Baru"}
                </h3>
                <button 
                  onClick={() => setIsClassFormOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveClass} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Grade & Nama Kelas
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <select
                      value={classFormGrade}
                      onChange={(e) => setClassFormGrade(e.target.value)}
                      className="col-span-1 px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Pra TK">Pra TK</option>
                      <option value="TK A">TK A</option>
                      <option value="TK B">TK B</option>
                    </select>
                    <input
                      type="text"
                      placeholder="e.g. Bunaken, Wakatobi"
                      value={classFormClassName}
                      onChange={(e) => setClassFormClassName(e.target.value)}
                      className="col-span-2 px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Wali Kelas
                  </label>
                  <select
                    value={classFormHomeroom}
                    onChange={(e) => setClassFormHomeroom(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">-- Pilih Wali Kelas --</option>
                    {teachers.map(t => (
                      <option key={t.uid} value={t.uid}>{t.displayName || t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Pilih Guru Pendamping Kelas (GPK)
                  </label>
                  <div className="border border-slate-100 rounded-2xl p-3 bg-slate-50/50 max-h-40 overflow-y-auto space-y-2">
                    {teachers.map(t => {
                      const isChecked = classFormGpkIds.includes(t.uid);
                      return (
                        <label key={t.uid} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setClassFormGpkIds(prev => [...prev, t.uid]);
                              } else {
                                setClassFormGpkIds(prev => prev.filter(id => id !== t.uid));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-slate-200 rounded focus:ring-blue-500"
                          />
                          <span className="text-xs font-semibold text-slate-700">{t.displayName || t.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Tanda Tangan Wali Kelas
                  </label>
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50 flex flex-col items-center justify-center space-y-2">
                    {classFormSignature ? (
                      <div className="relative">
                        <img 
                          src={classFormSignature} 
                          alt="Signature Preview" 
                          className="h-16 object-contain border border-slate-100 rounded bg-white p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setClassFormSignature("")}
                          className="absolute -top-2 -right-2 p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-full transition-all"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="text-slate-400 w-8 h-8" />
                        <span className="text-xs font-semibold text-slate-500">Unggah Tanda Tangan (PNG/JPG)</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === "string") {
                              setClassFormSignature(reader.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                      id="signature-file-input"
                    />
                    <label
                      htmlFor="signature-file-input"
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-700 cursor-pointer select-none transition-all shadow-sm"
                    >
                      Pilih File
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsClassFormOpen(false)}
                    className="px-5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                  >
                    {formSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Simpan Kelas
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Student Form Modal */}
      <AnimatePresence>
        {isStudentFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStudentFormOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-xl bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col border border-gray-100 max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  {editingStudentId ? "Edit Roster Siswa" : "Tambah Siswa ke Roster"}
                </h3>
                <button 
                  onClick={() => setIsStudentFormOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveStudent} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Lumina ID / NIS
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 23240101"
                      value={studentFormLuminaId}
                      onChange={(e) => setStudentFormLuminaId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                      required
                      disabled={!!editingStudentId}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      NISN (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 0123456789"
                      value={studentFormNisn}
                      onChange={(e) => setStudentFormNisn(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Nama Lengkap
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Budi Santoso"
                      value={studentFormName}
                      onChange={(e) => setStudentFormName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Nama Panggilan
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Budi"
                      value={studentFormNickname}
                      onChange={(e) => setStudentFormNickname(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Jenis Kelamin
                    </label>
                    <select
                      value={studentFormGender}
                      onChange={(e) => setStudentFormGender(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:border-blue-500"
                    >
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Email Siswa (Opsional)
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. student@school.id"
                      value={studentFormEmail}
                      onChange={(e) => setStudentFormEmail(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div className="col-span-2">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-1">
                      Koneksi Orang Tua / Wali
                    </h4>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Nama Orang Tua / Wali
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ayah Budi"
                      value={studentFormParentName}
                      onChange={(e) => setStudentFormParentName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Email Orang Tua (Wajib Link)
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. parent@mail.com"
                      value={studentFormParentEmail}
                      onChange={(e) => setStudentFormParentEmail(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStudentFormOpen(false)}
                    className="px-5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold rounded-xl transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formSaving}
                    className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
                  >
                    {formSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Simpan Roster
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
