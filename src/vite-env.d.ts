/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Tunnel URL for squad-rc connection (e.g. wss://xxx.devtunnels.ms) */
  readonly VITE_TUNNEL_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
