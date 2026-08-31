# Security Spec - Teacher Support Interventions

## 1. Data Invariants
- **Identity Integrity**: The user creating the intervention must be an active member of the Junior High staff (`isJuniorHighStaff()`).
- **Creator Validation**: The `createdBy` field in the payload must strictly match the authenticated user's UID (`request.auth.uid`).
- **Strict Keys**: Creation payloads must contain exactly the required fields.
- **Type Safety**:
  - `studentId` is string (size <= 128)
  - `classId` is string (size <= 128)
  - `academicYear` is string (size <= 32)
  - `issueType` is string, either `'lateness'` or `'minor_violation'`
  - `incidentIds` is a non-empty list of strings with bounded size (size <= 50)
  - `interventionPlan` is string (size <= 2000)
  - `status` is string, either `'in_progress'` or `'completed'`
  - `outcomeNote` is string or null (size <= 2000)
- **Immutable Fields**: `id`, `studentId`, `issueType`, `createdAt`, `createdBy` cannot be altered during updates.
- **Terminal State Lock**: Once status is set to `'completed'`, the record becomes read-only and cannot be updated (except by SUPER_ADMIN).
- **Temporal Integrity**: `createdAt` on creation and `updatedAt`/`completedAt` on updates must match the server timestamp (`request.time`).

---

## 2. The "Dirty Dozen" Payloads
Below are 12 specific payloads representing exploits or invalid states targeting `/teacherSupportInterventions`:

1. **Privilege Escalation**: Non-staff user attempting to create an intervention.
2. **Identity Spoofing**: Staff user setting `createdBy` to a different UID.
3. **Temporal Spoofing**: Staff user setting `createdAt` to a client timestamp instead of `request.time`.
4. **Invalid Issue Type**: Creating an intervention with `issueType: "major_crime"`.
5. **Empty Incidents List**: Creating an intervention with `incidentIds: []`.
6. **Massive Incidents Array**: Creating an intervention with 10,000 incident IDs (Denial of Wallet).
7. **Invalid Status String**: Setting `status: "waiting_for_approval"`.
8. **Malicious ID Poisoning**: Specifying an document ID with 10KB of junk characters.
9. **Contribution Tier Field Override**: Contributor attempting to edit immutable `studentId` field.
10. **Terminal State Violation**: Attempting to edit `interventionPlan` on a completed intervention.
11. **Malicious Value Type**: Sending a boolean value instead of a string for `interventionPlan`.
12. **PII Blanket Query**: Unauthorized query scraping without filtering by `isJuniorHighStaff()`.

---

## 3. The Test Runner
A test suite verifying that all 12 malicious patterns are rejected with `PERMISSION_DENIED`.
