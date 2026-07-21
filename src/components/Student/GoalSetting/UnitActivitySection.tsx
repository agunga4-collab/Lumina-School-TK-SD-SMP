import * as React from 'react';
import { ClipboardList, AlertCircle } from 'lucide-react';

interface UnitActivitySectionProps {
  unitActivity: string;
  unitActivityCategory: string;
  unitActivityName: string;
  unitActivityWorries: string;
  unitActivityOvercomingPlan: string;
  disabled: boolean;
  onChange: (field: string, value: any) => void;
}

const CATEGORIES = [
  'Performing Arts',
  'Art & Makerspace',
  'Physical Education',
  'Digital Literacy'
];

const CHOSEN_OPTIONS: Record<string, string[]> = {
  'Performing Arts': ['Orchestra', 'Choir', 'Traditional Music', 'Drumline', 'Theatre'],
  'Art & Makerspace': ['Papercraft', 'Makerspace', 'Seni Kreasi Bebas', 'Membatik', 'Painting'],
  'Physical Education': ['Bola Kecil', 'Bola Besar', 'Senam & Gerak Berirama', 'Atletik', 'Swimming & Physical Training'],
  'Digital Literacy': ['Animation', 'Videography', 'Graphic Design', '3D Structure Building', 'Coding']
};

export default function UnitActivitySection({
  unitActivity,
  unitActivityCategory,
  unitActivityName,
  unitActivityWorries,
  unitActivityOvercomingPlan,
  disabled,
  onChange
}: UnitActivitySectionProps) {

  const isLegacy = !unitActivityCategory && !unitActivityName && !unitActivityWorries && !unitActivityOvercomingPlan && !!unitActivity;

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-8 animate-in fade-in duration-300">
      
      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600">
          <ClipboardList size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Unit Activity</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Elective, Performing Arts, & Extracurricular Reflection</p>
        </div>
      </div>

      {/* Legacy Data Notice / Fallback */}
      {isLegacy && (
        <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl space-y-2 text-amber-800">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle size={16} />
            <span className="text-[10px] font-black uppercase tracking-wider">Legacy Narrative Data Detected</span>
          </div>
          <p className="text-xs font-semibold leading-relaxed">
            You have existing unit activity information saved under our old format. Please select your structured choices below. Your old response will be retained as fallback:
          </p>
          <div className="bg-white/60 p-3 rounded-lg border border-amber-200/50 text-xs italic text-gray-700 font-medium whitespace-pre-wrap">
            {unitActivity}
          </div>
        </div>
      )}

      {/* Category Dropdown */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          Unit Activity Field <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-400 font-medium">Select the broad sector of your chosen elective or extracurricular.</p>
        <select
          disabled={disabled}
          value={unitActivityCategory}
          onChange={(e) => {
            onChange('unitActivityCategory', e.target.value);
            onChange('unitActivityName', ''); // Reset choice when category changes
          }}
          className="w-full p-4 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-teal-500 outline-none transition-all duration-200 text-sm font-semibold text-gray-700 disabled:opacity-75"
        >
          <option value="">-- Choose Unit Activity Field --</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Name Dropdown (Conditional) */}
      {unitActivityCategory && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            Unit Activity Chosen <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-400 font-medium">Select your specific unit activity within {unitActivityCategory}.</p>
          <select
            disabled={disabled}
            value={unitActivityName}
            onChange={(e) => onChange('unitActivityName', e.target.value)}
            className="w-full p-4 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-teal-500 outline-none transition-all duration-200 text-sm font-semibold text-gray-700 disabled:opacity-75"
          >
            <option value="">-- Choose Specific Activity --</option>
            {(CHOSEN_OPTIONS[unitActivityCategory] || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Worries Textarea */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          Your worries joining this <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-400 font-medium">Describe any challenges, doubts, or worries you have regarding this activity.</p>
        <textarea
          disabled={disabled}
          value={unitActivityWorries}
          onChange={(e) => onChange('unitActivityWorries', e.target.value)}
          placeholder="I'm worried about..."
          className="w-full min-h-[120px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-teal-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 disabled:opacity-75"
        />
      </div>

      {/* Overcoming Plan Textarea */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          How will you plan to overcome it <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-400 font-medium">Detail your actionable plan to address these worries and excel in this activity.</p>
        <textarea
          disabled={disabled}
          value={unitActivityOvercomingPlan}
          onChange={(e) => onChange('unitActivityOvercomingPlan', e.target.value)}
          placeholder="My plan to overcome this is..."
          className="w-full min-h-[120px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-teal-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 disabled:opacity-75"
        />
      </div>

    </div>
  );
}
