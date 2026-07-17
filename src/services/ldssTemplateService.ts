import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  writeBatch,
  runTransaction
} from "firebase/firestore";
import { db, handleFirestoreError } from "../lib/firebase";
import { LdssTemplate, LdssAge, LdssTemplateStatus } from "../types";

const COLLECTION_NAME = "ldssTemplates";

/**
 * Fetch all LDSS templates from Firestore
 */
export async function getAllLdssTemplates(): Promise<LdssTemplate[]> {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const templates: LdssTemplate[] = [];
    querySnapshot.forEach((docSnap) => {
      templates.push({ id: docSnap.id, ...docSnap.data() } as LdssTemplate);
    });
    return templates;
  } catch (error) {
    handleFirestoreError(error, "list", COLLECTION_NAME);
  }
}

/**
 * Fetch all templates for a specific age
 */
export async function getLdssTemplatesByAge(age: LdssAge): Promise<LdssTemplate[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("age", "==", age));
    const querySnapshot = await getDocs(q);
    const templates: LdssTemplate[] = [];
    querySnapshot.forEach((docSnap) => {
      templates.push({ id: docSnap.id, ...docSnap.data() } as LdssTemplate);
    });
    return templates;
  } catch (error) {
    handleFirestoreError(error, "list", `${COLLECTION_NAME}?age=${age}`);
  }
}

/**
 * Save or update a single LDSS template (e.g., Save Draft)
 */
export async function saveLdssTemplate(template: LdssTemplate): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, template.id);
    await setDoc(docRef, template);
  } catch (error) {
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${template.id}`);
  }
}

/**
 * Activate a template for a specific age.
 * When activating, any currently active template for the same age is archived.
 */
export async function activateLdssTemplate(templateId: string, age: LdssAge, email: string): Promise<void> {
  try {
    // 1. Fetch all templates for this age
    const allTemplates = await getLdssTemplatesByAge(age);
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 2. Loop through and archive any currently active template
    allTemplates.forEach((t) => {
      if (t.status === "active" && t.id !== templateId) {
        const docRef = doc(db, COLLECTION_NAME, t.id);
        batch.update(docRef, {
          status: "archived",
          updatedAt: now,
          updatedBy: email
        });
      }
    });

    // 3. Mark target template as active
    const targetRef = doc(db, COLLECTION_NAME, templateId);
    batch.update(targetRef, {
      status: "active",
      publishedAt: now,
      updatedAt: now,
      updatedBy: email
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${templateId}/activate`);
  }
}

/**
 * Archive a non-active template
 */
export async function archiveLdssTemplate(templateId: string, email: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, templateId);
    const now = new Date().toISOString();
    await setDoc(docRef, {
      status: "archived",
      updatedAt: now,
      updatedBy: email
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${templateId}/archive`);
  }
}

/**
 * Seed official LDSS Usia 6 template atomically
 */
export async function seedLdssTemplateAge6(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_6_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  try {
    // 1. Fetch current templates for age 6
    const existing = await getLdssTemplatesByAge(6);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 6 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 6 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 6,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

