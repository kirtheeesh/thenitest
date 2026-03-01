import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  const distPath = path.resolve(__dirname, "..", "dist");
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true });
  }

  console.log("Building client...");
  await viteBuild({
    root: path.resolve(__dirname, "..", "client"),
    build: {
      outDir: path.resolve(__dirname, "..", "dist", "public"),
      emptyOutDir: true,
    },
  });

  console.log("Building server...");
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));
  const externals = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];
  
  await esbuild({
    entryPoints: [path.resolve(__dirname, "..", "server", "index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    outfile: path.resolve(__dirname, "..", "dist", "index.js"),
    format: "esm",
    external: externals,
  });

  console.log("Build complete!");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
