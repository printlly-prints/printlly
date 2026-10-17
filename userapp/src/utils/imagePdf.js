import { PDFDocument, PageSizes } from "pdf-lib";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

// Read dimensions before decoding PNG pixels or allocating the PDF. Native
// adapters normalize orientation and other image formats before this boundary.
export function imageDimensions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("This image is empty or unreadable. Choose another file.");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Each file must be 10 MB or smaller.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width, height, mimeType;
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw new Error("This PNG is damaged. Choose another image.");
    width = view.getUint32(16); height = view.getUint32(20); mimeType = "image/png";
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9 || marker === undefined) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (JPEG_SOF.has(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); mimeType = "image/jpeg"; break;
      }
      offset += length;
    }
    if (!width || !height) throw new Error("This JPEG is damaged. Choose another image.");
  } else {
    throw new Error("Choose a PDF, JPEG or PNG, or convert this image to JPEG first.");
  }
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error("Choose an image up to 24 megapixels, or export a smaller copy.");
  return { width, height, mimeType };
}

export function imagePdfFileName(fileName = "image") {
  const base = String(fileName).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").replace(/\.[^.]*$/, "").trim();
  return `${base || "image"}.pdf`;
}

export async function imageBytesToPdf(bytes, { fileName = "image", mimeType } = {}) {
  const dimensions = imageDimensions(bytes);
  if (mimeType && ![dimensions.mimeType, dimensions.mimeType === "image/jpeg" ? "image/jpg" : "image/png"].includes(mimeType.toLowerCase())) {
    throw new Error("The image format could not be verified. Choose another file.");
  }
  const document = await PDFDocument.create();
  let image;
  try { image = dimensions.mimeType === "image/png" ? await document.embedPng(bytes) : await document.embedJpg(bytes); }
  catch { throw new Error("This image could not be read. Choose another file."); }
  const [pageWidth, pageHeight] = PageSizes.A4;
  const page = document.addPage([pageWidth, pageHeight]);
  const margin = 24;
  const scale = Math.min(1, (pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
  const width = image.width * scale, height = image.height * scale;
  page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
  const pdfBytes = await document.save();
  if (pdfBytes.length > MAX_DOCUMENT_BYTES) throw new Error("The converted PDF is over 10 MB. Choose a smaller image.");
  return { bytes: pdfBytes, fileName: imagePdfFileName(fileName), mimeType: "application/pdf", pageCount: 1 };
}
