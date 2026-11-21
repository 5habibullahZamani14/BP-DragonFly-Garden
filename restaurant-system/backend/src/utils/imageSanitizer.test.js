const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { sanitizeUploadedImage } = require("./imageSanitizer");

test("sanitizes image bytes into a non-executable WebP with a random filename", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-image-test-"));
  try {
    const inputPath = path.join(directory, "uploaded.html");
    const outputDirectory = path.join(directory, "public");
    const png = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    }).png().toBuffer();
    await fs.writeFile(inputPath, png);

    const result = await sanitizeUploadedImage(inputPath, outputDirectory);
    const output = await fs.readFile(result.path);

    assert.match(result.filename, /^fb-[a-f0-9]{64}\.webp$/);
    assert.equal(output.toString("ascii", 0, 4), "RIFF");
    assert.equal(output.toString("ascii", 8, 12), "WEBP");
    assert.notEqual(result.filename, "uploaded.html");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects file content that is not a decodable image", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-image-test-"));
  try {
    const inputPath = path.join(directory, "spoofed.png");
    const outputDirectory = path.join(directory, "public");
    await fs.mkdir(outputDirectory);
    await fs.writeFile(inputPath, "<script>alert(1)</script>");

    await assert.rejects(
      sanitizeUploadedImage(inputPath, outputDirectory)
    );
    assert.deepEqual(await fs.readdir(outputDirectory), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
