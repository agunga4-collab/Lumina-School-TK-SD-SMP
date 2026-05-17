import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Languages, Calculator, Heart, 
  ChevronRight, Save, Calendar, Search, 
  Filter, CheckCircle2, History, AlertCircle, Sparkles, Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { LiteracyArea, LiteracyLevel } from '../../types';

interface Student {
  id: string;
  name: string;
  class: string;
}

const mockStudents: Student[] = [
  { id: 'S001', name: 'Dika Ramadhan', class: '8-A' },
  { id: 'S002', name: 'Alya Putri', class: '8-A' },
  { id: 'S003', name: 'Farez Rahadian', class: '8-A' },
  { id: 'S004', name: 'Siti Aminah', class: '8-A' },
];

const areas: { id: LiteracyArea; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'BAHASA', label: 'Bahasa Indonesia', icon: <BookOpen />, color: 'blue' },
  { id: 'ENGLISH', label: 'English Reading', icon: <Languages />, color: 'indigo' },
  { id: 'MENGAJI', label: 'Mengaji', icon: <Heart />, color: 'emerald' },
  { id: 'NUMERASI', label: 'Numerasi (Math)', icon: <Calculator />, color: 'purple' },
];

const levels: { value: LiteracyLevel; label: string }[] = [
  { value: 1, label: 'Belum Lancar' },
  { value: 2, label: 'Cukup' },
  { value: 3, label: 'Lancar' },
  { value: 4, label: 'Mahir' },
];

const mengajiLevels = [
  'Iqra 1-3', 'Iqra 4-6', 'Juz Amma', 'Al-Quran', 'Tartil', 'Tahfidz'
];

export default function LiteracyInput() {
  const [selectedArea, setSelectedArea] = React.useState<LiteracyArea>('BAHASA');
  const [selectedStudent, setSelectedStudent] = React.useState<Student | null>(null);
  const [level, setLevel] = React.useState<LiteracyLevel>(2);
  const [mengajiSubLevel, setMengajiSubLevel] = React.useState('Juz Amma');
  const [notes, setNotes] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = () => {
    if (!selectedStudent) return;
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setNotes('');
      alert(`Progress ${selectedArea} untuk ${selectedStudent.name} berhasil disimpan!`);
    }, 1000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Capaian Literasi & Numerasi</h1>
          <p className="text-gray-500 font-medium">Input progres harian dan level perkembangan siswa.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-50 transition-all">
            <History size={16} />
            Riwayat Kelas
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar: Areas & Students */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-1">Pilih Area</p>
            {areas.map(area => (
              <button
                key={area.id}
                onClick={() => setSelectedArea(area.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all",
                  selectedArea === area.id 
                    ? `bg-${area.color}-600 text-white shadow-lg` 
                    : "text-gray-600 hover:bg-gray-50"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  selectedArea === area.id ? "bg-white/20" : `bg-${area.color}-50 text-${area.color}-600`
                )}>
                  {React.cloneElement(area.icon as React.ReactElement, { size: 18 })}
                </div>
                <span className="text-sm font-bold">{area.label}</span>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Daftar Siswa 8-A</p>
              <Search size={14} className="text-gray-300" />
            </div>
            <div className="space-y-1">
              {mockStudents.map(student => (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all",
                    selectedStudent?.id === student.id ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <span className="text-sm font-bold">{student.name}</span>
                  {selectedStudent?.id === student.id && <ChevronRight size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Input Area */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {selectedStudent ? (
              <motion.div
                key={selectedStudent.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-8"
              >
                <div className="flex justify-between items-start border-b border-gray-50 pb-6">
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-2xl font-bold text-gray-400 border border-gray-100">
                      {selectedStudent.name[0]}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedStudent.name}</h2>
                      <p className="text-sm text-gray-500 font-medium">Input Progress: {areas.find(a => a.id === selectedArea)?.label}</p>
                    </div>
                  </div>
                  <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 text-blue-600 flex items-center gap-2">
                    <Calendar size={18} />
                    <span className="text-sm font-bold">22 Apr 2026</span>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* Level Selection */}
                  <div className="space-y-4">
                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Level Capaian</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {levels.map(l => (
                        <button
                          key={l.value}
                          onClick={() => setLevel(l.value)}
                          className={cn(
                            "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                            level === l.value 
                              ? "bg-blue-50 border-blue-600 text-blue-700 shadow-md transform scale-105" 
                              : "border-gray-50 text-gray-400 hover:border-gray-200"
                          )}
                        >
                          <span className="text-xl font-black">{l.value}</span>
                          <span className="text-[10px] font-bold uppercase">{l.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Context Specific (Mengaji) */}
                  {selectedArea === 'MENGAJI' && (
                    <div className="space-y-4">
                      <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Fokus Materi Mengaji</label>
                      <div className="flex flex-wrap gap-2">
                        {mengajiLevels.map(m => (
                          <button
                            key={m}
                            onClick={() => setMengajiSubLevel(m)}
                            className={cn(
                              "px-4 py-2 rounded-full text-xs font-bold transition-all border",
                              mengajiSubLevel === m ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-500 border-gray-200 hover:border-emerald-300"
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-4">
                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Catatan Perkembangan</label>
                    <textarea
                      rows={4}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-blue-600 transition-all"
                      placeholder="Apa kemajuan atau kendala yang dialami siswa kali ini?"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button className="px-6 py-3 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all">
                    Lewati
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-3 rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    Simpan Progres
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="h-[500px] flex flex-col items-center justify-center space-y-4 opacity-30 text-gray-400">
                <BookOpen size={80} />
                <p className="font-bold text-xl">Pilih siswa untuk memulai penilaian</p>
                <p className="text-sm">Catatan Anda membantu Lumina menganalisis risiko belajar lebih awal.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
