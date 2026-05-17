/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_SHEET_ID_LUMINA: string;
  readonly VITE_GOOGLE_SHEET_NAME_GURU: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
