import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.spindexmalaysia.app",
  appName: "SPINDEX",
  webDir: "public",
  server: {
    url: "https://spindexmy.vercel.app",
    androidScheme: "https",
  },
};

export default config;
