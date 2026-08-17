import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { AttendanceCalendarEvent } from '../types';

/**
 * Checks if a given date string (YYYY-MM-DD) is a school day by default.
 * Default school days are Monday to Friday.
 * Saturday and Sunday are not school days.
 * Dates before 2026-07-20 are not counted for the academic year 2026/2027.
 */
export function isDefaultSchoolDay(dateStr: string): boolean {
  if (dateStr < '2026-07-20') return false;
  
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);
  
  const localDate = new Date(year, month, day);
  const dayOfWeek = localDate.getDay(); // 0 = Sunday, 6 = Saturday
  
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

/**
 * Fetches an explicit override for a specific date and unit from attendance_calendar.
 */
export async function getAttendanceCalendarOverride(
  dateStr: string,
  unit: 'KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH'
): Promise<AttendanceCalendarEvent | null> {
  const docId = `${dateStr}_${unit}`;
  const docRef = doc(db, 'attendance_calendar', docId);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AttendanceCalendarEvent;
    }
  } catch (error) {
    console.error('Error fetching calendar override:', error);
  }
  return null;
}

/**
 * Checks if a given date is a school day for a unit, using calendar override if available,
 * otherwise falling back to Monday-Friday.
 */
export async function isAttendanceSchoolDay(
  dateStr: string,
  unit: 'KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH'
): Promise<boolean> {
  if (dateStr < '2026-07-20') return false;
  
  const override = await getAttendanceCalendarOverride(dateStr, unit);
  if (override) {
    return override.isSchoolDay;
  }
  
  return isDefaultSchoolDay(dateStr);
}

/**
 * Fetches all calendar overrides for a specific unit.
 * Used for batch processing or calculating ranges to avoid sequential network queries.
 */
export async function fetchAttendanceCalendarOverrides(
  unit: 'KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH'
): Promise<Map<string, AttendanceCalendarEvent>> {
  const overridesMap = new Map<string, AttendanceCalendarEvent>();
  try {
    const q = query(collection(db, 'attendance_calendar'), where('unit', '==', unit));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as AttendanceCalendarEvent;
      if (data.date) {
        overridesMap.set(data.date, data);
      }
    });
  } catch (error) {
    console.error('Error fetching attendance calendar overrides:', error);
  }
  return overridesMap;
}

/**
 * Calculates a list of school days (YYYY-MM-DD) since July 20, 2026, up to a specified end date.
 * Combines explicit overrides from attendance_calendar, legacy school_holidays, and default weekdays.
 */
export function calculateSchoolDaysSinceJuly20(
  endDateStr: string,
  overridesMap: Map<string, AttendanceCalendarEvent>,
  legacyHolidays: string[]
): string[] {
  const dates: string[] = [];
  const start = new Date('2026-07-20');
  
  const endParts = endDateStr.split('-');
  const endYear = parseInt(endParts[0], 10);
  const endMonth = parseInt(endParts[1], 10) - 1;
  const endDay = parseInt(endParts[2], 10);
  const endLimit = new Date(endYear, endMonth, endDay);
  
  const temp = new Date(start);
  while (temp <= endLimit) {
    const dStr = temp.getFullYear() + '-' + 
                 String(temp.getMonth() + 1).padStart(2, '0') + '-' + 
                 String(temp.getDate()).padStart(2, '0');
                 
    const override = overridesMap.get(dStr);
    let isSchool: boolean;
    
    if (override) {
      isSchool = override.isSchoolDay;
    } else {
      const day = temp.getDay();
      const isWeekend = day === 0 || day === 6;
      const isLegacyHoliday = legacyHolidays.includes(dStr);
      isSchool = !isWeekend && !isLegacyHoliday;
    }
    
    if (isSchool && dStr >= '2026-07-20' && dStr <= endDateStr) {
      dates.push(dStr);
    }
    
    temp.setDate(temp.getDate() + 1);
  }
  
  return dates;
}
