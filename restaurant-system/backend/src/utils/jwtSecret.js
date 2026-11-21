const MIN_JWT_SECRET_BYTES = 32;
const INSECURE_JWT_SECRETS = new Set([
  "changeme",
  "change_me",
  "replace_with_secure_random_string",
  "secret",
  "your-secret",
]);

const validateJwtSecret = (secret) => {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    return "JWT_SECRET is required.";
  }
  if (INSECURE_JWT_SECRETS.has(secret.trim().toLowerCase())) {
    return "JWT_SECRET must not use a known placeholder value.";
  }
  if (Buffer.byteLength(secret, "utf8") < MIN_JWT_SECRET_BYTES) {
    return `JWT_SECRET must contain at least ${MIN_JWT_SECRET_BYTES} UTF-8 bytes.`;
  }
  if (/^(.)\1+$/.test(secret)) {
    return "JWT_SECRET must not be a repeated character.";
  }
  return null;
};

module.exports = { MIN_JWT_SECRET_BYTES, validateJwtSecret };
