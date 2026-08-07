import React, { useState, useEffect } from "react";
import { 
  Users, Search, ArrowUpDown, Loader2, X, AlertCircle, Calendar, GraduationCap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getClasses, getAllInvites, getTeachers } from "../../lib/firebase";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Class, RoleInvite, User } from "../../types";
import { isTeacherAssignedToClass } from "../../services/classTeacherAssignmentService";

export default function ClassDataPage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  // Active unit from user profile / active unit state
  // Let's determine active unit based on activeUnit or profile's unitId
  const activeUnit = profile?.currentUnit || profile?.unitId || "JUNIOR_HIGH";

  // Data State
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [invites, setInvites] = useState<(RoleInvite & { id: string })[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Sorting State for Classes
  const [classSortField, setClassSortField] = useState<"name" | "studentsCount" | "grade" | "homeroom" | "gpk">("name");
  const [classSortDirection, setClassSortDirection] = useState<"asc" | "desc">("asc");

  // Selected Class & Roster Modal State
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [studentSortField, setStudentSortField] = useState<"name" | "nis" | "nisn" | "gender" | "email">("name");
  const [studentSortDirection, setStudentSortDirection] = useState<"asc" | "desc">("asc");
  const [studentSearchQuery, setStudentSearchQuery] = useState("");

  useEffect(() => {
    async function loadData() {
      if (!profile || !activeYear) return;
      setLoading(true);
      try {
        const [allCls, tchs, invs] = await Promise.all([
          getClasses(),
          getTeachers(),
          getAllInvites()
        ]);

        setClasses(allCls || []);
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
  }, [profile, activeYear]);

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

  // Apply filters: Unit & Active Year
  const isUserAdmin = ["SUPER_ADMIN", "HEAD_UNIT", "HEAD_JUNIOR"].includes(profile?.role || "");
  
  const filteredClasses = classes.filter((cls) => {
    // Must match active unit
    if (cls.unitId !== activeUnit) return false;
    // Must match active year
    if (cls.academicYear !== activeYear) return false;
    // Must not be archived
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
                    <td className="px-8 py-5 text-right">
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
                  <button 
                    onClick={() => setSelectedClass(null)}
                    className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
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
    </div>
  );
}
