const bcrypt = require("bcrypt");
const crypto = require("node:crypto");

const MIN_PASSWORD_LENGTH = 8;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

const validateManagerPassword = (password) => {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES) {
    return `Password must be no more than ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes.`;
  }
  return null;
};

const hashManagerPassword = async (password) => {
  const needsPrehash = Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES;
  const valueToHash = needsPrehash
    ? crypto.createHash("sha256").update(password, "utf8").digest("hex")
    : password;
  const hash = await bcrypt.hash(valueToHash, 12);
  return needsPrehash ? `sha256$${hash}` : hash;
};

const verifyManagerCredentials = async (id, password, profile) => {
  const storedPassword = profile.password;
  const isPrehashed = typeof storedPassword === "string" && storedPassword.startsWith("sha256$");
  const bcryptHash = isPrehashed ? storedPassword.slice("sha256$".length) : storedPassword;
  const isHashed = isPrehashed || (typeof storedPassword === "string" && storedPassword.startsWith("$2"));
  if (id !== profile.id || typeof password !== "string" || typeof profile.password !== "string") {
    return { matches: false, needsHash: !isHashed };
  }
  if (isHashed && !isPrehashed && Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES) {
    return { matches: false, needsHash: false };
  }
  const valueToVerify = isPrehashed
    ? crypto.createHash("sha256").update(password, "utf8").digest("hex")
    : password;
  return {
    matches: isHashed ? await bcrypt.compare(valueToVerify, bcryptHash) : password === storedPassword,
    needsHash: !isHashed,
  };
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_BCRYPT_PASSWORD_BYTES,
  validateManagerPassword,
  hashManagerPassword,
  verifyManagerCredentials,
};
