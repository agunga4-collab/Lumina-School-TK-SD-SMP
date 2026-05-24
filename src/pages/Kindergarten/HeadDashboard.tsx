import * as React from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend as RechartsLegend
} from 'recharts';
import { 
  Users, Heart, Palette, Star, AlertCircle, 
  ChevronRight, LayoutDashboard, Calendar, Bell,
  TrendingUp, Activity, Sparkles, Smile, Frown, Meh, Angry, BarChart3
} from 'lucide-react';
import { cn } from '../../lib/utils';

const emotionData: any[] = [];
const domainData: any[] = [];
const highlights: any[] = [];

export default function KindergartenHeadDashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
           <h1 className="text-2xl font-black text-gray-900 tracking-tight italic">Dashboard Kepala TK</h1>
           <p className="text-gray-500 font-medium tracking-tight">Monitoring Unit Lumina Kindergarten</p>
        </div>
        <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 items-center gap-4">
           <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-100">
              <Calendar size={16} />
              {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date())}
           </div>
        </div>
      </header>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Kehadiran" value="0%" detail="Unit TK" icon={<Users className="text-blue-500" />} />
        <StatCard label="Indeks Bahagia" value="0%" detail="N/A" icon={<Heart className="text-emerald-500" />} />
        <StatCard label="Progres BSH/BSB" value="0%" detail="Belum ada data" icon={<Star className="text-yellow-500" />} />
        <StatCard label="Aktivitas Sentra" value="0" detail="Belum dimulai" icon={<Palette className="text-purple-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Emotional Distribution */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
           <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-50 pb-4">
              <Activity size={18} className="text-emerald-500" />
              Distribusi Emosi Anak
           </h3>
           <div className="h-64 flex flex-col items-center justify-center border border-dashed border-gray-100 rounded-3xl">
              <Activity className="text-gray-100 mb-2" size={48} />
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Data Emosi Kosong</p>
           </div>
           <div className="grid grid-cols-2 gap-4">
              {['Happy', 'OK', 'Sad', 'Angry'].map(name => (
                <div key={name} className="flex items-center gap-2 bg-gray-50/50 p-3 rounded-2xl border border-gray-100 opacity-40">
                   {getEmotionIcon(name)}
                   <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{name}</span>
                      <span className="text-sm font-black text-gray-900">0%</span>
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Domain Distribution */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
           <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-50 pb-4 text-sm uppercase tracking-widest">
              <TrendingUp size={18} className="text-emerald-500" />
              Progres Domain per Unit
           </h3>
           <div className="h-80 flex flex-col items-center justify-center border border-dashed border-gray-100 rounded-[2.5rem]">
              <TrendingUp className="text-gray-100 mb-2" size={64} />
              <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Belum Ada Progres Domain</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Child Highlights */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
           <div className="flex justify-between items-center bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
              <h3 className="font-bold text-orange-900 flex items-center gap-2 text-sm uppercase tracking-[0.1em]">
                 <Bell size={16} />
                 Anak Butuh Perhatian (Alert)
              </h3>
              <Sparkles size={16} className="text-orange-400" />
           </div>
           <div className="space-y-4">
              <div className="h-40 flex flex-col items-center justify-center border border-dashed border-gray-200 rounded-3xl opacity-50">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Semua Anak Aman</p>
              </div>
           </div>
        </div>

        {/* Sentra Activity Highlights */}
        <div className="bg-emerald-600 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-100 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-10 opacity-10">
              <BarChart3 size={120} />
           </div>
           <div className="space-y-6 relative z-10">
              <h3 className="font-bold text-sm bg-white/20 w-fit px-4 py-1 rounded-full uppercase tracking-widest">Aktivitas Sentra</h3>
              <div className="space-y-4 py-6 border border-white/10 border-dashed rounded-2xl text-center">
                 <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest">Belum Ada Pembelajaran</p>
              </div>
              <button disabled className="w-full py-3.5 bg-white/10 text-white/50 font-black rounded-2xl text-[10px] uppercase tracking-widest border border-white/5 cursor-not-allowed">
                 Lihat Detail Kurikulum
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 space-y-4 hover:shadow-md transition-shadow">
       <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center shadow-inner border border-white">
             {icon}
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{label}</p>
       </div>
       <div>
          <p className="text-3xl font-black text-gray-900 tracking-tighter">{value}</p>
          <p className="text-[10px] text-gray-500 font-bold italic opacity-80">{detail}</p>
       </div>
    </div>
  );
}

function SentraHero({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl border border-white/15">
       <div className="p-2 bg-white/20 rounded-xl">{icon}</div>
       <div>
          <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest opacity-80">{label}</p>
          <p className="font-bold text-sm tracking-tight">{value}</p>
       </div>
    </div>
  );
}

function getEmotionIcon(name: string) {
   switch(name) {
      case 'Happy': return <Smile size={18} className="text-yellow-400" />;
      case 'OK': return <Meh size={18} className="text-emerald-400" />;
      case 'Sad': return <Frown size={18} className="text-blue-400" />;
      case 'Angry': return <Angry size={18} className="text-red-400" />;
      default: return null;
   }
}
