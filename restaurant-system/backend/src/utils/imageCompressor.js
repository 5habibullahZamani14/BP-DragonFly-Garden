const fs = require("fs");
const path = require("path");

let sharp;
try {
  sharp = require("sharp");
} catch (err) {
  console.warn("sharp module unavailable; image compression is disabled.", err?.message || err);
  sharp = null;
}

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const isCompressibleImage = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return supportedExtensions.has(ext);
};

const compressImage = async (filePath) => {
  if (!sharp) return;
  if (!isCompressibleImage(filePath)) return;

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".gif") {
    // Preserve animated GIFs as-is; no built-in lossless optimization here.
    return;
  }

  const tempPath = `${filePath}.tmp`;
  let pipeline = sharp(filePath).rotate().resize({ width: 1200, withoutEnlargement: true, fit: "inside" });

  if (ext === ".png") {
    pipeline = pipeline.png({ compressionLevel: 8, adaptiveFiltering: true, quality: 80 });
  } else if (ext === ".webp") {
    pipeline = pipeline.webp({ quality: 80 });
  } else {
    pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  }

  await pipeline.toFile(tempPath);
  await fs.promises.rename(tempPath, filePath);
};

const compressImagesInDirectory = async (directoryPath) => {
  if (!sharp) return;
  if (!fs.existsSync(directoryPath)) return;

  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(directoryPath, entry.name);
    if (!isCompressibleImage(filePath)) continue;

    try {
      await compressImage(filePath);
      console.log(`Compressed image: ${filePath}`);
    } catch (err) {
      console.warn(`Failed to compress existing image ${filePath}:`, err?.message || err);
    }
  }
};

module.exports = {
  compressImage,
  compressImagesInDirectory,
};
