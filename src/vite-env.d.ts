/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the PrettyCardboard server (REST + WebSocket). */
  readonly VITE_PC_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
