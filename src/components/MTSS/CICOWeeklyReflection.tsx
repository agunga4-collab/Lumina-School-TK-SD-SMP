import React from 'react';
import { 
  X, Save, MessageSquare, Heart, 
  Target, ClipboardList, PenTool 
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { saveCICOWeeklyReflection } from '../../lib/firebase';
import type { MTSSCase } from '../../types';

interface CICOWeeklyReflectionProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  weekNumber: number;
  weekStartingDate: string; // The Monday of the week
}

export const CICOWeeklyReflectionModal: React.FC<CICOWeeklyReflectionProps> = ({
  isOpen,
  onClose,
  caseId,
  weekNumber,
  weekStartingDate
}) => {
  const [loading, setLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    studentPositives: '',
    studentPlans: '',
    teacherNotes: ''
  });

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await saveCICOWeeklyReflection({
        caseId,
        weekNumber,
        weekStartingDate,
        ...formData
      });
      onClose();
    } catch (err) {
      console.error("Error saving weekly reflection:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
              <ClipboardList size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                Refleksi Mingguan (Minggu {weekNumber})
              </h2>
              <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">
                Evaluasi progres selama satu minggu terakhir
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
             <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
               <Heart size={14} className="text-pink-500" />
               Hal positif yang saya lakukan minggu ini
             </label>
             <textarea 
               value={formData.studentPositives}
               onChange={(e) => setFormData(p => ({ ...p, studentPositives: e.target.value }))}
               placeholder="Ditulis berdasarkan percakapan dengan siswa..."
               className="w-full h-24 px-5 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-purple-300 transition-all font-bold text-sm text-gray-900 resize-none outline-none"
             />
          </div>

          <div className="space-y-3">
             <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
               <Target size={14} className="text-blue-500" />
               Yang ingin saya tingkatkan minggu depan
             </label>
             <textarea 
               value={formData.studentPlans}
               onChange={(e) => setFormData(p => ({ ...p, studentPlans: e.target.value }))}
               placeholder="Target spesifik untuk minggu depan..."
               className="w-full h-24 px-5 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-purple-300 transition-all font-bold text-sm text-gray-900 resize-none outline-none"
             />
          </div>

          <div className="space-y-3">
             <label className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
               <PenTool size={14} className="text-purple-500" />
               Catatan Guru untuk Minggu Ini
             </label>
             <textarea 
               value={formData.teacherNotes}
               onChange={(e) => setFormData(p => ({ ...p, teacherNotes: e.target.value }))}
               placeholder="Evaluasi umum dari kacamata guru..."
               className="w-full h-24 px-5 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-purple-300 transition-all font-bold text-sm text-gray-900 resize-none outline-none"
             />
          </div>
        </div>

        <div className="px-8 py-6 bg-gray-50 flex items-center justify-end gap-4">
           <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-gray-500"
           >
             Lewati Saja
           </button>
           <button 
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center justify-center gap-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-purple-200"
           >
             {loading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={16} />}
             Simpan Refleksi
           </button>
        </div>
      </motion.div>
    </div>
  );
};
