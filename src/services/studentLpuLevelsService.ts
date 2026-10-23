import { auth } from '../lib/firebase';
import type { LpuTrackerLevel, LpuTrackerStudent, LpuTrackerSubject } from '../types/learningPowerUpTracker';

export interface StudentLpuLevelsResponse {
  version: 1;
  schoolYear: string;
  student: LpuTrackerStudent;
  levels: Record<string, LpuTrackerLevel>;
  issues: Partial<Record<LpuTrackerSubject, string>>;
}
export async function loadOwnLpuLevelsViaApi(year: string, signal?: AbortSignal): Promise<StudentLpuLevelsResponse> {
  const user=auth.currentUser;
  if(!user)throw new Error('Sesi login belum tersedia. Silakan masuk kembali.');
  const uid=user.uid;
  for(let attempt=0;attempt<2;attempt++){
    if(auth.currentUser?.uid!==uid)throw new Error('Akun berubah. Muat ulang laporan.');
    const token=await user.getIdToken(attempt===1);
    const response=await fetch(`/api/student-lpu-levels?${new URLSearchParams({year}).toString()}`,{
      method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},credentials:'same-origin',cache:'no-store',signal
    });
    if(response.status===401&&attempt===0)continue;
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Endpoint level siswa belum tersedia pada server. Pastikan berkas API dan konfigurasi preview/produksi sudah dipasang.');
    const body=await response.json();
    if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'Level siswa belum dapat dimuat.');
    if(body.version!==1||typeof body.student?.id!=='string'||!body.student.id||typeof body.student?.classId!=='string'||body.schoolYear!==year||!body.levels||typeof body.levels!=='object'||Array.isArray(body.levels)||!body.issues||typeof body.issues!=='object')throw new Error('Identitas/periode respons level tidak sesuai akun.');
    if(auth.currentUser?.uid!==uid)throw new Error('Akun berubah. Muat ulang laporan.');
    return body as StudentLpuLevelsResponse;
  }
  throw new Error('Sesi login perlu diperbarui. Silakan masuk kembali.');
}
