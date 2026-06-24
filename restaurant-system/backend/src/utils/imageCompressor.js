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
const cacheFileName = ".image-compression-cache.json";
const cacheVersion = 2;
const targetWidth = 700;

const isCompressibleImage = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return supportedExtensions.has(ext);
};

const loadCompressionCache = async (directoryPath) => {
  const cachePath = path.join(directoryPath, cacheFileName);
  if (!fs.existsSync(cachePath)) return { version: cacheVersion, images: {} };

  try {
    const raw = await fs.promises.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw) || {};
    if (parsed.version !== cacheVersion) {
      return { version: cacheVersion, images: {} };
    }
    return parsed;
  } catch (err) {
    console.warn(`Unable to read image compression cache at ${cachePath}:`, err?.message || err);
    return { version: cacheVersion, images: {} };
  }
};

const saveCompressionCache = async (directoryPath, cache) => {
  const cachePath = path.join(directoryPath, cacheFileName);
  try {
    await fs.promises.writeFile(cachePath, JSON.stringify({ version: cacheVersion, images: cache }, null, 2), "utf8");
  } catch (err) {
    console.warn(`Unable to write image compression cache at ${cachePath}:`, err?.message || err);
  }
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
  let pipeline = sharp(filePath)
    .rotate()
    .resize({ width: targetWidth, withoutEnlargement: true, fit: "inside" });

  if (ext === ".png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, quality: 60 });
  } else if (ext === ".webp") {
    pipeline = pipeline.webp({ quality: 55 });
  } else {
    pipeline = pipeline.jpeg({ quality: 60, mozjpeg: true });
  }

  await pipeline.toFile(tempPath);
  await fs.promises.rename(tempPath, filePath);
};

const compressImagesInDirectory = async (directoryPath) => {
  if (!sharp) return;
  if (!fs.existsSync(directoryPath)) return;

  const loadedCache = await loadCompressionCache(directoryPath);
  const cache = loadedCache.images || {};
  const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
  let didUpdateCache = false;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(directoryPath, entry.name);
    if (!isCompressibleImage(filePath)) continue;

    const relativeKey = path.relative(directoryPath, filePath);
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch (err) {
      console.warn(`Unable to stat image ${filePath}:`, err?.message || err);
      continue;
    }

    const cached = cache[relativeKey];
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      continue;
    }

    if (path.extname(filePath).toLowerCase() === ".gif") {
      cache[relativeKey] = { mtimeMs: stats.mtimeMs, size: stats.size };
      didUpdateCache = true;
      continue;
    }

    try {
      await compressImage(filePath);
      const newStats = await fs.promises.stat(filePath);
      cache[relativeKey] = { mtimeMs: newStats.mtimeMs, size: newStats.size };
      didUpdateCache = true;
      console.log(`Compressed image: ${filePath}`);
    } catch (err) {
      console.warn(`Failed to compress existing image ${filePath}:`, err?.message || err);
    }
  }

  if (didUpdateCache) {
    await saveCompressionCache(directoryPath, cache);
  }
};

module.exports = {
  compressImage,
  compressImagesInDirectory,
};
