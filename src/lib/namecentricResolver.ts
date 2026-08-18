/**
 * Name-Centric Identity Resolver for Lumina Kindergarten
 * Matches student attendance and other legacy collections built around name-centric primary matching.
 */

export interface ResolvedStudentResult {
  resolvedStudentId: string | null;
  resolvedBy: 'id' | 'name' | 'ambiguous' | 'unresolved';
  originalStudentId: string;
  originalStudentName: string;
  resolvedStudentObj: any | null;
  warningMessage?: string;
}

/**
 * Normalizes a student's full name to clean, comparable format.
 * - Converts to lowercase
 * - Strips punctuation (dots, commas, dashes, quotes)
 * - Collapses redundant whitespace
 */
export function normalizeStudentName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[\.\,\-\'\"\`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds a fast lookup index from a list of active students.
 * Key is the normalized full name, value is an array of matching student objects.
 */
export function buildStudentNameIndex(activeStudents: any[]): Record<string, any[]> {
  const index: Record<string, any[]> = {};
  activeStudents.forEach((student) => {
    if (!student || !student.name) return;
    const normalized = normalizeStudentName(student.name);
    if (!normalized) return;
    if (!index[normalized]) {
      index[normalized] = [];
    }
    index[normalized].push(student);
  });
  return index;
}

/**
 * Resolves an incoming attendance/draft record to a single positive active student identity.
 */
export function resolveAttendanceStudent(params: {
  originalStudentId: string;
  originalStudentName: string;
  activeStudents: any[];
  nameIndex: Record<string, any[]>;
}): ResolvedStudentResult {
  const { originalStudentId, originalStudentName, activeStudents, nameIndex } = params;

  // 1. Try exact studentId/luminaId match first (if ID looks valid)
  if (originalStudentId && !originalStudentId.startsWith("INVITE_")) {
    const matchedById = activeStudents.find(
      (s) =>
        s.id === originalStudentId ||
        (s.luminaId && s.luminaId === originalStudentId) ||
        (s.oldLuminaId && s.oldLuminaId === originalStudentId) ||
        (s.nis && s.nis === originalStudentId)
    );
    if (matchedById) {
      console.log(`[NameResolver] matched by id - ${originalStudentName} (ID: ${originalStudentId})`);
      return {
        resolvedStudentId: matchedById.id,
        resolvedBy: "id",
        originalStudentId,
        originalStudentName,
        resolvedStudentObj: matchedById,
      };
    }

    // Try matching originalStudentId directly as name if it doesn't look like a standard database ID (e.g., contains spaces or matches student names)
    if (originalStudentId.length > 4) {
      const normalizedIdName = normalizeStudentName(originalStudentId);
      if (normalizedIdName) {
        const matchedByNameKey = activeStudents.find(
          (s) => s.name && normalizeStudentName(s.name) === normalizedIdName
        );
        if (matchedByNameKey) {
          return {
            resolvedStudentId: matchedByNameKey.id,
            resolvedBy: "name",
            originalStudentId,
            originalStudentName: originalStudentName || matchedByNameKey.name,
            resolvedStudentObj: matchedByNameKey,
          };
        }
      }
    }
  }

  // 2. Try match by normalized name
  const normalizedInputName = normalizeStudentName(originalStudentName);
  if (!normalizedInputName) {
    return {
      resolvedStudentId: null,
      resolvedBy: "unresolved",
      originalStudentId,
      originalStudentName,
      resolvedStudentObj: null,
      warningMessage: `Nama siswa kosong atau tidak valid (ID: ${originalStudentId})`,
    };
  }

  const candidates = nameIndex[normalizedInputName] || [];

  if (candidates.length === 1) {
    const matchedByName = candidates[0];
    console.log(
      `[NameResolver] matched by normalized name - "${originalStudentName}" (origID: ${originalStudentId}) => active "${matchedByName.name}" (ID: ${matchedByName.id})`
    );
    return {
      resolvedStudentId: matchedByName.id,
      resolvedBy: "name",
      originalStudentId,
      originalStudentName,
      resolvedStudentObj: matchedByName,
    };
  } else if (candidates.length === 0 && normalizedInputName.length >= 3) {
    // Try substring matching or partial matches
    const partialMatches = activeStudents.filter((s) => {
      if (!s.name) return false;
      const normalizedActiveName = normalizeStudentName(s.name);
      return normalizedActiveName.includes(normalizedInputName) || normalizedInputName.includes(normalizedActiveName);
    });
    if (partialMatches.length === 1) {
      const matchedByName = partialMatches[0];
      console.log(
        `[NameResolver] matched by partial name - "${originalStudentName}" (origID: ${originalStudentId}) => active "${matchedByName.name}" (ID: ${matchedByName.id})`
      );
      return {
        resolvedStudentId: matchedByName.id,
        resolvedBy: "name",
        originalStudentId,
        originalStudentName,
        resolvedStudentObj: matchedByName,
      };
    }
  }

  if (candidates.length > 1) {
    const warning = `Konflik nama ganda ("${originalStudentName}"): ${candidates.length} target siswa aktif terdeteksi (${candidates
      .map((c) => `${c.name} [ID:${c.id}]`)
      .join(", ")}).`;
    console.warn(`[NameResolver] ambiguous match - ${warning}`);
    return {
      resolvedStudentId: null,
      resolvedBy: "ambiguous",
      originalStudentId,
      originalStudentName,
      resolvedStudentObj: null,
      warningMessage: warning,
    };
  }

  // 3. Unresolved fallback
  const unresolvedWarning = `Siswa "${originalStudentName}" (ID: ${originalStudentId}) tidak dapat diselesaikan di master data aktif.`;
  console.log(`[NameResolver] unresolved record - ${unresolvedWarning}`);
  return {
    resolvedStudentId: null,
    resolvedBy: "unresolved",
    originalStudentId,
    originalStudentName,
    resolvedStudentObj: null,
    warningMessage: unresolvedWarning,
  };
}
