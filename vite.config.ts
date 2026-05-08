import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

function firefoxManifestPlugin(): Plugin {
  return {
    name: "firefox-manifest",
    closeBundle() {
      if (process.env.BROWSER !== "firefox") return;
      const manifestPath = resolve(__dirname, "dist", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (manifest.background?.service_worker) {
        manifest.background = {
          scripts: [manifest.background.service_worker],
          type: manifest.background.type
        };
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  };
}

export default defineConfig({
  plugins: [firefoxManifestPlugin()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/app/background/index.ts"),
        content: resolve(__dirname, "src/app/content/index.ts")
      },
      output: {
        entryFileNames: (chunkInfo) => `${chunkInfo.name}.js`,
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
