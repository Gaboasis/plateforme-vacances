import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

let configured = false;

/** pdfjs-dist attend ./pdf.worker.mjs — chemin cassé après bundling Next en prod. */
export function ensurePdfJsWorker(): void {
  if (configured) return;
  const nodeRequire = createRequire(require.resolve("pdf-parse"));
  const workerPath = nodeRequire.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  configured = true;
}
