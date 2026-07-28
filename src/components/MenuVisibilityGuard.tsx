import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMenuVisibility, UnitMenuSettings } from '../context/MenuVisibilityContext';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Home } from 'lucide-react';

interface MenuVisibilityGuardProps {
  menuKey: keyof UnitMenuSettings;
  children: React.ReactNode;
}

export function MenuVisibilityGuard({ menuKey, children }: MenuVisibilityGuardProps) {
  const { isMenuVisible, isLoading } = useMenuVisibility();
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const activeUnit = localStorage.getItem('lumina_active_unit') || profile?.unitId || 'JUNIOR_HIGH';
  const isVisible = isMenuVisible(activeUnit, menuKey);

  if (!isVisible) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 md:p-12">
        <div className="max-w-md w-full bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm text-center space-y-6 animate-in fade-in zoom-in duration-200">
          <div className="mx-auto w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100">
            <AlertTriangle size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Menu Tidak Aktif</h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              Menu sedang tidak aktif untuk unit ini.
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-blue-100 cursor-pointer"
          >
            <Home size={14} /> Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
