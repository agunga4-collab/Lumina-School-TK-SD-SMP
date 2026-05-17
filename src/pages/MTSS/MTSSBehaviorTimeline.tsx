import React from 'react';
import { motion } from 'motion/react';
import { useOutletContext } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  History, 
  Sparkles,
  Info
} from 'lucide-react';

export default function MTSSBehaviorTimeline() {
  const { filters } = useOutletContext<{ filters: any }>();
  
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-[2.5rem] border border-gray-100 p-12 text-center shadow-sm">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <History size={40} />
          </div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase">Behavior Global Timeline</h2>
          <p className="text-gray-500 font-medium leading-relaxed uppercase tracking-wider text-xs">
            Viewing Roadmap for: {filters.academicYear} • Semester {filters.semester}
          </p>
          <p className="text-gray-500 font-medium leading-relaxed">
            Halaman ini sedang dalam pengembangan. Nantinya, Anda dapat melihat peta jalan (roadmap) implementasi intervensi perilaku secara klasikal maupun kelompok di seluruh unit Junior High.
          </p>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-8">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 border border-gray-100">
              <Sparkles size={14} className="text-blue-400" />
              Planned for Q3
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 border border-gray-100">
              <Calendar size={14} className="text-blue-400" />
              Symmetrical roadmap
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton / Preview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 opacity-40 grayscale pointer-events-none select-none">
        <div className="h-64 bg-white rounded-[2rem] border border-dashed border-gray-200" />
        <div className="h-64 bg-white rounded-[2rem] border border-dashed border-gray-200" />
        <div className="h-64 bg-white rounded-[2rem] border border-dashed border-gray-200" />
      </div>

      <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] flex gap-4 items-start">
        <Info className="text-amber-500 shrink-0 mt-1" size={24} />
        <div>
          <h4 className="text-xs font-black text-amber-900 tracking-tight uppercase italic mb-1">Development Notice</h4>
          <p className="text-[11px] font-bold text-amber-700 leading-relaxed uppercase tracking-wide">
            Kami sedang menyelaraskan siklus pencegahan perilaku (Prevention Cycle) agar sejajar dengan siklus Akademik. Pantau pembaruan rutin pada modul ini.
          </p>
        </div>
      </div>
    </div>
  );
}
