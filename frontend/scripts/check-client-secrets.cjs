const fs = require("node:fs");
const path = require("node:path");

const distDirectory = path.resolve(__dirname, "..", "dist");
const textExtensions = new Set([".js", ".css", ".html", ".json", ".webmanifest", ".svg", ".txt", ".map", ".xml", ".csv", ".md"]);
const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["Bearer credential", /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/],
  ["Groq API key", /\bgsk_[A-Za-z0-9_-]{20,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["secret environment assignment", /\b(?:JWT_SECRET|(?:GROQ|RESEND|OPENAI|AWS|AZURE)_?(?:API_?)?KEY)\s*[:=]\s*["'][^"']{8,}["']/i]
];

const findings = [];

const inspectDirectory = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      inspectDirectory(filePath);
      continue;
    }

    if (/^\.env(?:\.|$)/i.test(entry.name) || /\.(?:pem|p12|pfx|key)$/i.test(entry.name)) {
      findings.push(`${path.relative(distDirectory, filePath)}: disallowed credential/config file`);
      continue;
    }

    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const content = fs.readFileSync(filePath, "utf8");
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(content)) findings.push(`${path.relative(distDirectory, filePath)}: possible ${label}`);
    }
  }
};

if (!fs.existsSync(distDirectory)) {
  console.error("Frontend build output is missing; build the frontend before running the secret scan.");
  process.exit(1);
}

inspectDirectory(distDirectory);
if (findings.length) {
  console.error("Possible secrets or credential files found in the public frontend build:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Frontend build secret scan passed.");
