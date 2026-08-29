import * as React from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, LogIn, ShieldCheck } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { LuminaLogo } from '../../components/LuminaLogo';
import { getDashboardRoute } from '../../utils/routeResolver';

export default function LoginPage() {
  const { signInWithGoogle, loading, user, profile } = useAuth();
  const location = useLocation();
  
  // Early logging for debugging redirection/race conditions
  console.log("[LoginPage] Early Render Log:", { 
    authEmail: user?.email, 
    profileStatus: profile?.status,
    loading
  });

  // Debug logs in useEffect
  React.useEffect(() => {
    console.log("[LoginPage] Render State:", {
      authId: user?.uid,
      profileStatus: profile?.status,
      loading
    });
  }, [user, profile, loading]);

  // Guard: If authenticated and active, go to dashboard
  if (user && profile?.status === 'active') {
    const from = (location.state?.from?.pathname && location.state.from.pathname !== '/login' && location.state.from.pathname !== '/pending')
      ? location.state.from.pathname + (location.state.from.search || '')
      : null;
    
    const activeUnit = (profile.unitId as any) || localStorage.getItem('lumina_active_unit') || 'JUNIOR_HIGH';
    const targetRoute = from || getDashboardRoute(profile, activeUnit);
    return <Navigate to={targetRoute} replace />;
  }

  // Guard: If authenticated but pending, go to pending page
  if (user && profile?.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#002366] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-gray-500 animate-pulse uppercase tracking-widest">Memverifikasi Sesi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Shapes */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-40">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] bg-purple-100 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 border border-gray-100 relative z-10 text-center space-y-8"
      >
        <div className="space-y-4">
          <LuminaLogo size="xl" className="mx-auto rotate-3" />
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">LUMINA</h1>
            <p className="text-gray-500 font-medium text-xs uppercase tracking-widest mt-1">Lazuardi Unified Memory & Insight Navigation Assistant</p>
          </div>
        </div>

        <div className="space-y-6">
          <p className="text-sm text-gray-500 leading-relaxed px-4">
            Silakan masuk menggunakan akun Google sekolah atau akun yang terdaftar untuk mengakses Lumina.
          </p>

          <button 
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center bg-white border border-gray-200 py-4 px-6 rounded-2xl font-bold text-[#444] hover:bg-gray-50 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
          >
            Masuk dengan Google
          </button>
        </div>

        <div className="pt-4 opacity-0 pointer-events-none">
           <p className="text-[10px] text-gray-300 font-black uppercase tracking-widest flex items-center justify-center gap-2">
             <Sparkles size={12} />
             Powered by AI Studio & Firebase
           </p>
        </div>
      </motion.div>

      <p className="mt-8 text-gray-400 text-xs font-semibold relative z-10">
        © 2026 Lumina
      </p>
    </div>
  );
}
