const SENSITIVE_FIELD = /(?:authorization|password|secret|(?:api|access|private|client)[_-]?key|(?:access|refresh|id|session|auth|jwt)?[_-]?token)/i;

const redactText = value => String(value)
  .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]")
  .replace(/([?&](?:token|access_token|refresh_token|id_token|session_token|auth_token|api[_-]?key|access[_-]?key|secret|password|authorization|credential|signature|sig|key)=)[^&#\s]*/gi, "$1[REDACTED]")
  .replace(/\b(["']?[A-Za-z0-9_-]*(?:authorization|password|secret|(?:api|access|private|client)[_-]?key|(?:access|refresh|id|session|auth|jwt)?[_-]?token)[A-Za-z0-9_-]*["']?\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^,;}]+))/gi, (match, prefix, doubleQuoted, singleQuoted, unquoted, offset, fullText) => {
    if (/authorization/i.test(prefix) && /^Bearer(?:\s+\[REDACTED\])?$/i.test((unquoted || "").trim())) {
      return `${prefix}Bearer [REDACTED]`;
    }
    const valueQuote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : "";
    return `${prefix}${valueQuote}[REDACTED]${valueQuote}`;
  })
  .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
  .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, "[REDACTED_API_KEY]")
  .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
  .replace(/\bgsk_[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]")
  .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_API_KEY]")
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");

const redactSensitiveData = (value, fieldName, seen = new WeakSet()) => {
  if (fieldName && SENSITIVE_FIELD.test(fieldName)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (value && typeof value === "object") {
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.map(item => redactSensitiveData(item, undefined, seen));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSensitiveData(item, key, seen)])
    );
  }
  return value;
};

module.exports = { redactText, redactSensitiveData };
