import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, Clock, AlertCircle, UserX, 
  Smile, Meh, Frown, Angry, Save, Calendar, Search, 
  ChevronRight, Heart, Users, Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { KGAttendanceStatus, KGEmotionStatus } from '../../types';

interface KGStudent {
  id: string;
  name: string;
  attendance: KGAttendanceStatus;
  emotion: KGEmotionStatus;
}

const mockStudents: KGStudent[] = [
  { id: 'K001', name: 'Zianka Azura', attendance: 'PRESENT', emotion: 'HAPPY' },
  { id: 'K002', name: 'Khalif Ahsan', attendance: 'PRESENT', emotion: 'HAPPY' },
  { id: 'K003', name: 'Safiyya Azzahra', attendance: 'PRESENT', emotion: 'HAPPY' },
  { id: 'K004', name: 'Rendra Putra', attendance: 'PRESENT', emotion: 'OK' },
  { id: 'K005', name: 'Mikayla Adnan', attendance: 'SICK', emotion: 'SAD' },
];

export default function DailyChecklist() {
  const [students, setStudents] = React.useState<KGStudent[]>(mockStudents);
  const [isSaving, setIsSaving] = React.useState(false);

  const updateAttendance = (id: string, status: KGAttendanceStatus) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, attendance: status } : s));
  };

  const updateEmotion = (id: string, emotion: KGEmotionStatus) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, emotion } : s));
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('Data kehadiran dan emosi hari ini berhasil disimpan! ❤️');
    }, 1000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-pink-100 text-pink-600 text-[10px] font-black uppercase tracking-widest">Kindy Portal</span>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight italic">Halo Guru, Semangat Hari ini!</h1>
           </div>
           <p className="text-gray-500 font-medium text-sm">Cek kehadiran dan kondisi hati anak-anak kelompok B1.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-pink-50">
           <div className="flex items-center gap-2 px-6 py-2.5 text-pink-600 font-bold">
              <Calendar size={18} />
              {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
           </div>
        </div>
      </header>

      <div className="bg-white rounded-[2rem] shadow-xl shadow-pink-50/50 border border-pink-100/50 overflow-hidden">
        <div className="bg-pink-50/30 p-6 border-b border-pink-50 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-pink-600">
                 <Users size={20} />
                 <span className="font-bold">Daftar Anak (B1 - Butterfly)</span>
              </div>
           </div>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-300" size={16} />
              <input 
                type="text" 
                placeholder="Cari nama si kecil..." 
                className="pl-10 pr-4 py-2.5 bg-white border border-pink-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-pink-300 transition-all" 
              />
           </div>
        </div>

        <div className="p-2">
          <table className="w-full text-left">
            <thead>
              <tr className="text-pink-400 text-[10px] font-black uppercase tracking-[0.2em]">
                <th className="px-6 py-4">Anak Hebat</th>
                <th className="px-6 py-4 text-center">Kehadiran</th>
                <th className="px-6 py-4 text-right">Kondisi Hati</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-50">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-pink-50/20 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-50 to-orange-50 flex items-center justify-center font-bold text-pink-600 shadow-sm border border-white">
                          {student.name[0]}
                       </div>
                       <div>
                          <p className="font-bold text-gray-900 text-sm">{student.name}</p>
                          <p className="text-[10px] text-pink-300 font-bold uppercase tracking-widest">Kelas B1</p>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-center gap-1.5 p-1 bg-gray-50/80 rounded-2xl w-fit mx-auto border border-gray-100">
                       <AttendanceToggle 
                         status="PRESENT" 
                         active={student.attendance === 'PRESENT'} 
                         onClick={() => updateAttendance(student.id, 'PRESENT')}
                       />
                       <AttendanceToggle 
                         status="SICK" 
                         active={student.attendance === 'SICK'} 
                         onClick={() => updateAttendance(student.id, 'SICK')}
                       />
                       <AttendanceToggle 
                         status="PERMISSION" 
                         active={student.attendance === 'PERMISSION'} 
                         onClick={() => updateAttendance(student.id, 'PERMISSION')}
                       />
                       <AttendanceToggle 
                         status="NO_NEWS" 
                         active={student.attendance === 'NO_NEWS'} 
                         onClick={() => updateAttendance(student.id, 'NO_NEWS')}
                       />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex justify-end gap-2">
                       <EmotionToggle 
                         type="HAPPY" 
                         active={student.emotion === 'HAPPY'} 
                         onClick={() => updateEmotion(student.id, 'HAPPY')}
                       />
                       <EmotionToggle 
                         type="OK" 
                         active={student.emotion === 'OK'} 
                         onClick={() => updateEmotion(student.id, 'OK')}
                       />
                       <EmotionToggle 
                         type="SAD" 
                         active={student.emotion === 'SAD'} 
                         onClick={() => updateEmotion(student.id, 'SAD')}
                       />
                       <EmotionToggle 
                         type="ANGRY" 
                         active={student.emotion === 'ANGRY'} 
                         onClick={() => updateEmotion(student.id, 'ANGRY')}
                       />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-pink-100 shadow-sm">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-emerald-500" />
               <span className="text-xs font-medium text-gray-500 uppercase">Hadir: 4</span>
            </div>
            <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-blue-500" />
               <span className="text-xs font-medium text-gray-500 uppercase">Sakit: 1</span>
            </div>
            <div className="flex items-center gap-2">
               <div className="w-3 h-3 rounded-full bg-orange-500" />
               <span className="text-xs font-bold text-pink-600 uppercase">Happy: 3</span>
            </div>
         </div>
         <button 
           onClick={handleSave}
           disabled={isSaving}
           className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white font-bold px-10 py-3.5 rounded-2xl shadow-xl shadow-pink-100 transition-all active:scale-95 disabled:opacity-50"
         >
           {isSaving ? <Clock className="animate-spin" size={20} /> : <Save size={20} />}
           Simpan Laporan Hari Ini
         </button>
      </div>
    </div>
  );
}

function AttendanceToggle({ status, active, onClick }: { status: KGAttendanceStatus; active: boolean; onClick: () => void }) {
  const configs = {
    PRESENT: { label: 'Hadir', activeClasses: 'bg-emerald-500 text-white shadow-emerald-100' },
    SICK: { label: 'Sakit', activeClasses: 'bg-blue-500 text-white shadow-blue-100' },
    PERMISSION: { label: 'Izin', activeClasses: 'bg-orange-500 text-white shadow-orange-100' },
    NO_NEWS: { label: '-', activeClasses: 'bg-gray-700 text-white shadow-gray-200' },
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm",
        active ? configs[status].activeClasses + " shadow-md" : "text-gray-400 hover:bg-white"
      )}
    >
      {configs[status].label}
    </button>
  );
}

function EmotionToggle({ type, active, onClick }: { type: KGEmotionStatus; active: boolean; onClick: () => void }) {
  const icons = {
    HAPPY: <Smile size={20} />,
    OK: <Meh size={20} />,
    SAD: <Frown size={20} />,
    ANGRY: <Angry size={20} />,
  };

  const activeColors = {
    HAPPY: 'bg-yellow-400 text-white shadow-yellow-100',
    OK: 'bg-emerald-400 text-white shadow-emerald-100',
    SAD: 'bg-blue-400 text-white shadow-blue-100',
    ANGRY: 'bg-red-400 text-white shadow-red-100',
  };

  return (
    <button
      onClick={onClick}
      title={type}
      className={cn(
        "w-10 h-10 rounded-2xl flex items-center justify-center transition-all",
        active ? activeColors[type] + " shadow-lg" : "bg-gray-50 text-gray-300 hover:bg-pink-50 hover:text-pink-300"
      )}
    >
      {icons[type]}
    </button>
  );
}
