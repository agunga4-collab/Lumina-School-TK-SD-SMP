import * as React from 'react';
import { ClipboardList } from 'lucide-react';

interface UnitActivitySectionProps {
  unitActivity: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

export default function UnitActivitySection({ unitActivity, disabled, onChange }: UnitActivitySectionProps) {
  
  const adjustHeight = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-6 animate-in fade-in duration-300">
      
      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
          <ClipboardList size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Unit Activity</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Elective, Performing Arts, & Extracurricular Reflection</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          My Unit Activity
        </label>
        <p className="text-xs text-gray-400 font-medium leading-relaxed">
          Write the activity you choose this semester, any worries you have, and how you plan to overcome them.
        </p>
        <textarea
          disabled={disabled}
          value={unitActivity}
          onChange={(e) => {
            onChange(e.target.value);
            adjustHeight(e);
          }}
          placeholder="State your elective or unit activity details, any hurdles you expect, and your action strategy..."
          className="w-full min-h-[160px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-teal-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
        />
      </div>

    </div>
  );
}
