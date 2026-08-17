import { createReadStream, cpSync, existsSync } from "node:fs";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const PDFJS_MOUNTS = [
  { url: "/pdfjs/wasm", folder: "wasm" },
  { url: "/pdfjs/cmaps", folder: "cmaps" },
  { url: "/pdfjs/standard_fonts", folder: "standard_fonts" },
  { url: "/pdfjs/iccs", folder: "iccs" },
] as const;

function pdfjsDistDir(): string {
  return fileURLToPath(new URL("./node_modules/pdfjs-dist", import.meta.url));
}

function pdfjsStaticAssets(): Plugin {
  const root = pdfjsDistDir();
  const mounts = PDFJS_MOUNTS.map((mount) => ({
    url: mount.url,
    dir: join(root, mount.folder),
  }));
  for (const mount of mounts) {
    if (!existsSync(mount.dir)) {
      throw new Error(`pdfjs-dist is missing ${mount.dir}. Reinstall dependencies.`);
    }
  }
  return {
    name: "pdfjs-static-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        const mount = mounts.find(
          (item) => path === item.url || path.startsWith(`${item.url}/`),
        );
        if (!mount) {
          next();
          return;
        }
        const rel = decodeURIComponent(path.slice(mount.url.length).replace(/^\//, ""));
        if (rel.length === 0 || rel.includes("..") || rel.includes("\0")) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const file = normalize(join(mount.dir, rel));
        const escaped = relative(mount.dir, file);
        if (escaped.startsWith("..") || isAbsolute(escaped)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", contentTypeFor(file));
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
      for (const mount of mounts) {
        cpSync(mount.dir, join(outDir, mount.url.slice(1)), { recursive: true });
      }
    },
  };
}

function contentTypeFor(file: string): string {
  switch (extname(file)) {
    case ".wasm":
      return "application/wasm";
    case ".bcmap":
      return "application/octet-stream";
    case ".pfb":
    case ".ttf":
      return "font/ttf";
    case ".js":
      return "text/javascript";
    default:
      return "application/octet-stream";
  }
}

export default defineConfig(({ mode }) => {
  const fromEnv = process.env.GM_HELPER_BASE?.trim();
  const base =
    fromEnv && fromEnv.length > 0
      ? fromEnv.endsWith("/")
        ? fromEnv
        : `${fromEnv}/`
      : mode === "domainfactory"
        ? "/GM_Helper/"
        : "/";

  return {
  base,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    pdfjsStaticAssets(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "GM Cockpit",
        short_name: "Cockpit",
        description: "Just-in-time information for a live-table GM.",
        theme_color: "#14110e",
        background_color: "#14110e",
        display: "standalone",
        orientation: "any",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,mjs,wasm,bcmap}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
};
});
