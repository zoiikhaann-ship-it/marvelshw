import { getFontEmbedCSS, toBlob } from "html-to-image";
import { jsPDF } from "jspdf";

export const PAGE_WIDTH = 794; // A4 at 96 dpi
export const PAGE_HEIGHT = 1123;

async function ensureFontsLoaded(): Promise<void> {
  try {
    await document.fonts.ready;
    await Promise.all(
      [
        document.fonts.load('400 18px "Noto Nastaliq Urdu"', "\u0627\u0631\u062F\u0648"),
        document.fonts.load('700 18px "Noto Nastaliq Urdu"', "\u0627\u0631\u062F\u0648"),
        document.fonts.load("400 16px Inter", "Abc 123"),
        document.fonts.load("600 16px Inter", "Abc 123"),
        document.fonts.load("700 16px Inter", "Abc 123"),
      ].map((promise) => promise.catch(() => [])),
    );
    await document.fonts.ready;
  } catch {
    // Rendering still continues with whichever fonts are available.
  }
}

/** Renders each diary page element to a sharp PNG (the same DOM the teacher sees in the preview). */
export async function renderPagesToPng(pages: HTMLElement[], pixelRatio: number): Promise<Blob[]> {
  if (!pages.length) throw new Error("There is no diary page to export.");
  await ensureFontsLoaded();

  let fontEmbedCSS: string | undefined;
  try {
    // Use the parent so fonts used on any page (for example Urdu on page 2) are embedded.
    fontEmbedCSS = await getFontEmbedCSS(pages[0].parentElement ?? pages[0]);
  } catch {
    fontEmbedCSS = undefined;
  }

  const blobs: Blob[] = [];
  for (const page of pages) {
    const blob = await toBlob(page, {
      pixelRatio,
      backgroundColor: "#ffffff",
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
      style: { margin: "0", boxShadow: "none", transform: "none" },
    });
    if (!blob) throw new Error("The browser could not create the image.");
    blobs.push(blob);
  }
  return blobs;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the generated image."));
    reader.readAsDataURL(blob);
  });
}

/** Builds an A4 portrait PDF with one rendered page image per diary page. */
export async function buildPdf(pageImages: Blob[], title: string): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  for (let index = 0; index < pageImages.length; index += 1) {
    const dataUrl = await blobToDataURL(pageImages[index]);
    if (index > 0) pdf.addPage("a4", "portrait");
    pdf.addImage(dataUrl, "PNG", 0, 0, width, height, undefined, "FAST");
  }
  pdf.setProperties({ title, author: "Marvels Montessori and School", creator: "Digital Homework Diary" });
  return pdf.output("blob");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadFiles(files: File[]): Promise<void> {
  for (let index = 0; index < files.length; index += 1) {
    if (index > 0) await sleep(450);
    downloadBlob(files[index], files[index].name);
  }
}

export function canShareFiles(files: File[]): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files })
    );
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "cancelled" | "blocked" | "unsupported";

/**
 * Opens the phone's native share sheet with the files. "shared" only means the share sheet
 * was completed; it cannot confirm that a WhatsApp message was actually sent.
 */
export async function nativeShare(files: File[], title: string, text: string): Promise<ShareOutcome> {
  if (!canShareFiles(files)) return "unsupported";
  try {
    await navigator.share({ files, title, text });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "AbortError") return "cancelled";
      if (error.name === "NotAllowedError") return "blocked";
    }
    return "unsupported";
  }
}
