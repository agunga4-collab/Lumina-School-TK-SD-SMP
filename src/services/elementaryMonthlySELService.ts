import { auth } from '../lib/firebase';
import type { SELRubric, SELRubricBinding, ElementaryMonthlyStudentNarrativeDoc } from '../types/elementaryMonthlyReport';
export type SELContext = { classId: string; academicYear: string; semester: string; month: string };
export class SELRequestError extends Error {
  constructor(message: string, public code: string, public details: any = {}) { super(message); }
}
export async function requestMonthlySEL<T>(action: string, input: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi berakhir. Masuk kembali.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`/api/elementary-monthly/sel/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(input), credentials: 'same-origin', cache: 'no-store', signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new SELRequestError(result?.error || `Layanan SEL gagal (HTTP ${response.status}).`, result?.code || 'SEL_REQUEST_FAILED', result);
    return result;
  } catch (e) {
    if (e instanceof SELRequestError) throw e;
    throw new SELRequestError('Respons belum terkonfirmasi. Draf tetap dipertahankan; coba simpan lagi dengan isian yang sama.', 'SEL_NETWORK');
  } finally { clearTimeout(timer); }
}
export function fetchMonthlySELContext(input: SELContext & { rubricId?: string }) {
  return requestMonthlySEL<{ rubric: SELRubric | null; pinnedRubric: SELRubric | null; binding: SELRubricBinding | null; canManage: boolean }>('context', input);
}
export function listMonthlySELRubrics(input: Omit<SELContext, 'classId'> & { gradeLevel: number }) {
  return requestMonthlySEL<{ classes: { id: string; name: string }[]; rubrics: SELRubric[] }>('list', input);
}
export function saveMonthlySELRubric(rubric: SELRubric) {
  return requestMonthlySEL<{ rubric: SELRubric }>('saveRubric', { rubric, expectedRevision: rubric.revision });
}
export function applyMonthlySELRubric(rubric: SELRubric, conflicts?: any[]) {
  return requestMonthlySEL<{ results: { classId: string; status: string; rubricId: string }[] }>('applyRubric', {
    rubricId: rubric.id, expectedRevision: rubric.revision, confirmReplacement: !!conflicts, ...(conflicts ? { conflicts } : {})
  });
}
export function mutateMonthlyNarrative(input: SELContext & { studentId: string; action: string; narrativeDoc?: any; expectedRevision?: number; reviewNotes?: string }) {
  return requestMonthlySEL<{ narrativeDoc: ElementaryMonthlyStudentNarrativeDoc }>('narrative', input);
}
