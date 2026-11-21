const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

class InvalidUploadedImageError extends Error {
  constructor() {
    super("The uploaded file is not a supported image.");
    this.name = "InvalidUploadedImageError";
  }
}

const sanitizeUploadedImage = async (inputPath, outputDirectory) => {
  let metadata;
  try {
    metadata = await sharp(inputPath, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new InvalidUploadedImageError();
  }
  if (!["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
    throw new InvalidUploadedImageError();
  }

  await fs.mkdir(outputDirectory, { recursive: true });
  const filename = `fb-${crypto.randomBytes(32).toString("hex")}.webp`;
  const outputPath = path.join(outputDirectory, filename);

  try {
    await sharp(inputPath, { limitInputPixels: 40_000_000 })
      .rotate()
      .webp({ quality: 85 })
      .toFile(outputPath);
  } catch (error) {
    await fs.rm(outputPath, { force: true });
    throw error;
  }

  return { filename, path: outputPath };
};

module.exports = { InvalidUploadedImageError, sanitizeUploadedImage };
