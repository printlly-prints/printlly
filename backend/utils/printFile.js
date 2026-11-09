const path = require("node:path");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { PDFParse } = require("pdf-parse");
async function preparePrintFile(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === "application/pdf" && extension === ".pdf") {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const info = await parser.getInfo();
      if (!Number.isInteger(info.total) || info.total < 1)
        throw Error("No pages");
      return { buffer: file.buffer, pageCount: info.total };
    } catch {
      throw Error(
        "Could not read this PDF. It may be corrupted or password-protected.",
      );
    } finally {
      await parser.destroy();
    }
  }
  const jpg =
    [".jpg", ".jpeg"].includes(extension) && file.mimetype === "image/jpeg";
  const png = extension === ".png" && file.mimetype === "image/png";
  if (!jpg && !png) throw Error("Choose a PDF, JPG, JPEG or PNG document.");
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 40000000,
      failOn: "error",
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== (jpg ? "jpeg" : "png") ||
      (metadata.pages || 1) !== 1
    )
      throw Error("Invalid image");
    const bytes = await image
      .rotate()
      .resize({
        width: 3508,
        height: 3508,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    const pdf = await PDFDocument.create();
    const embedded = await pdf.embedPng(bytes);
    const landscape = embedded.width > embedded.height;
    const page = pdf.addPage(landscape ? [841.89, 595.28] : [595.28, 841.89]);
    const { width, height } = page.getSize(),
      margin = 24;
    const scale = Math.min(
      (width - margin * 2) / embedded.width,
      (height - margin * 2) / embedded.height,
    );
    const w = embedded.width * scale,
      h = embedded.height * scale;
    page.drawImage(embedded, {
      x: (width - w) / 2,
      y: (height - h) / 2,
      width: w,
      height: h,
    });
    return { buffer: Buffer.from(await pdf.save()), pageCount: 1 };
  } catch {
    throw Error(
      "Could not read this image. Choose a valid JPG, JPEG or PNG file.",
    );
  }
}
module.exports = { preparePrintFile };
