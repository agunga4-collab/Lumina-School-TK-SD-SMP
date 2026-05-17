import * as React from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';

export function LGBackupTestButton() {
  const { profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [error, setError] = React.useState<any>(null);
  const [visible, setVisible] = React.useState(false);

  // Only show for Super Admin
  if (profile?.role !== 'SUPER_ADMIN') return null;

  const handleTest = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      // 1. First test health
      const hResp = await fetch('/api/health');
      const hData = await hResp.json().catch(() => ({ status: 'error', message: 'Not JSON' }));
      
      const response = await fetch('/api/lg-backup-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lgId: "TEST_LG_ID" }),
      });

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        
        if (!response.ok) {
          throw {
            status: response.status,
            health: hData,
            message: data.message || "Request failed",
            details: data.details || data
          };
        }
        
        setResult({ ...data, _health: hData });
      } else {
        const text = await response.text();
        throw {
          status: response.status,
          health: hData,
          message: "Server returned non-JSON response",
          text: text.substring(0, 500)
        };
      }
    } catch (err: any) {
      console.error("Test LG Backup Error:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">
      {/* Debug Result Box */}
      { (result || error) && (
        <div className="w-80 bg-gray-900 text-gray-100 p-4 rounded-2xl shadow-2xl border border-gray-800 font-mono text-[10px] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-2">
              <Terminal size={14} className="text-blue-400" />
              DEBUG: LG BACKUP
            </span>
            <button 
              onClick={() => { setResult(null); setError(null); }}
              className="text-gray-500 hover:text-white"
            >
              Close
            </button>
          </div>
          
          <div className="max-h-60 overflow-y-auto space-y-2">
            { result && (
              <div className="space-y-1">
                <div className="text-emerald-400 flex items-center gap-1 font-bold italic">
                  <CheckCircle size={12} /> SUCCESS
                </div>
                <pre className="whitespace-pre-wrap break-all opacity-80">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
            
            { error && (
              <div className="space-y-1">
                <div className="text-red-400 flex items-center gap-1 font-bold italic">
                  <AlertTriangle size={12} /> ERROR {error.status}
                </div>
                <div className="bg-red-950/20 p-2 rounded border border-red-900/30 text-red-300">
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(error, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle / Trigger Button */}
      <div className="flex items-center gap-2">
        {visible && (
          <button
            onClick={handleTest}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full font-bold shadow-lg hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-widest",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Terminal size={14} />}
            Test LG Backup
          </button>
        )}
        
        <button
          onClick={() => setVisible(!visible)}
          className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-90 transition-all border-2 border-gray-800"
          title="Admin Debug Features"
        >
          <Terminal size={20} className={cn(visible && "text-blue-400")} />
        </button>
      </div>
    </div>
  );
}
