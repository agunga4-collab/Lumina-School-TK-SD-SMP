import * as React from 'react';
import { motion } from 'motion/react';
import { History, BookOpen, Calendar, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, cn } from '../../lib/utils';
import type { Reflection } from '../../types';

const mockHistory: (Reflection & { mood: string })[] = [
  {
    id: '1',
    studentId: 'S001',
    topic: 'Proyek',
    incident: 'Mengerjakan proyek robotik sendirian karena teman kelompok absen.',
    feelings: 'Melelahkan tapi bangga bisa handle sendiri.',
    improvement: 'Belajar bagi tugas lebih jelas di awal.',
    mood: 'Lelah tapi Puas',
    createdAt: Date.now() - 86400000 * 2, // 2 days ago
  },
  {
    id: '2',
    studentId: 'S001',
    topic: 'Belajar',
    incident: 'Kesulitan memahami materi aljabar di kelas tadi pagi.',
    feelings: 'Bingung dan agak malas bertanya.',
    improvement: 'Coba tanya teman bimbingan besok.',
    mood: 'Bingung',
    createdAt: Date.now() - 86400000 * 5, // 5 days ago
  },
  {
    id: '3',
    studentId: 'S001',
    topic: 'Pergaulan',
    incident: 'Bersenang-senang saat jam istirahat main basket.',
    feelings: 'Sangat senang dan bugar.',
    improvement: 'Sering-sering olahraga.',
    mood: 'Sangat Senang',
    createdAt: Date.now() - 86400000 * 7, // 7 days ago
  },
];

export default function ReflectionHistory() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Riwayat Perjalananku</h1>
          <p className="text-gray-500 font-medium">Melihat kembali jejak langkah dan perasaanmu selama ini.</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
          <BookOpen className="text-blue-500" size={18} />
          <span className="text-sm font-bold text-gray-700">{mockHistory.length} Cerita Terdaftar</span>
        </div>
      </header>

      <div className="space-y-4">
        {mockHistory.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group relative bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-5">
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0",
                  item.topic === 'Proyek' ? "bg-purple-50 text-purple-600" :
                  item.topic === 'Belajar' ? "bg-blue-50 text-blue-600" :
                  item.topic === 'Pergaulan' ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-600"
                )}>
                  <History size={24} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                      {item.topic}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-gray-200" />
                    <div className="flex items-center gap-1 text-gray-400">
                      <Calendar size={12} />
                      <span className="text-xs font-bold">{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                    {item.incident.length > 60 ? item.incident.substring(0, 60) + '...' : item.incident}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-medium text-gray-500">Kala itu merasa:</span>
                    <span className="px-3 py-1 bg-gray-100 rounded-full text-[11px] font-bold text-gray-700">
                      {item.mood}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 ml-auto md:ml-0">
                <div className="flex -space-x-2">
                   {/* Dummy AI Indicator */}
                   <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-600 shadow-sm" title="Dibantu Lumina">
                      <Sparkles size={14} />
                   </div>
                </div>
                <Link 
                  to={`/exploration/reflection/${item.id}`}
                  className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm"
                >
                  <ChevronRight size={20} />
                </Link>
              </div>
            </div>

            {/* Hover preview text */}
            <div className="mt-4 pt-4 border-t border-gray-50 hidden group-hover:block transition-all animate-in fade-in duration-300">
               <p className="text-sm text-gray-500 italic leading-relaxed">
                 "{item.feelings}"
               </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex justify-center pt-8">
        <Link 
          to="/exploration/reflection"
          className="flex items-center gap-3 px-8 py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 shadow-xl transition-all active:scale-95"
        >
          <MessageSquare size={20} />
          Tulis Refleksi Baru
        </Link>
      </div>
    </div>
  );
}
