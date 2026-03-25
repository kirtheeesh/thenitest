import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const log = (message: string) => {
  const formatted = `${new Date().toLocaleTimeString()} [express] ${message}`;
  console.log(formatted);
};

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: createLogger("info", { prefix: "[vite]" }),
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    
    // Skip if request looks like an asset (has a file extension)
    if (url.includes(".") && !url.endsWith(".html")) {
      return next();
    }

    log(`Handling HTML request: ${url}`);

    try {
      const clientIndex = path.resolve(__dirname, "..", "client", "index.html");
      log(`Resolved clientIndex path: ${clientIndex}`);
      if (!fs.existsSync(clientIndex)) {
        log(`Error: index.html not found at ${clientIndex}`);
      }
      const template = await fs.promises.readFile(clientIndex, "utf-8");
      log(`Read index.html template, length: ${template.length}`);
      let page = await vite.transformIndexHtml(url, template);
      
      log(`Transformed index.html, final length: ${page.length}`);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      log(`Error in HTML handler: ${e instanceof Error ? e.message : String(e)}`);
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
