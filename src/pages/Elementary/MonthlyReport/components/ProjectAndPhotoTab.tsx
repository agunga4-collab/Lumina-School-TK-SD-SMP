import * as React from 'react';
import {
  Camera, Upload, Trash2, Link, Save, AlertCircle, RefreshCw, Users, Copy,
  Image as ImageIcon, Check, X, Eye, User as UserIcon, Crop,
} from 'lucide-react';
import type {
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyStudentPhotoDoc,
  ElementaryMonthlyPhotoSnapshot,
  ElementaryMonthlyIdentityPhoto,
  ElementaryMonthlyCropSettings,
} from '../../../../types/elementaryMonthlyReport';
import type { Student, Class, User } from '../../../../types';
import {
  fetchElementaryMonthlyProjectDoc,
  saveElementaryMonthlyProjectDoc,
  fetchElementaryMonthlyStudentPhotos,
  saveElementaryMonthlyStudentPhotoDoc,
  bulkApplyElementaryMonthlyPhotos,
  uploadElementaryMonthlyPhotoToSharedDrive,
  verifyElementaryMonthlyDriveRoot,
  ElementaryMonthlyPhotoError,
} from '../../../../services/elementaryMonthlyReportService';
import {
  ElementaryMonthlyPhotoImage,
  ElementaryMonthlyPhotoCropDialog,
  type ElementaryMonthlyPhotoScope,
} from './ElementaryMonthlyPhotoImage';
import { toast } from 'sonner';
import {
  resolveElementaryMonthlyIdentityPhoto,
  ELEMENTARY_MONTHLY_IDENTITY_ASPECT_RATIO,
  ELEMENTARY_MONTHLY_SNAPSHOT_ASPECT_RATIO,
} from '../../../../lib/elementaryMonthlyPhoto';

interface ProjectAndPhotoTabProps {
  selectedClass: Class | null;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string;
  monthLabel: string;
  students: Student[];
  currentUser: User | null;
}

type PhotoSlot = 'identity' | 0 | 1 | 2;
type PhotoSnapshots = ElementaryMonthlyStudentPhotoDoc['snapshots'];
type PhotoUploadParams = Parameters<typeof uploadElementaryMonthlyPhotoToSharedDrive>[0];
type StoredUploadRequest = Omit<PhotoUploadParams, 'file' | 'user'>;

interface StudentPhotoDraft {
  identityPhotoUrl: string;
  identityPhoto: ElementaryMonthlyIdentityPhoto | null;
  snapshots: PhotoSnapshots;
  albumLink: string;
  revision: number;
  dirty: boolean;
}

interface PendingPhotoUpload {
  key: string;
  contextKey: string;
  studentName: string;
  target: PhotoSlot;
  request: PhotoUploadParams;
  storageKey: string;
  preserveDraft: boolean;
  recovering: boolean;
}

interface PendingPhotoConflict {
  operationId: string;
  loaded: boolean;
  photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
  confirmed: boolean;
}

function createPhotoDraft(doc?: ElementaryMonthlyStudentPhotoDoc | null): StudentPhotoDraft {
  const identityPhoto = resolveElementaryMonthlyIdentityPhoto(doc);
  return {
    identityPhotoUrl: identityPhoto?.url || '',
    identityPhoto,
    snapshots: [0, 1, 2].map(index => ({
      ...(doc?.snapshots?.[index] || { index, url: '', caption: '' }), index,
    })) as PhotoSnapshots,
    albumLink: doc?.albumLink || '',
    revision: doc?.revision || 0,
    dirty: false,
  };
}

function getPhotoDraftKey(scope: ElementaryMonthlyPhotoScope): string {
  return JSON.stringify([scope.classId, scope.academicYear, scope.semester, scope.month, scope.studentId]);
}

function getUploadStorageKey(scope: ElementaryMonthlyPhotoScope, target: PhotoSlot, file: File, actorUid: string): string {
  return 'lumina-monthly-photo-upload:' + JSON.stringify([
    actorUid, getPhotoDraftKey(scope), target, file.name, file.size, file.lastModified, file.type,
  ]);
}

function readStoredUpload(key: string): StoredUploadRequest | null {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as StoredUploadRequest;
    return typeof parsed.operationId === 'string' && typeof parsed.expectedRevision === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function storeUpload(key: string, request: PhotoUploadParams): void {
  const { file: _file, user: _user, ...record } = request;
  try { sessionStorage.setItem(key, JSON.stringify(record)); } catch { /* In-memory retry remains available. */ }
}

function clearStoredUpload(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* Storage can be unavailable in private browsing. */ }
}

function createOperationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const ProjectAndPhotoTab: React.FC<ProjectAndPhotoTabProps> = ({
  selectedClass, selectedYear, selectedSemester, selectedMonth, monthLabel, students, currentUser,
}) => {
  const classId = selectedClass?.id || '';
  const contextKey = JSON.stringify([classId, selectedYear, selectedSemester, selectedMonth]);
  const contextRef = React.useRef(contextKey);
  contextRef.current = contextKey;
  const mountedRef = React.useRef(true);
  const loadGeneration = React.useRef(0);
  const operationRef = React.useRef<symbol | null>(null);

  const [projectDoc, setProjectDoc] = React.useState<ElementaryMonthlyProjectDoc | null>(null);
  const [projectTitle, setProjectTitle] = React.useState('');
  const [projectOverview, setProjectOverview] = React.useState('');
  const [sharedAlbumLink, setSharedAlbumLink] = React.useState('');
  const [savingProject, setSavingProject] = React.useState(false);
  const [photoData, setPhotoData] = React.useState<{ contextKey: string; map: Record<string, ElementaryMonthlyStudentPhotoDoc> }>({ contextKey: '', map: {} });
  const photosMap = photoData.contextKey === contextKey ? photoData.map : {};
  const scopeLoaded = photoData.contextKey === contextKey;
  const [loadingData, setLoadingData] = React.useState(false);
  const [activeStudentId, setActiveStudentId] = React.useState(students[0]?.id || '');
  const activeStudent = students.find(student => student.id === activeStudentId) || students[0] || null;
  const activeScope: ElementaryMonthlyPhotoScope = {
    classId, studentId: activeStudent?.id || '', academicYear: selectedYear, semester: selectedSemester, month: selectedMonth,
  };
  const activeKey = getPhotoDraftKey(activeScope);
  const [drafts, setDrafts] = React.useState<Record<string, StudentPhotoDraft>>({});
  const draftsRef = React.useRef(drafts);
  const activeDraft = drafts[activeKey]?.dirty ? drafts[activeKey] : createPhotoDraft(activeStudent ? photosMap[activeStudent.id] : null);
  const studentIdentityPhoto = activeDraft.identityPhotoUrl;
  const identityPhotoMeta = activeDraft.identityPhoto;
  const snapshots = activeDraft.snapshots;
  const studentAlbumLink = activeDraft.albumLink;
  const masterPhotoUrl = (activeStudent as (Student & { photoUrl?: string }) | null)?.photoUrl || '';
  const activeIdentityPhoto = resolveElementaryMonthlyIdentityPhoto({ identityPhotoUrl: studentIdentityPhoto, identityPhoto: identityPhotoMeta }, masterPhotoUrl);
  const [photoOperation, setPhotoOperation] = React.useState<'save' | 'upload' | 'bulk' | 'reload' | null>(null);
  const [uploadingSlot, setUploadingSlot] = React.useState<PhotoSlot | null>(null);
  const [pendingUpload, setPendingUpload] = React.useState<PendingPhotoUpload | null>(null);
  const [pendingConflict, setPendingConflict] = React.useState<PendingPhotoConflict | null>(null);
  const [uploadError, setUploadError] = React.useState('');
  const savingStudentPhotos = photoOperation === 'save';
  const applyingBulk = photoOperation === 'bulk';
  const photoBusy = photoOperation !== null;
  const photoEditsDisabled = !scopeLoaded || loadingData || photoBusy || pendingUpload !== null;

  const [driveStatus, setDriveStatus] = React.useState<{ checked: boolean; ok: boolean; folderName?: string; error?: string }>({ checked: false, ok: true });
  const [previewImageModal, setPreviewImageModal] = React.useState<{
    url: string; title: string; scope: ElementaryMonthlyPhotoScope;
  } | null>(null);
  const [cropDialog, setCropDialog] = React.useState<{
    key: string; target: PhotoSlot; url: string; title: string; scope: ElementaryMonthlyPhotoScope;
    cropSettings?: ElementaryMonthlyCropSettings;
  } | null>(null);
  const [isBulkApplyOpen, setIsBulkApplyOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [applySnapshotsSelection, setApplySnapshotsSelection] = React.useState<Record<number, boolean>>({ 0: false, 1: false, 2: false });
  const [applyAlbumLink, setApplyAlbumLink] = React.useState(false);
  const [selectedStudentIdsForBulk, setSelectedStudentIdsForBulk] = React.useState<string[]>([]);
  const [bulkMode, setBulkMode] = React.useState<'skip-existing' | 'replace'>('skip-existing');
  const [replacementConfirmed, setReplacementConfirmed] = React.useState(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  React.useEffect(() => {
    let disposed = false;
    setDriveStatus({ checked: false, ok: true });
    if (!classId || !selectedYear || !selectedSemester || !selectedMonth) return;
    void verifyElementaryMonthlyDriveRoot({ classId, academicYear: selectedYear, semester: selectedSemester, month: selectedMonth }).then(result => {
      if (!disposed) setDriveStatus({ checked: true, ...result });
    });
    return () => { disposed = true; };
  }, [contextKey, classId, selectedYear, selectedSemester, selectedMonth, currentUser?.uid]);

  const updateDraft = (key: string, update: (draft: StudentPhotoDraft) => StudentPhotoDraft, fallback = activeDraft) => {
    const existingDraft = draftsRef.current[key];
    const next = { ...draftsRef.current, [key]: update(existingDraft?.dirty ? existingDraft : fallback) };
    draftsRef.current = next;
    if (mountedRef.current) setDrafts(next);
  };
  const setSnapshots = (update: React.SetStateAction<PhotoSnapshots>) => {
    updateDraft(activeKey, draft => ({
      ...draft, snapshots: typeof update === 'function' ? update(draft.snapshots) : update, dirty: true,
    }));
  };
  const setStudentAlbumLink = (albumLink: string) => updateDraft(activeKey, draft => ({ ...draft, albumLink, dirty: true }));

  const acceptSavedDoc = (doc: ElementaryMonthlyStudentPhotoDoc, key: string, savedContext: string, pending?: PendingPhotoUpload) => {
    if (mountedRef.current && contextRef.current === savedContext) {
      setPhotoData(previous => ({
        contextKey: savedContext,
        map: { ...(previous.contextKey === savedContext ? previous.map : {}), [doc.studentId]: doc },
      }));
    }
    updateDraft(key, previous => {
      const saved = createPhotoDraft(doc);
      if (!pending?.preserveDraft || !previous.dirty) return saved;
      if (pending.target === 'identity') {
        return { ...previous, identityPhotoUrl: saved.identityPhotoUrl, identityPhoto: saved.identityPhoto, revision: saved.revision };
      }
      const nextSnapshots = [...previous.snapshots] as PhotoSnapshots;
      nextSnapshots[pending.target] = { ...saved.snapshots[pending.target], caption: previous.snapshots[pending.target].caption };
      return { ...previous, snapshots: nextSnapshots, revision: saved.revision };
    }, createPhotoDraft(doc));
  };

  const beginOperation = (kind: NonNullable<typeof photoOperation>) => {
    if (operationRef.current) return null;
    const token = Symbol(kind);
    operationRef.current = token;
    setPhotoOperation(kind);
    return token;
  };
  const endOperation = (token: symbol) => {
    if (operationRef.current !== token) return;
    operationRef.current = null;
    if (mountedRef.current) { setPhotoOperation(null); setUploadingSlot(null); }
  };

  const loadData = React.useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!classId || !selectedYear || !selectedSemester || !selectedMonth) return;
    setLoadingData(true);
    try {
      const [project, photos] = await Promise.all([
        fetchElementaryMonthlyProjectDoc(classId, selectedYear, selectedSemester, selectedMonth),
        fetchElementaryMonthlyStudentPhotos(classId, selectedYear, selectedSemester, selectedMonth),
      ]);
      if (!mountedRef.current || generation !== loadGeneration.current || contextRef.current !== contextKey) return;
      setProjectDoc(project);
      setProjectTitle(project?.projectTitle || '');
      setProjectOverview(project?.projectOverview || '');
      setSharedAlbumLink(project?.sharedAlbumLink || '');
      setPhotoData({ contextKey, map: photos });
    } catch (error: unknown) {
      if (mountedRef.current && generation === loadGeneration.current) {
        toast.error(error instanceof Error ? error.message : 'Gagal memuat dokumentasi proyek dan foto.');
      }
    } finally {
      if (mountedRef.current && generation === loadGeneration.current) setLoadingData(false);
    }
  }, [classId, selectedYear, selectedSemester, selectedMonth, contextKey]);

  React.useEffect(() => { void loadData(); }, [loadData]);
  React.useEffect(() => {
    setIsBulkApplyOpen(false);
    setCropDialog(null);
    setPreviewImageModal(null);
  }, [contextKey, activeStudent?.id]);
  React.useEffect(() => {
    if (students.length > 0 && !students.some(student => student.id === activeStudentId)) setActiveStudentId(students[0].id);
  }, [students, activeStudentId]);
  React.useEffect(() => {
    const hasDrafts = Object.values<StudentPhotoDraft>(drafts).some(draft => draft.dirty);
    if (!hasDrafts && !pendingUpload && !photoBusy) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [drafts, pendingUpload, photoBusy]);

  const persistDraft = async (scope: ElementaryMonthlyPhotoScope, studentName: string, key: string, savedContext: string, draft: StudentPhotoDraft) => {
    const saved = await saveElementaryMonthlyStudentPhotoDoc({
      ...scope, studentName, identityPhotoUrl: draft.identityPhotoUrl.trim(), identityPhoto: draft.identityPhoto,
      snapshots: draft.snapshots, albumLink: draft.albumLink.trim(), revision: draft.revision,
    }, currentUser);
    acceptSavedDoc(saved, key, savedContext);
    return saved;
  };

  const handleSaveProjectOverview = async () => {
    if (!selectedClass || loadingData || savingProject) return;
    if (!projectTitle.trim()) { toast.error('Judul Proyek wajib diisi.'); return; }
    const savedContext = contextKey;
    const projectInput = {
      classId, className: selectedClass.name, gradeLevel: Number(selectedClass.grade) || 1,
      academicYear: selectedYear, semester: selectedSemester, month: selectedMonth,
      projectTitle: projectTitle.trim(), projectOverview: projectOverview.trim(), sharedAlbumLink: sharedAlbumLink.trim(),
    };
    setSavingProject(true);
    try {
      await saveElementaryMonthlyProjectDoc(projectInput, currentUser);
      if (mountedRef.current && contextRef.current === savedContext) {
        setProjectDoc(previous => ({ ...previous, ...projectInput } as ElementaryMonthlyProjectDoc));
      }
      toast.success('Overview Proyek Kelas berhasil disimpan.');
    } catch (error: unknown) {
      toast.error('Gagal menyimpan overview proyek: ' + (error instanceof Error ? error.message : 'Silakan coba lagi.'));
    } finally {
      if (mountedRef.current) setSavingProject(false);
    }
  };

  const runUpload = async (pending: PendingPhotoUpload) => {
    const uploaded = await uploadElementaryMonthlyPhotoToSharedDrive(pending.request);
    acceptSavedDoc(uploaded.photoDoc, pending.key, pending.contextKey, pending);
    clearStoredUpload(pending.storageKey);
    if (mountedRef.current) { setPendingUpload(null); setPendingConflict(null); setUploadError(''); }
    toast.success(`Foto ${pending.studentName} tersimpan di Drive dan dokumentasi laporan.`);
  };

  const recordUploadError = (error: unknown, pending?: PendingPhotoUpload) => {
    const message = error instanceof Error ? error.message : 'Status unggahan belum dapat dipastikan.';
    const canDiscard = error instanceof ElementaryMonthlyPhotoError && !error.retryable && !error.driveFileId && !pending?.recovering;
    if (canDiscard) {
      if (pending) clearStoredUpload(pending.storageKey);
      if (mountedRef.current) { setPendingUpload(null); setPendingConflict(null); }
    } else if (pending && mountedRef.current) {
      // A later authentication error cannot disprove an earlier successful Drive write.
      setPendingUpload({ ...pending, recovering: true });
    }
    if (pending && mountedRef.current && error instanceof ElementaryMonthlyPhotoError && error.code === 'PHOTO_REVISION_CONFLICT' && error.driveFileId) {
      setPendingConflict({ operationId: pending.request.operationId, loaded: false, photoDoc: null, confirmed: false });
    }
    if (mountedRef.current) setUploadError(message);
    toast.error(message);
  };

  const handleUploadPhoto = async (file: File, target: PhotoSlot) => {
    if (!activeStudent || !selectedClass || photoEditsDisabled) return;
    const token = beginOperation('upload');
    if (!token) return;
    const scope = { ...activeScope };
    const key = activeKey;
    const savedContext = contextKey;
    const studentName = activeStudent.name;
    const draft = draftsRef.current[key]?.dirty ? draftsRef.current[key] : activeDraft;
    const storageKey = getUploadStorageKey(scope, target, file, currentUser?.uid || '');
    const restoredRequest = readStoredUpload(storageKey);
    let pending: PendingPhotoUpload | undefined;
    setUploadingSlot(target);
    setUploadError('');
    try {
      let savedDraft = draft;
      if (draft.dirty && !restoredRequest) {
        savedDraft = createPhotoDraft(await persistDraft(scope, studentName, key, savedContext, draft));
      }
      const isIdentity = target === 'identity';
      const previousVersion = isIdentity ? savedDraft.identityPhoto?.version || 0 : savedDraft.snapshots[target].version || 0;
      const request: PhotoUploadParams = restoredRequest ? { ...restoredRequest, file, user: currentUser } : {
        file, ...scope, studentName, className: selectedClass.name,
        gradeLevel: Number(selectedClass.grade) || 1, gradeCategory: 'Lower Grade',
        slot: isIdentity ? 'profile' : `activity${target + 1}` as 'activity1' | 'activity2' | 'activity3',
        version: previousVersion + 1, expectedRevision: savedDraft.revision, operationId: createOperationId(),
        caption: isIdentity ? '' : savedDraft.snapshots[target].caption,
        cropSettings: { fit: 'contain', x: 50, y: 50, zoom: 1, aspectRatio: isIdentity ? ELEMENTARY_MONTHLY_IDENTITY_ASPECT_RATIO : ELEMENTARY_MONTHLY_SNAPSHOT_ASPECT_RATIO },
        user: currentUser,
      };
      pending = { key, contextKey: savedContext, studentName, target, request, storageKey, preserveDraft: !!restoredRequest && draft.dirty, recovering: !!restoredRequest };
      storeUpload(storageKey, request);
      if (mountedRef.current) setPendingUpload(pending);
      await runUpload(pending);
    } catch (error: unknown) {
      recordUploadError(error, pending);
    } finally {
      endOperation(token);
    }
  };

  const handleRetryUpload = async () => {
    if (!pendingUpload || pendingConflict) return;
    const token = beginOperation('upload');
    if (!token) return;
    const pending = pendingUpload;
    setUploadingSlot(pending.target);
    setUploadError('');
    try { await runUpload(pending); }
    catch (error: unknown) { recordUploadError(error, pending); }
    finally { endOperation(token); }
  };

  const handleLoadPendingConflict = async () => {
    if (!pendingUpload || !pendingConflict) return;
    const token = beginOperation('reload');
    if (!token) return;
    const pending = pendingUpload;
    const request = pending.request;
    setPendingConflict(previous => previous ? { ...previous, loaded: false, confirmed: false } : previous);
    try {
      const latest = await fetchElementaryMonthlyStudentPhotos(request.classId, request.academicYear, request.semester, request.month);
      if (mountedRef.current) {
        setPendingConflict(previous => previous?.operationId === request.operationId
          ? { ...previous, loaded: true, photoDoc: latest[request.studentId] || null, confirmed: false } : previous);
        if (contextRef.current === pending.contextKey) setPhotoData({ contextKey: pending.contextKey, map: latest });
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Gagal memuat foto tersimpan untuk memeriksa konflik.');
    } finally { endOperation(token); }
  };

  const handleConfirmPendingReplacement = async () => {
    if (!pendingUpload || !pendingConflict?.loaded || !pendingConflict.confirmed || pendingConflict.operationId !== pendingUpload.request.operationId) return;
    const token = beginOperation('upload');
    if (!token) return;
    const pending: PendingPhotoUpload = {
      ...pendingUpload,
      request: { ...pendingUpload.request, expectedRevision: pendingConflict.photoDoc?.revision ?? 0 },
      recovering: true,
    };
    storeUpload(pending.storageKey, pending.request);
    setPendingUpload(pending);
    setPendingConflict(null);
    setUploadingSlot(pending.target);
    setUploadError('');
    try { await runUpload(pending); }
    catch (error: unknown) { recordUploadError(error, pending); }
    finally { endOperation(token); }
  };

  const handleSaveStudentPhotos = async () => {
    if (!activeStudent || photoEditsDisabled) return;
    const token = beginOperation('save');
    if (!token) return;
    const name = activeStudent.name;
    try {
      await persistDraft({ ...activeScope }, name, activeKey, contextKey, draftsRef.current[activeKey]?.dirty ? draftsRef.current[activeKey] : activeDraft);
      toast.success(`Dokumentasi foto ${name} berhasil disimpan.`);
    } catch (error: unknown) {
      toast.error('Gagal menyimpan foto siswa: ' + (error instanceof Error ? error.message : 'Silakan coba lagi.'));
    } finally { endOperation(token); }
  };

  const handleDiscardDraft = async () => {
    if (!activeStudent || photoEditsDisabled) return;
    const token = beginOperation('reload');
    if (!token) return;
    const scope = { ...activeScope };
    const key = activeKey;
    const savedContext = contextKey;
    try {
      const latest = await fetchElementaryMonthlyStudentPhotos(scope.classId, scope.academicYear, scope.semester, scope.month);
      if (mountedRef.current && contextRef.current === savedContext) setPhotoData({ contextKey: savedContext, map: latest });
      updateDraft(key, () => createPhotoDraft(latest[scope.studentId]));
      toast.success('Dokumentasi tersimpan dimuat kembali.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Gagal memuat ulang dokumentasi.');
    } finally { endOperation(token); }
  };

  const handleOpenBulkModal = () => {
    if (!activeStudent || photoEditsDisabled) return;
    setSelectedStudentIdsForBulk([]);
    setApplySnapshotsSelection({ 0: !!snapshots[0].url, 1: !!snapshots[1].url, 2: !!snapshots[2].url });
    setApplyAlbumLink(!!studentAlbumLink.trim());
    setBulkMode('skip-existing');
    setReplacementConfirmed(false);
    setIsBulkApplyOpen(true);
  };

  const handleExecuteBulkApply = async () => {
    if (!activeStudent || photoEditsDisabled) return;
    const targetIds = selectedStudentIdsForBulk.filter(id => id !== activeStudent.id && students.some(student => student.id === id));
    if (targetIds.length === 0) { toast.error('Pilih setidaknya satu siswa target.'); return; }
    if (bulkMode === 'replace' && !replacementConfirmed) { toast.error('Konfirmasikan penggantian foto individual terlebih dahulu.'); return; }
    const sourceDraft = draftsRef.current[activeKey]?.dirty ? draftsRef.current[activeKey] : activeDraft;
    const snapshotIndices = [0, 1, 2].filter(index => applySnapshotsSelection[index] && sourceDraft.snapshots[index].url.trim());
    const copyAlbum = applyAlbumLink && !!sourceDraft.albumLink.trim();
    if (snapshotIndices.length === 0 && !copyAlbum) { toast.error('Pilih foto atau tautan album sumber yang sudah terisi.'); return; }
    const hasTargetDrafts = targetIds.some(id => draftsRef.current[getPhotoDraftKey({ ...activeScope, studentId: id })]?.dirty);
    if (hasTargetDrafts) { toast.error('Simpan atau batalkan draf siswa target terlebih dahulu agar perubahan individual tetap terjaga.'); return; }
    const token = beginOperation('bulk');
    if (!token) return;
    const scope = { ...activeScope };
    const key = activeKey;
    const savedContext = contextKey;
    try {
      const sourceDoc = sourceDraft.dirty
        ? await persistDraft(scope, activeStudent.name, key, savedContext, sourceDraft)
        : photosMap[activeStudent.id];
      const result = await bulkApplyElementaryMonthlyPhotos({
        classId: scope.classId, academicYear: scope.academicYear, semester: scope.semester, month: scope.month,
        sourceStudentId: scope.studentId, sourceRevision: sourceDoc?.revision || sourceDraft.revision,
        snapshotIndices, applyAlbumLink: copyAlbum, targetStudentIds: targetIds,
        mode: bulkMode, replacementConfirmed, existingPhotosMap: photosMap, user: currentUser,
      });
      for (const doc of Object.values(result.photoDocs)) acceptSavedDoc(doc, getPhotoDraftKey({ ...scope, studentId: doc.studentId }), savedContext);
      if (mountedRef.current) setIsBulkApplyOpen(false);
      toast.success(`Dokumentasi diterapkan ke ${result.count} siswa. ${result.skipped.length} komponen dilewati untuk menjaga data individual.`);
    } catch (error: unknown) {
      toast.error('Gagal menerapkan bersama: ' + (error instanceof Error ? error.message : 'Silakan coba lagi.'));
    } finally { endOperation(token); }
  };

  const handleApplyCrop = (cropSettings: ElementaryMonthlyCropSettings) => {
    if (!cropDialog || cropDialog.key !== activeKey) return;
    const dialog = cropDialog;
    updateDraft(dialog.key, draft => {
      if (dialog.target === 'identity') {
        return { ...draft, identityPhotoUrl: dialog.url, identityPhoto: { ...draft.identityPhoto, url: dialog.url, cropSettings }, dirty: true };
      }
      const next = [...draft.snapshots] as PhotoSnapshots;
      next[dialog.target] = { ...next[dialog.target], cropSettings };
      return { ...draft, snapshots: next, dirty: true };
    });
    setCropDialog(null);
  };

  // Filtered students list
  const filteredStudents = React.useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s => s.name.toLowerCase().includes(q) || (s.nis && s.nis.includes(q)));
  }, [students, searchQuery]);

  const conflictPhoto = pendingUpload?.target === 'identity'
    ? pendingConflict?.photoDoc?.identityPhoto || (pendingConflict?.photoDoc?.identityPhotoUrl ? { url: pendingConflict.photoDoc.identityPhotoUrl } : null)
    : pendingUpload ? pendingConflict?.photoDoc?.snapshots[pendingUpload.target] : null;

  return (
    <div className="space-y-6">
      {!scopeLoaded && !loadingData && selectedClass && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span>Dokumentasi periode ini belum berhasil dimuat.</span>
          <button type="button" onClick={() => void loadData()} className="font-bold underline">Muat Ulang</button>
        </div>
      )}
      {driveStatus.checked && !driveStatus.ok && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Akses folder foto belum berhasil diverifikasi: {driveStatus.error}
        </div>
      )}
      {pendingUpload && (
        <div role="status" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-semibold">Unggahan foto {pendingUpload.studentName} {photoBusy ? 'sedang diproses' : 'belum terkonfirmasi selesai'}.</p>
          <p>{pendingUpload.request.className} · {pendingUpload.request.month} · {pendingUpload.target === 'identity' ? 'Foto identitas' : `Snapshot #${pendingUpload.target + 1}`}</p>
          <p>{uploadError || 'Menunggu penyimpanan file dan referensi foto siswa selesai.'}</p>
          {!photoBusy && !pendingConflict && (
            <>
              <p>Coba lagi dengan operasi yang sama untuk memulihkan penyimpanan tanpa mengunggah versi ganda.</p>
              <button type="button" onClick={handleRetryUpload} className="rounded-lg bg-amber-700 px-3 py-2 font-bold text-white">
                Coba Lagi / Pulihkan Unggahan
              </button>
            </>
          )}
          {pendingConflict && (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-white/70 p-3">
              <p>Slot foto berubah sejak unggahan dimulai. Periksa dokumentasi terbaru sebelum memutuskan untuk menggantinya.</p>
              <button type="button" disabled={photoBusy} onClick={handleLoadPendingConflict} className="font-bold underline disabled:opacity-50">
                {photoBusy ? 'Memproses...' : pendingConflict.loaded ? 'Muat Ulang Foto Tersimpan' : 'Periksa Foto Tersimpan Saat Ini'}
              </button>
              {pendingConflict.loaded && (
                <>
                  <div className="w-40 overflow-hidden rounded-lg border border-slate-300 bg-slate-100" style={{ aspectRatio: pendingUpload.target === 'identity' ? ELEMENTARY_MONTHLY_IDENTITY_ASPECT_RATIO : ELEMENTARY_MONTHLY_SNAPSHOT_ASPECT_RATIO }}>
                    {conflictPhoto?.url ? (
                      <ElementaryMonthlyPhotoImage
                        src={conflictPhoto.url}
                        scope={{ classId: pendingUpload.request.classId, studentId: pendingUpload.request.studentId, academicYear: pendingUpload.request.academicYear, semester: pendingUpload.request.semester, month: pendingUpload.request.month }}
                        alt={`Foto tersimpan ${pendingUpload.studentName}`}
                        cropSettings={conflictPhoto.cropSettings}
                      />
                    ) : <div className="p-3 text-xs text-slate-500">Slot ini belum memiliki foto khusus yang tersimpan.</div>}
                  </div>
                  {pendingUpload.target !== 'identity' && pendingConflict.photoDoc?.snapshots[pendingUpload.target]?.caption && (
                    <p>Caption tersimpan: {pendingConflict.photoDoc.snapshots[pendingUpload.target].caption}</p>
                  )}
                  <label className="flex items-start gap-2 font-semibold">
                    <input type="checkbox" disabled={photoBusy} checked={pendingConflict.confirmed}
                      onChange={event => setPendingConflict(previous => previous ? { ...previous, confirmed: event.target.checked } : previous)} />
                    <span>Saya menyetujui penggantian slot ini dengan foto dan caption dari unggahan tertunda.</span>
                  </label>
                  <button type="button" disabled={photoBusy || !pendingConflict.confirmed} onClick={handleConfirmPendingReplacement}
                    className="rounded-lg bg-amber-700 px-3 py-2 font-bold text-white disabled:opacity-50">
                    Ganti slot ini dengan unggahan tertunda
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {/* SECTION 1: Class Project Overview Card */}
      <fieldset disabled={!scopeLoaded || loadingData || savingProject || photoBusy} className="min-w-0 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Dokumentasi Proyek Kelas ({monthLabel})
              </h2>
              <p className="text-xs text-slate-500">
                Judul dan deskripsi rangkuman aktivitas proyek yang berlaku untuk seluruh siswa di kelas {selectedClass?.name}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenBulkModal}
              disabled={photoEditsDisabled || students.length < 2}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Copy size={14} />
              <span>Terapkan Bersama ke Siswa...</span>
            </button>

            <button
              type="button"
              onClick={handleSaveProjectOverview}
              disabled={savingProject}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {savingProject ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              <span>Simpan Overview</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Judul Proyek Bulanan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Contoh: Eksplorasi Ekosistem & Pemanfaatan Barang Bekas"
              className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Judul utama proyek tema pembelajaran di bulan ini.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tautan Album Dokumentasi Bersama (Opsional)
            </label>
            <div className="relative">
              <input
                type="url"
                value={sharedAlbumLink}
                onChange={(e) => setSharedAlbumLink(e.target.value)}
                placeholder="https://photos.app.goo.gl/... atau Google Drive link"
                className="w-full text-xs pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
              <Link size={14} className="absolute left-2.5 top-3 text-slate-400" />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Tautan album galeri lengkap bagi orang tua untuk melihat rekaman dokumentasi kegiatan.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Deskripsi Rangkuman Proyek (Project Overview)
            </label>
            <textarea
              rows={3}
              value={projectOverview}
              onChange={(e) => setProjectOverview(e.target.value)}
              placeholder="Jelaskan tujuan kegiatan proyek, kolaborasi siswa, dan produk belajar yang dihasilkan..."
              className="w-full text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>
        </div>
      </fieldset>

      {/* SECTION 2: Students List & Individual Student Photos Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Students List Panel (4 Cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-emerald-700" />
              <span className="text-xs font-bold text-slate-800">Daftar Siswa ({students.length})</span>
            </div>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama siswa..."
            className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />

          <div className="max-h-[580px] overflow-y-auto space-y-1.5 pr-1">
            {filteredStudents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Tidak ada siswa ditemukan.</p>
            ) : (
              filteredStudents.map((s, idx) => {
                const sDoc = photosMap[s.id];
                const identity = resolveElementaryMonthlyIdentityPhoto(sDoc, (s as Student & { photoUrl?: string }).photoUrl);
                const filledPhotos = (sDoc?.snapshots || []).filter(snap => Boolean(snap.url)).length;
                const isSelected = s.id === activeStudentId;

                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={loadingData || photoBusy}
                    onClick={() => setActiveStudentId(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white hover:bg-slate-50 border-transparent text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[11px] font-mono text-slate-400 w-5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex-shrink-0 overflow-hidden flex items-center justify-center text-slate-500">
                        {identity?.url ? (
                          <ElementaryMonthlyPhotoImage
                            src={identity.url}
                            scope={{ ...activeScope, studentId: s.id }}
                            alt={`Foto ${s.name}`}
                            cropSettings={identity.cropSettings}
                            compact
                          />
                        ) : (
                          <UserIcon size={14} />
                        )}
                      </div>
                      <span className="text-xs truncate">{s.name}</span>
                    </div>

                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                      filledPhotos === 3
                        ? 'bg-emerald-100 text-emerald-800'
                        : filledPhotos > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {filledPhotos}/3 Foto
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Student Photos & Captions Form (8 Cols) */}
        <fieldset disabled={photoEditsDisabled} className="min-w-0 lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
          {activeStudent ? (
            <>
              {/* Active Student Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-[60px] rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                    {activeIdentityPhoto?.url ? (
                      <ElementaryMonthlyPhotoImage
                        src={activeIdentityPhoto.url}
                        scope={activeScope}
                        alt={activeStudent.name}
                        cropSettings={activeIdentityPhoto.cropSettings}
                        compact
                      />
                    ) : (
                      <UserIcon size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{activeStudent.name}</h3>
                    <p className="text-xs text-slate-500">
                      NIS: {activeStudent.nis || '-'} · Kelas {selectedClass?.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveStudentPhotos}
                    disabled={photoEditsDisabled}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingStudentPhotos ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    <span>Simpan Dokumentasi Siswa</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <p>Foto yang selesai diunggah langsung tersimpan. Simpan perubahan caption, posisi foto, dan tautan dengan tombol Simpan Dokumentasi Siswa.</p>
                {activeDraft.dirty && (
                  <div className="flex items-center gap-3 text-amber-800">
                    <span className="font-semibold">Ada perubahan draf yang belum disimpan.</span>
                    <button type="button" onClick={handleDiscardDraft} className="font-semibold underline">Buang Draf &amp; Muat Ulang</button>
                  </div>
                )}
              </div>

              {/* Identity Photo Override (Optional) */}
              <div className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-800">Foto Profil Khusus Monthly Report</span>
                  <p className="text-[11px] text-slate-500">
                    Secara default menggunakan foto master siswa. Unggah jika ada foto formal/terbaru untuk laporan bulan ini.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {studentIdentityPhoto && (
                    <button
                      type="button"
                      onClick={() => updateDraft(activeKey, draft => ({ ...draft, identityPhotoUrl: '', identityPhoto: null, dirty: true }))}
                      className="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg font-semibold"
                    >
                      Reset Master
                    </button>
                  )}
                  {activeIdentityPhoto?.url && (
                    <button type="button" onClick={() => setCropDialog({
                      key: activeKey, target: 'identity', url: activeIdentityPhoto.url!, title: `Atur Foto Identitas - ${activeStudent.name}`,
                      scope: { ...activeScope }, cropSettings: activeIdentityPhoto.cropSettings,
                    })} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                      <Crop size={13} /> Atur Tampilan
                    </button>
                  )}
                  <label className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer flex items-center gap-1.5">
                    <Upload size={13} />
                    <span>{uploadingSlot === 'identity' ? 'Mengunggah...' : 'Pilih Foto Profil'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (file) void handleUploadPhoto(file, 'identity');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* 3 Project Snapshots Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    3 Foto Project Snapshot &amp; Caption
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Tampilan mengikuti bingkai foto pada laporan
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((idx) => {
                    const snap = snapshots[idx];
                    const isUploadingThis = uploadingSlot === idx;

                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-colors flex flex-col justify-between space-y-3"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span>Snapshot #{idx + 1}</span>
                          {snap.url && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title="Lihat Foto"
                                onClick={() => setPreviewImageModal({ url: snap.url, title: `Snapshot #${idx + 1} - ${activeStudent.name}`, scope: { ...activeScope } })}
                                className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                              >
                                <Eye size={13} />
                              </button>
                              <button type="button" title="Atur Tampilan Foto" onClick={() => setCropDialog({
                                key: activeKey, target: idx as 0 | 1 | 2, url: snap.url, title: `Atur Snapshot #${idx + 1} - ${activeStudent.name}`,
                                scope: { ...activeScope }, cropSettings: snap.cropSettings,
                              })} className="rounded p-1 text-slate-600 hover:bg-slate-200">
                                <Crop size={13} />
                              </button>
                              <button
                                type="button"
                                title="Hapus Foto"
                                onClick={() => {
                                  setSnapshots(prev => {
                                    const next = [...prev] as [ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot];
                                    next[idx] = { index: idx, url: '', caption: next[idx].caption };
                                    return next;
                                  });
                                }}
                                className="p-1 hover:bg-red-100 rounded text-red-600 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Image Preview Box */}
                        <div className="relative w-full bg-slate-200 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center" style={{ aspectRatio: ELEMENTARY_MONTHLY_SNAPSHOT_ASPECT_RATIO }}>
                          {snap.url ? (
                            <ElementaryMonthlyPhotoImage
                              src={snap.url}
                              scope={activeScope}
                              alt={`Snapshot ${idx + 1}`}
                              cropSettings={snap.cropSettings}
                            />
                          ) : (
                            <div className="text-center p-3 text-slate-400 space-y-1">
                              <ImageIcon size={24} className="mx-auto text-slate-300" />
                              <span className="text-[10px] font-medium block">Belum ada foto</span>
                            </div>
                          )}

                          {isUploadingThis && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold">
                              <RefreshCw size={18} className="animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Upload Button */}
                        <label className="w-full py-1.5 px-3 text-center text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer block transition-colors shadow-2xs">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.currentTarget.value = '';
                              if (file) void handleUploadPhoto(file, idx as 0 | 1 | 2);
                            }}
                          />
                          <span>{snap.url ? 'Ganti Foto' : 'Unggah Foto'}</span>
                        </label>

                        {/* Caption input */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                            Caption Deskripsi
                          </label>
                          <textarea
                            rows={2}
                            value={snap.caption || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSnapshots(prev => {
                                const next = [...prev] as [ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot, ElementaryMonthlyPhotoSnapshot];
                                next[idx] = { ...next[idx], caption: val };
                                return next;
                              });
                            }}
                            placeholder="Aktivitas yang dilakukan siswa..."
                            className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Album Link */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tautan Album Foto Siswa (Opsional)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={studentAlbumLink}
                    onChange={(e) => setStudentAlbumLink(e.target.value)}
                    placeholder="https://photos.app.goo.gl/... tautan album khusus siswa ini"
                    className="w-full text-xs pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <Link size={14} className="absolute left-2.5 top-3 text-slate-400" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Jika dikosongkan, laporan akan memakai tautan album bersama kelas (jika ada).
                </p>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400">Pilih siswa di sebelah kiri untuk mengedit foto.</div>
          )}
        </fieldset>
      </div>

      {/* MODAL 1: Bulk Apply Confirmation Modal */}
      {isBulkApplyOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <fieldset disabled={applyingBulk} className="min-w-0 max-h-[90vh] overflow-y-auto bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Copy size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Terapkan Dokumentasi Bersama ke Siswa</h3>
                  <p className="text-xs text-slate-500">Salin foto kegiatan &amp; caption siswa aktif ke siswa lainnya.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkApplyOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            {/* Select what components to copy */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Komponen yang Disalin:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[0, 1, 2].map((idx) => (
                  <label
                    key={idx}
                    className={`p-2.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                      applySnapshotsSelection[idx] ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!snapshots[idx].url.trim()}
                      checked={applySnapshotsSelection[idx]}
                      onChange={(e) => setApplySnapshotsSelection(prev => ({ ...prev, [idx]: e.target.checked }))}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Snapshot #{idx + 1}</span>
                  </label>
                ))}
                <label
                  className={`p-2.5 rounded-xl border text-xs font-semibold cursor-pointer flex items-center gap-2 ${
                    applyAlbumLink ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!studentAlbumLink.trim()}
                    checked={applyAlbumLink}
                    onChange={(e) => setApplyAlbumLink(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Link Album</span>
                </label>
              </div>
              <p className="text-[11px] text-slate-500">Komponen sumber yang kosong tidak akan menghapus dokumentasi siswa target.</p>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700">
              <span className="block font-bold">Jika siswa target sudah memiliki dokumentasi:</span>
              <label className="flex items-start gap-2">
                <input type="radio" name="monthly-photo-bulk-mode" value="skip-existing" checked={bulkMode === 'skip-existing'}
                  onChange={() => { setBulkMode('skip-existing'); setReplacementConfirmed(false); }} />
                <span>Pertahankan foto/caption individual; isi hanya komponen yang kosong.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="monthly-photo-bulk-mode" value="replace" checked={bulkMode === 'replace'}
                  onChange={() => { setBulkMode('replace'); setReplacementConfirmed(false); }} />
                <span>Ganti komponen terpilih pada siswa target dengan dokumentasi sumber.</span>
              </label>
              {bulkMode === 'replace' && (
                <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 font-semibold text-amber-900">
                  <input type="checkbox" checked={replacementConfirmed} onChange={event => setReplacementConfirmed(event.target.checked)} />
                  <span>Saya memahami foto dan caption individual pada komponen terpilih akan diganti. Laporan yang sudah terbit tetap memakai snapshot sebelumnya.</span>
                </label>
              )}
            </div>

            {/* Target Students Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Target Siswa ({selectedStudentIdsForBulk.length}/{Math.max(0, students.length - 1)}):
                </span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIdsForBulk(students.filter(student => student.id !== activeStudent?.id && !drafts[getPhotoDraftKey({ ...activeScope, studentId: student.id })]?.dirty).map(student => student.id))}
                    className="text-emerald-700 hover:underline font-bold"
                  >
                    Pilih Semua
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIdsForBulk([])}
                    className="text-slate-500 hover:underline font-bold"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>

              <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50/50">
                {students.filter(student => student.id !== activeStudent?.id).map((s) => {
                  const isChecked = selectedStudentIdsForBulk.includes(s.id);
                  const hasDraft = drafts[getPhotoDraftKey({ ...activeScope, studentId: s.id })]?.dirty;
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white text-xs cursor-pointer select-none text-slate-700"
                    >
                      <input
                        type="checkbox"
                        disabled={hasDraft}
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIdsForBulk(prev => [...prev, s.id]);
                          } else {
                            setSelectedStudentIdsForBulk(prev => prev.filter(id => id !== s.id));
                          }
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="truncate">{s.name}{hasDraft ? ' — simpan/batalkan draf dahulu' : ''}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
              <p>
                Sumber: {activeStudent?.name}. Perubahan draf sumber disimpan sebelum penyalinan. Foto tetap dapat diganti dan caption tetap dapat diedit per siswa.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkApplyOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkApply}
                disabled={applyingBulk || selectedStudentIdsForBulk.length === 0 || (bulkMode === 'replace' && !replacementConfirmed)}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {applyingBulk ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Konfirmasi Terapkan Bersama</span>
              </button>
            </div>
          </fieldset>
        </div>
      )}

      {/* MODAL 2: Full Image Preview Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800">{previewImageModal.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImageModal(null)}
                className="p-1 hover:bg-slate-100 rounded text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="h-[65vh] flex items-center justify-center overflow-hidden rounded-xl bg-slate-950">
              <ElementaryMonthlyPhotoImage
                src={previewImageModal.url}
                scope={previewImageModal.scope}
                alt={previewImageModal.title}
                cropSettings={{ fit: 'contain', x: 50, y: 50, zoom: 1 }}
              />
            </div>
          </div>
        </div>
      )}
      {cropDialog && (
        <ElementaryMonthlyPhotoCropDialog
          key={`${cropDialog.key}:${cropDialog.target}`}
          src={cropDialog.url}
          scope={cropDialog.scope}
          title={cropDialog.title}
          cropSettings={cropDialog.cropSettings}
          aspectRatio={cropDialog.target === 'identity' ? ELEMENTARY_MONTHLY_IDENTITY_ASPECT_RATIO : ELEMENTARY_MONTHLY_SNAPSHOT_ASPECT_RATIO}
          onClose={() => setCropDialog(null)}
          onApply={handleApplyCrop}
        />
      )}
    </div>
  );
};
