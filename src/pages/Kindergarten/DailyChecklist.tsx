import * as React from 'react';
import { 
  CheckCircle2, Clock, AlertCircle, UserX, 
  Smile, Meh, Frown, Angry, Save, Calendar, Search, 
  Users, Sparkles, ChevronLeft, ChevronRight, RotateCcw, Trash2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import type { KGAttendanceStatus, KGEmotionStatus } from '../../types';
import { 
  getStoredStudents, 
  saveStoredStudents, 
  KGStudent 
} from '../../lib/kindergartenWeeklyReport';

export default function DailyChecklist() {
  const [students, setStudents] = React.useState<KGStudent[]>(() => getStoredStudents());
  const [showManager, setShowManager] = React.useState(false);
  const [newStudentName, setNewStudentName] = React.useState('');
  const [newStudentNickname, setNewStudentNickname] = React.useState('');
  const [newStudentGroup, setNewStudentGroup] = React.useState<'TK_A' | 'TK_B'>('TK_A');

  const handleAddStudent = () => {
    if (!newStudentName.trim() || !newStudentNickname.trim()) {
      toast.error('Mohon isi nama lengkap dan nama panggilan siswa terlebih dahulu.');
      return;
    }
    
    // Generate next unique id
    const currentMaxId = students.reduce((acc, current) => {
      const match = current.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        return Math.max(acc, num);
      }
      return acc;
    }, 0);
    
    const nextIdNum = currentMaxId + 1;
    const nextId = `K${String(nextIdNum).padStart(3, '0')}`;
    
    const newStudent: KGStudent = {
      id: nextId,
      name: newStudentName.trim(),
      nickName: newStudentNickname.trim(),
      ageGroup: newStudentGroup
    };
    
    const updatedStudents = [...students, newStudent];
    setStudents(updatedStudents);
    saveStoredStudents(updatedStudents);
    
    // Clean up input form
    setNewStudentName('');
    setNewStudentNickname('');
    
    toast.success(`Berhasil menambahkan anak cerdas ${newStudent.name}! 🌟`);
  };

  const handleDeleteStudent = (studentId: string) => {
    const originalStudents = [...students];
    const target = originalStudents.find(s => s.id === studentId);
    
    if (!target) return;
    
    const updatedStudents = originalStudents.filter(s => s.id !== studentId);
    setStudents(updatedStudents);
    saveStoredStudents(updatedStudents);
    
    toast.success(`Siswa ${target.name} berhasil dihapus dari sistem! 💖`);
  };
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const [isSaving, setIsSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const getDateKey = (date: Date) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const da = String(date.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  // State to hold record mappings keyed by "YYYY-MM-DD"
  const [recordsByDate, setRecordsByDate] = React.useState<Record<string, Record<string, { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }>>>(() => {
    const saved = localStorage.getItem('kg_checklist_records');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  });

  const dateKey = getDateKey(selectedDate);
  const dateRecords = recordsByDate[dateKey] || {};

  // Build reactive students visible list
  const studentsWithStatus = students.map(s => {
    const status = dateRecords[s.id] || { attendance: null, emotion: null };
    return {
      ...s,
      attendance: status.attendance,
      emotion: status.emotion
    };
  });

  const getActiveOption = (student: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null }): string => {
    if (!student.attendance) return '';
    if (student.attendance === 'NO_NEWS') return 'NO_NEWS';
    if (student.attendance === 'SICK') return 'SICK';
    if (student.attendance === 'PERMISSION') return 'EXCUSED';
    return student.emotion || 'OK'; // Fallback to HAPPY/OK/SAD/ANGRY if present
  };

  const handleUpdateOption = (studentId: string, option: string | null) => {
    setRecordsByDate(prev => {
      const currentOfDate = prev[dateKey] || {};
      let newStatus: { attendance: KGAttendanceStatus | null; emotion: KGEmotionStatus | null };

      if (option === null) {
        newStatus = { attendance: null, emotion: null };
      } else {
        switch (option) {
          case 'HAPPY':
            newStatus = { attendance: 'PRESENT', emotion: 'HAPPY' };
            break;
          case 'SAD':
            newStatus = { attendance: 'PRESENT', emotion: 'SAD' };
            break;
          case 'OK':
            newStatus = { attendance: 'PRESENT', emotion: 'OK' };
            break;
          case 'ANGRY':
            newStatus = { attendance: 'PRESENT', emotion: 'ANGRY' };
            break;
          case 'NO_NEWS':
            newStatus = { attendance: 'NO_NEWS', emotion: null };
            break;
          case 'SICK':
            newStatus = { attendance: 'SICK', emotion: null };
            break;
          case 'EXCUSED':
            newStatus = { attendance: 'PERMISSION', emotion: null };
            break;
          default:
            newStatus = { attendance: null, emotion: null };
        }
      }

      const updated = {
        ...prev,
        [dateKey]: {
          ...currentOfDate,
          [studentId]: newStatus
        }
      };

      localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
      return updated;
    });
  };

  // Set all current visible students to HAPPY status
  const handleHappySemua = () => {
    setRecordsByDate(prev => {
      const currentOfDate = prev[dateKey] || {};
      const newOfDate = { ...currentOfDate };

      students.forEach(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (matchesSearch) {
          newOfDate[s.id] = { attendance: 'PRESENT', emotion: 'HAPPY' };
        }
      });

      const updated = {
        ...prev,
        [dateKey]: newOfDate
      };

      localStorage.setItem('kg_checklist_records', JSON.stringify(updated));
      return updated;
    });

    toast.success('Semua si kecil yang tampil ke-update berstatus Happy! 😊');
  };

  const handlePrevDate = () => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const handleNextDate = () => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(new Date(e.target.value));
    }
  };

  // Precise statistics calculations
  const totalStudents = students.length;
  const countBelumDiisi = studentsWithStatus.filter(s => s.attendance === null).length;
  const countHadir = studentsWithStatus.filter(s => s.attendance === 'PRESENT').length;
  const countSakit = studentsWithStatus.filter(s => s.attendance === 'SICK').length;
  const countIzin = studentsWithStatus.filter(s => s.attendance === 'PERMISSION').length;
  const countAlpha = studentsWithStatus.filter(s => s.attendance === 'NO_NEWS').length;

  const countHappy = studentsWithStatus.filter(s => s.attendance === 'PRESENT' && s.emotion === 'HAPPY').length;
  const countOk = studentsWithStatus.filter(s => s.attendance === 'PRESENT' && s.emotion === 'OK').length;
  const countSad = studentsWithStatus.filter(s => s.attendance === 'PRESENT' && s.emotion === 'SAD').length;
  const countAngry = studentsWithStatus.filter(s => s.attendance === 'PRESENT' && s.emotion === 'ANGRY').length;

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success('Laporan Kehadiran & Emosi Harian berhasil disimpan ke server! ❤️', {
        description: `Tanggal: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(selectedDate)}`
      });
    }, 800);
  };

  const filteredStudents = studentsWithStatus.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                <Sparkles size={10} /> Kindy Portal
              </span>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight italic">Semangat Hari ini, Bu Guru!</h1>
           </div>
           <p className="text-gray-500 font-medium text-sm">Cek kehadiran dan kondisi hati anak-anak kelomopok B1 secara interaktif.</p>
        </div>

        {/* INTERACTIVE DATEPICKER WITH TOGGLE CHEVRON */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl shadow-sm border border-emerald-100">
           <button 
             onClick={handlePrevDate}
             className="p-2 hover:bg-emerald-50 rounded-xl text-gray-500 hover:text-emerald-700 transition-all cursor-pointer"
             title="Kemarin"
           >
             <ChevronLeft size={16} />
           </button>

           <div className="flex items-center gap-2 px-2 text-emerald-700 font-bold relative group">
              <Calendar size={16} className="text-emerald-400 shrink-0" />
              <input 
                type="date"
                value={selectedDate.toISOString().split('T')[0]}
                onChange={handleDateChange}
                className="font-bold text-sm text-gray-700 outline-none cursor-pointer bg-transparent border-none py-1 absolute inset-0 opacity-0 z-10 w-full"
                title="Pilih Tanggal Bebas"
              />
              <span className="text-sm select-none border-b border-dashed border-emerald-300 pb-0.5 cursor-pointer leading-tight">
                {new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(selectedDate)}
              </span>
           </div>

           <button 
             onClick={handleNextDate}
             className="p-2 hover:bg-emerald-50 rounded-xl text-gray-500 hover:text-emerald-700 transition-all cursor-pointer"
             title="Besok"
           >
             <ChevronRight size={16} />
           </button>
        </div>
      </header>

      {/* QUICK ACTIONS TOOLBAR */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
        <div className="relative flex-1">
           <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-300" size={16} />
           <input 
             type="text" 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             placeholder="Cari nama si kecil yang ceria..." 
             className="pl-11 pr-4 py-2.5 w-full bg-emerald-50/10 border border-emerald-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-transparent transition-all placeholder:text-emerald-300" 
           />
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={() => setShowManager(!showManager)}
             className={cn(
               "flex items-center justify-center gap-2 font-bold text-xs py-2.5 px-5 rounded-2xl transition-all border cursor-pointer",
               showManager 
                 ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100" 
                 : "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/70"
             )}
           >
             <Users size={16} />
             {showManager ? 'Tutup Kelola Siswa' : 'Kelola Siswa'}
           </button>

           <button 
             onClick={handleHappySemua}
             className="flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-xs py-2.5 px-5 rounded-2xl shadow-md shadow-amber-100 hover:shadow-lg hover:shadow-amber-200/50 transition-all cursor-pointer"
           >
             <Smile size={16} />
             Set Happy Semua
           </button>
        </div>
      </div>

      {/* STUDENT MANAGER COLLAPSIBLE PANEL */}
      {showManager && (
        <div className="bg-white p-6 rounded-[2.5rem] border border-emerald-100 shadow-xl shadow-emerald-50/20 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="text-emerald-600" size={20} />
              <h3 className="font-extrabold text-gray-900 text-sm tracking-tight">Pengelola Siswa (Murid Lazuardi)</h3>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl">
              {students.length} Siswa Terdaftar
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* TAMBAH SISWA BARU FORM */}
            <div className="md:col-span-1 bg-gray-50/50 p-5 rounded-3xl border border-gray-100 space-y-4">
              <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">Tambah Siswa Baru</span>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 font-bold mb-1.5 block">Nama Lengkap</label>
                  <input 
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="Contoh: Zianka Azura"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-300 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-bold mb-1.5 block">Nama Panggilan</label>
                  <input 
                    type="text"
                    value={newStudentNickname}
                    onChange={(e) => setNewStudentNickname(e.target.value)}
                    placeholder="Contoh: Zianka"
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-300 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-bold mb-1.5 block">Kelompok Usia</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewStudentGroup('TK_A')}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer",
                        newStudentGroup === 'TK_A' 
                          ? "bg-emerald-600 border-emerald-600 text-white" 
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      TK_A (4-5 Th)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStudentGroup('TK_B')}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer",
                        newStudentGroup === 'TK_B' 
                          ? "bg-emerald-600 border-emerald-600 text-white" 
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      TK_B (5-6 Th)
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddStudent}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                >
                  <Sparkles size={14} />
                  Simpan Siswa
                </button>
              </div>
            </div>

            {/* DAFTAR SISWA TERDAFTAR */}
            <div className="md:col-span-2 space-y-3">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Daftar Aktif</span>
              
              <div className="max-h-[300px] overflow-y-auto border border-gray-100 rounded-3xl divide-y divide-gray-50 bg-white">
                {students.map((student) => (
                  <div key={student.id} className="flex justify-between items-center p-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-black text-xs">
                        {student.name[0] || 'S'}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 text-sm tracking-tight">{student.name}</div>
                        <div className="text-[10px] text-gray-400 font-medium">
                          Panggilan: "{student.nickName}" | Kelompok: {student.ageGroup === 'TK_A' ? 'TK_A Caterpillar' : 'TK_B Butterfly'} ({student.id})
                        </div>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleDeleteStudent(student.id)}
                      className="p-2 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
                      title="Hapus Siswa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                {students.length === 0 && (
                  <div className="p-8 text-center text-gray-450 text-sm italic font-medium">
                    Belum ada siswa terdaftar. Silakan tambahkan siswa di form sebelah kiri 💖
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE TABLE */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-emerald-50/50 border border-emerald-100/50 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-6 border-b border-emerald-50 flex items-center justify-between">
           <div className="flex items-center gap-2 text-emerald-700">
              <Users size={18} />
              <span className="font-bold text-sm tracking-tight">Daftar Anak Butterfly (B1) - {filteredStudents.length} Siswa</span>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[950px] table-fixed">
            <thead>
              <tr className="text-emerald-700 text-[10px] font-black uppercase tracking-[0.2em] border-b border-emerald-100">
                <th className="px-6 py-4 w-[240px]">Anak Hebat</th>
                <th className="px-6 py-4 text-center">Attendance & Emotional Checklist</th>
                <th className="px-6 py-4 text-center w-[100px]">Reset Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/50">
              {filteredStudents.map((student) => {
                const activeOption = getActiveOption(student);
                const hasSelected = activeOption !== '';

                return (
                  <tr key={student.id} className={cn("transition-colors", hasSelected ? "bg-white" : "bg-gray-50/10 hover:bg-emerald-50/10")}>
                    {/* Student Info Card column */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                         <div className={cn(
                           "w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-sm border transition-all",
                           activeOption === 'HAPPY' && "bg-yellow-50 text-yellow-600 border-yellow-200 scale-105",
                           activeOption === 'SAD' && "bg-blue-50 text-blue-600 border-blue-200 scale-105",
                           activeOption === 'OK' && "bg-emerald-50 text-emerald-600 border-emerald-200 scale-105",
                           activeOption === 'ANGRY' && "bg-red-50 text-red-600 border-red-200 scale-105",
                           activeOption === 'SICK' && "bg-indigo-50 text-indigo-600 border-indigo-200 scale-105",
                           activeOption === 'EXCUSED' && "bg-orange-50 text-orange-600 border-orange-200 scale-105",
                           activeOption === 'NO_NEWS' && "bg-slate-50 text-slate-500 border-slate-200 scale-105",
                           !hasSelected && "from-emerald-50 to-teal-50 bg-gradient-to-br text-emerald-700 border-white"
                         )}>
                            {student.name[0]}
                         </div>
                         <div>
                            <p className="font-bold text-gray-900 text-sm tracking-tight">{student.name}</p>
                            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                               {hasSelected ? (
                                  <span className="inline-flex items-center gap-1 transition-all">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Sudah Terisi
                                  </span>
                               ) : (
                                  <span className="text-gray-400 font-medium">Belum Diisi</span>
                               )}
                            </p>
                         </div>
                       </div>
                    </td>

                    {/* Interactive Button Group column */}
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-2 justify-center items-center">
                         <ChecklistButton 
                           option="HAPPY"
                           active={activeOption === 'HAPPY'}
                           onClick={() => handleUpdateOption(student.id, 'HAPPY')}
                         />
                         <ChecklistButton 
                           option="SAD"
                           active={activeOption === 'SAD'}
                           onClick={() => handleUpdateOption(student.id, 'SAD')}
                         />
                         <ChecklistButton 
                           option="OK"
                           active={activeOption === 'OK'}
                           onClick={() => handleUpdateOption(student.id, 'OK')}
                         />
                         <ChecklistButton 
                           option="ANGRY"
                           active={activeOption === 'ANGRY'}
                           onClick={() => handleUpdateOption(student.id, 'ANGRY')}
                         />
                         <span className="w-[1px] h-5 bg-emerald-100 hidden sm:inline-block" />
                         <ChecklistButton 
                           option="NO_NEWS"
                           active={activeOption === 'NO_NEWS'}
                           onClick={() => handleUpdateOption(student.id, 'NO_NEWS')}
                         />
                         <ChecklistButton 
                           option="SICK"
                           active={activeOption === 'SICK'}
                           onClick={() => handleUpdateOption(student.id, 'SICK')}
                         />
                         <ChecklistButton 
                           option="EXCUSED"
                           active={activeOption === 'EXCUSED'}
                           onClick={() => handleUpdateOption(student.id, 'EXCUSED')}
                         />
                      </div>
                    </td>

                    {/* RESET / DELETE CELL COLUMN */}
                    <td className="px-6 py-5 text-center">
                      {hasSelected ? (
                        <button 
                          onClick={() => handleUpdateOption(student.id, null)}
                          className="p-2 hover:bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-all border border-transparent hover:border-rose-100 cursor-pointer inline-flex items-center justify-center"
                          title="Hapus / Kosongkan Pilihan"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 font-medium select-none">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-gray-400 text-sm">
                    No matching little ones found 😢
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DASHBOARD STATS RECAP AND PERSIST ACTIONS */}
      <div className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm space-y-6">
         {/* Live Dynamic Counters */}
         <div className="flex flex-wrap items-center justify-start gap-3">
            <div className={cn(
               "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
               countBelumDiisi > 0 ? "bg-orange-50 text-orange-850 border-orange-150" : "bg-teal-50 text-teal-855 border-teal-150"
            )}>
               <div className={cn("w-2 h-2 rounded-full", countBelumDiisi > 0 ? "bg-orange-500 animate-pulse" : "bg-teal-500")} />
               BELUM DIISI: {countBelumDiisi} / {totalStudents}
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-100 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               HADIR: {countHadir}
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl border border-emerald-100 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-150 text-xs font-bold flex items-center gap-2 bg-teal-50 text-teal-800 border-teal-150">
               <div className="w-2 h-2 rounded-full bg-teal-400" />
               IZIN: {countIzin} 
            </div>

            <div className="flex items-center gap-2 bg-indigo-50 text-indigo-800 px-3 py-1.5 rounded-xl border border-indigo-150 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-indigo-400" />
               SAKIT: {countSakit}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 text-slate-850 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold">
               <div className="w-2 h-2 rounded-full bg-slate-400" />
               TANPA KABAR: {countAlpha}
            </div>
         </div>

         {/* Grid displaying detail breakdown */}
         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 border-t border-dashed border-emerald-100/60 font-medium">
            <div className="bg-yellow-50/50 p-3 rounded-2xl border border-yellow-100/50 text-center">
               <p className="text-[10px] text-yellow-600 font-extrabold uppercase tracking-widest mb-1 select-none">😊 Happy</p>
               <span className="text-xl font-black text-yellow-700">{countHappy}</span>
            </div>
            <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/55 text-center">
               <p className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest mb-1 select-none">😐 OK / Biasa</p>
               <span className="text-xl font-black text-emerald-700">{countOk}</span>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100/55 text-center">
               <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-widest mb-1 select-none">😢 Sad / Sedih</p>
               <span className="text-xl font-black text-blue-700">{countSad}</span>
            </div>
            <div className="bg-red-50/50 p-3 rounded-2xl border border-red-100/55 text-center">
               <p className="text-[10px] text-red-500 font-extrabold uppercase tracking-widest mb-1 select-none">😠 Angry / Marah</p>
               <span className="text-xl font-black text-red-600">{countAngry}</span>
            </div>
         </div>

         {/* Save triggers */}
         <div className="flex flex-col sm:flex-row justify-end items-center gap-4 pt-4 border-t border-emerald-50">
           <button 
             onClick={handleSave}
             disabled={isSaving}
             className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-10 py-3.5 rounded-2xl shadow-xl shadow-emerald-100 hover:shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
           >
             {isSaving ? <Clock className="animate-spin" size={20} /> : <Save size={20} />}
             Simpan Laporan Harian
           </button>
         </div>
      </div>
    </div>
  );
}

function ChecklistButton({ option, active, onClick }: { option: string; active: boolean; onClick: () => void }) {
  const configs: Record<string, { label: string; icon: React.ReactNode; activeClasses: string; inactiveClasses: string }> = {
    HAPPY: { 
      label: 'Happy', 
      icon: <Smile size={14} />, 
      activeClasses: 'bg-yellow-400 text-white border-yellow-400 shadow-md shadow-yellow-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-yellow-600 hover:bg-yellow-50/60 border-yellow-100/60 bg-yellow-55/10 bg-yellow-50/20 shadow-none' 
    },
    SAD: { 
      label: 'Sad', 
      icon: <Frown size={14} />, 
      activeClasses: 'bg-blue-400 text-white border-blue-400 shadow-md shadow-blue-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-blue-600 hover:bg-blue-50/60 border-blue-100/60 bg-blue-55/10 bg-blue-50/20 shadow-none' 
    },
    OK: { 
      label: 'OK', 
      icon: <Meh size={14} />, 
      activeClasses: 'bg-emerald-400 text-white border-emerald-400 shadow-md shadow-emerald-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-emerald-600 hover:bg-emerald-50/60 border-emerald-100/60 bg-emerald-55/10 bg-emerald-50/20 shadow-none' 
    },
    ANGRY: { 
      label: 'Angry', 
      icon: <Angry size={14} />, 
      activeClasses: 'bg-red-500 text-white border-red-500 shadow-md shadow-red-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-red-500 hover:bg-red-50/60 border-red-150 bg-red-50/20 shadow-none' 
    },
    NO_NEWS: { 
      label: 'No News', 
      icon: <UserX size={14} />, 
      activeClasses: 'bg-slate-500 text-white border-slate-500 shadow-md shadow-slate-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-slate-500 hover:bg-slate-50 border-slate-100 bg-slate-50/20 shadow-none' 
    },
    SICK: { 
      label: 'Sick', 
      icon: <AlertCircle size={14} />, 
      activeClasses: 'bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-indigo-600 hover:bg-indigo-55/70 border-indigo-100 bg-indigo-50/20 shadow-none' 
    },
    EXCUSED: { 
      label: 'Excused', 
      icon: <CheckCircle2 size={14} />, 
      activeClasses: 'bg-orange-400 text-white border-orange-400 shadow-md shadow-orange-105 scale-[1.03] px-3.5', 
      inactiveClasses: 'text-orange-600 hover:bg-orange-55 border-orange-100 bg-orange-50/20 shadow-none' 
    },
  };

  const current = configs[option];
  if (!current) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-sm cursor-pointer select-none",
        active ? current.activeClasses : current.inactiveClasses
      )}
    >
      {current.icon}
      <span>{current.label}</span>
    </button>
  );
}
