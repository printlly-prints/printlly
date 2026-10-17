import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PageSizes } from "pdf-lib";
import { imageBytesToPdf, imageDimensions, imagePdfFileName, MAX_DOCUMENT_BYTES } from "../src/utils/imagePdf.js";

for (const [extension, mimeType] of [["jpg", "image/jpeg"], ["png", "image/png"]]) {
  test(`${extension} becomes an actual one-page PDF with an embedded, uncropped image`, async () => {
    const source = new Uint8Array(await readFile(new URL(`./fixtures/wide-image.${extension}`, import.meta.url)));
    assert.deepEqual(imageDimensions(source), { width: 16, height: 8, mimeType });
    const converted = await imageBytesToPdf(source, { fileName: `notes.${extension}`, mimeType });
    assert.equal(converted.fileName, "notes.pdf");
    assert.equal(converted.mimeType, "application/pdf");
    assert.equal(Buffer.from(converted.bytes.subarray(0, 5)).toString(), "%PDF-");
    const document = await PDFDocument.load(converted.bytes);
    assert.equal(document.getPageCount(), 1);
    assert.deepEqual([document.getPage(0).getWidth(), document.getPage(0).getHeight()], PageSizes.A4);
    const images = document.context.enumerateIndirectObjects().map(([, value]) => value.dict).filter(dict => dict?.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    assert.ok(images.some(dict => dict.get(PDFName.of("Width")).asNumber() === 16 && dict.get(PDFName.of("Height")).asNumber() === 8));
  });
}

test("oversize image headers are rejected before decoding, and malformed bytes never become a PDF", async () => {
  const png = new Uint8Array(await readFile(new URL("./fixtures/wide-image.png", import.meta.url)));
  const huge = png.slice(); const header = new DataView(huge.buffer); header.setUint32(16, 100000); header.setUint32(20, 100000);
  await assert.rejects(imageBytesToPdf(huge), /24 megapixels/);
  for (const bytes of [new Uint8Array(), new Uint8Array([255, 216, 255]), new Uint8Array([71, 73, 70, 56])]) await assert.rejects(imageBytesToPdf(bytes));
  await assert.rejects(imageBytesToPdf(png, { mimeType: "image/jpeg" }), /format could not be verified/);
  await assert.rejects(imageBytesToPdf(new Uint8Array(MAX_DOCUMENT_BYTES + 1)), /10 MB/);
});

test("PDF names retain readable basenames and cannot carry a path", () => {
  assert.equal(imagePdfFileName("C:\\notes\\assignment.photo.jpeg"), "assignment.photo.pdf");
  assert.equal(imagePdfFileName("../image.png"), "image.pdf");
  assert.equal(imagePdfFileName("\u0000.png"), "image.pdf");
});
