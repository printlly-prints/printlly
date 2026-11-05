import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { imageBytesToPdf, imageDimensions, MAX_DOCUMENT_BYTES } from "./imagePdf";

async function readAsset(asset) {
  if (Platform.OS === "web") {
    const blob = asset.file || await (await fetch(asset.uri)).blob();
    if (blob.size > MAX_DOCUMENT_BYTES) throw new Error("Each file must be 10 MB or smaller.");
    return new Uint8Array(await blob.arrayBuffer());
  }
  const file = new File(asset.uri);
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Each file must be 10 MB or smaller.");
  return file.bytes();
}

// Each selected image becomes one PDF. Server upload responses remain the
// only source of page counts used for pricing and order creation.
export async function prepareUploadAsset(asset) {
  const sourceBytes = await readAsset(asset);
  const pdf = sourceBytes[0] === 37 && sourceBytes[1] === 80 && sourceBytes[2] === 68 && sourceBytes[3] === 70 && sourceBytes[4] === 45;
  if (pdf) {
    const name = /\.pdf$/i.test(asset.name || "") ? asset.name : `${asset.name || "document"}.pdf`;
    const file = Platform.OS === "web" ? new globalThis.File([sourceBytes], name, { type: "application/pdf" }) : undefined;
    return { ...asset, ...(file ? { file } : {}), name, mimeType: "application/pdf" };
  }
  const dimensions = imageDimensions(sourceBytes);
  let bytes = sourceBytes;
  if (dimensions.mimeType === "image/jpeg") {
    // Normalize EXIF orientation before embedding. No resize or crop is used.
    const context = ImageManipulator.manipulate(asset.uri);
    let image, normalized;
    try {
      image = await context.renderAsync();
      normalized = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
      bytes = await readAsset({ uri: normalized.uri });
    } finally {
      if (normalized && Platform.OS !== "web") { try { new File(normalized.uri).delete(); } catch {} }
      image?.release(); context.release();
    }
  }
  const converted = await imageBytesToPdf(bytes, { fileName: asset.name, mimeType: dimensions.mimeType });
  if (Platform.OS === "web") {
    const file = new globalThis.File([converted.bytes], converted.fileName, { type: converted.mimeType });
    return { ...asset, name: converted.fileName, mimeType: converted.mimeType, file, size: file.size, converted: true };
  }
  const cached = new File(Paths.cache, `printlly-image-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try { cached.create(); cached.write(converted.bytes); }
  catch (error) { try { if (cached.exists) cached.delete(); } catch {} throw error; }
  return { ...asset, uri: cached.uri, name: converted.fileName, mimeType: converted.mimeType, size: converted.bytes.length, converted: true };
}

export function discardConvertedAsset(asset) {
  if (!asset?.converted || Platform.OS === "web") return;
  try {
    const file = new File(asset.uri);
    // Delete only PDFs created by this adapter inside the app cache.
    if (file.uri.startsWith(Paths.cache.uri) && file.name.startsWith("printlly-image-") && file.extension === ".pdf") file.delete();
  } catch { /* The OS may already have evicted a cache file. */ }
}
