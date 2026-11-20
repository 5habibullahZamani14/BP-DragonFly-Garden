const isDev = import.meta.env.DEV;
const SENSITIVE_FIELD = /(?:authorization|password|secret|(?:api|access|private|client)[_-]?key|(?:access|refresh|id|session|auth|jwt)?[_-]?token)/i;

const redactText = (value: string) => value
  .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
  .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]")
  .replace(/([?&](?:token|access_token|refresh_token|id_token|session_token|auth_token|api[_-]?key|access[_-]?key|secret|password|authorization|credential|signature|sig|key)=)[^&#\s]*/gi, "$1[REDACTED]")
  .replace(/\b(["']?[A-Za-z0-9_-]*(?:authorization|password|secret|(?:api|access|private|client)[_-]?key|(?:access|refresh|id|session|auth|jwt)?[_-]?token)[A-Za-z0-9_-]*["']?\s*[:=]\s*)(?:"([^"]*)"|'([^']*)'|([^,;}]+))/gi, (match, prefix: string, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined, offset: number, fullText: string) => {
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

const sanitize = (value: unknown, key?: string, seen = new WeakSet<object>()): unknown => {
  if (key && SENSITIVE_FIELD.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (value instanceof Error) {
      return {
        name: value.name,
        message: redactText(value.message),
        stack: value.stack ? redactText(value.stack) : undefined,
      };
    }
    if (Array.isArray(value)) return value.map(item => sanitize(item, undefined, seen));
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [field, sanitize(item, field, seen)])
    );
  }
  return value;
};

const extractMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) return redactText(error.message);
  if (typeof error === "string") return redactText(error);
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return redactText(error.message);
    }
    try {
      return JSON.stringify(sanitize(error));
    } catch {
      return "[Unserializable error details]";
    }
  }
  return undefined;
};

export const safeConsoleError = (message: string, error?: unknown) => {
  if (!isDev) return;
  const extracted = extractMessage(error);
  if (extracted !== undefined) {
    console.error(redactText(message), extracted);
  } else {
    console.error(redactText(message));
  }
};

export const safeConsoleWarn = (message: string, warning?: unknown) => {
  if (!isDev) return;
  const extracted = extractMessage(warning);
  if (extracted !== undefined) {
    console.warn(redactText(message), extracted);
  } else {
    console.warn(redactText(message));
  }
};
