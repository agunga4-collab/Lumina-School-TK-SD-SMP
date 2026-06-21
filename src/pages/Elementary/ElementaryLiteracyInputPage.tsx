import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function ElementaryLiteracyInputPage() {
  const navigate = useNavigate();

  React.useEffect(() => {
    // Seamlessly redirect to the unified canonical Literacy & Numeracy interface
    navigate('/elementary/literasi-numerasi', { replace: true });
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 text-slate-500 font-sans">
      <Loader2 size={36} className="animate-spin text-indigo-600" />
      <p className="text-sm font-black uppercase tracking-wider">Mengarahkan ke Panel Penilaian Sinkron...</p>
    </div>
  );
}
