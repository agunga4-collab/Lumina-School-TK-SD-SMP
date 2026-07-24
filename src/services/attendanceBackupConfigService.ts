import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  AttendanceBackupConfig, 
  AttendanceBackupFileMap,
  AttendanceRecord,
  AttendanceSyncResult
} from '../types';

const CONFIG_DOC_ID = 'junior_high_attendance';
const CONFIG_COLLECTION = 'system_backup_configs';
const FILE_MAP_COLLECTION = 'attendance_backup_file_maps';

/**
 * Service to manage Attendance Backup Configuration in Firestore
 */
export const attendanceBackupConfigService = {
  /**
   * Get global backup configuration
   */
  async getConfig(): Promise<AttendanceBackupConfig | null> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as AttendanceBackupConfig;
      }
      return null;
    } catch (error) {
      console.error('Error fetching backup config:', error);
      return null;
    }
  },

  /**
   * Listen to config changes
   */
  subscribeToConfig(callback: (config: AttendanceBackupConfig | null) => void) {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data() as AttendanceBackupConfig);
      } else {
        callback(null);
      }
    });
  },

  /**
   * Save or update backup configuration
   */
  async saveConfig(config: AttendanceBackupConfig): Promise<void> {
    try {
      const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      await setDoc(docRef, {
        ...config,
        id: CONFIG_DOC_ID,
        lastUpdatedAt: Date.now()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving backup config:', error);
      throw error;
    }
  },

  /**
   * Get file map for a specific class and semester
   */
  async getFileMap(classId: string, academicYear: string, semester: '1' | '2'): Promise<AttendanceBackupFileMap | null> {
    try {
      const id = `${classId}_${academicYear.replace(/\//g, '-')}_S${semester}`;
      const docRef = doc(db, FILE_MAP_COLLECTION, id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as AttendanceBackupFileMap;
      }
      return null;
    } catch (error) {
      console.error('Error fetching file map:', error);
      return null;
    }
  },

  /**
   * Internal: Save file map after spreadsheet creation
   */
  async saveFileMap(fileMap: AttendanceBackupFileMap): Promise<void> {
    try {
      const docRef = doc(db, FILE_MAP_COLLECTION, fileMap.id);
      await setDoc(docRef, fileMap, { merge: true });
    } catch (error) {
      console.error('Error saving file map:', error);
      throw error;
    }
  }
};

/**
 * Service to trigger real-time sync via API (Backend)
 */
export const attendanceSyncService = {
  /**
   * Trigger sync for a specific record
   * This calls the backend to perform the actual Google Sheets update
   */
  async triggerSync(record: any): Promise<AttendanceSyncResult> {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      if (record.backupType === 'DHUHUR_ATTENDANCE') {
        const response = await fetch('/api/attendance/dhuhur/sync-batch', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            classId: record.classId,
            date: record.date,
            academicYearId: record.academicYearId,
            semester: record.semester,
            records: [{
              id: record.id,
              studentId: record.studentId,
              studentNameSnapshot: record.studentNameSnapshot,
              classNameSnapshot: record.classNameSnapshot,
              status: record.status,
              note: record.note || ''
            }]
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          return {
            recordId: record.id,
            success: false,
            timestamp: Date.now(),
            error: errorData.error || 'Server error'
          };
        }

        const resData = await response.json();
        return {
          recordId: record.id,
          success: resData.success !== false,
          timestamp: Date.now(),
          error: resData.error || null
        };
      }

      const response = await fetch('/api/attendance/sync-batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          classId: record.classId,
          date: record.date,
          academicYearId: record.academicYear.replace(/\//g, '-'),
          semester: record.semester,
          recordIds: [record.id]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          recordId: record.id,
          success: false,
          timestamp: Date.now(),
          error: errorData.error || 'Server error'
        };
      }

      const resData = await response.json();
      const itemResult = resData.results?.find((r: any) => r.id === record.id);
      return {
        recordId: record.id,
        success: itemResult ? itemResult.success : resData.success !== false,
        timestamp: Date.now(),
        error: itemResult?.error || resData.error || null,
        spreadsheetId: resData.spreadsheetId
      };
    } catch (error) {
      console.error('Sync trigger error:', error);
      return {
        recordId: record.id,
        success: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown network error'
      };
    }
  },

  /**
   * Download PDF recap from Google Sheets
   * This redirects to a backend endpoint that generates the PDF
   */
  async downloadPdfRecap(classId: string, academicYear: string, semester: '1' | '2'): Promise<void> {
    const academicYearId = academicYear.replace(/\//g, '-');
    const url = `/api/attendance/export-pdf?classId=${classId}&academicYear=${academicYearId}&semester=${semester}`;
    window.open(url, '_blank');
  }
};
