import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();

const FORBIDDEN_PATHS = [
  "agents/connectors/cogdx.py",
  "docs/cogdx_integration.md",
];

const FORBIDDEN_SYMBOLS: Array<{ label: string; pattern: RegExp }> = [
  { label: "CogDxClient symbol", pattern: /\bCogDxClient\b/ },
  { label: "verify_trade_reasoning symbol", pattern: /\bverify_trade_reasoning\b/ },
];

const FORBIDDEN_NETWORK_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "fetch call to api.cerebratech.ai",
    pattern: /\bfetch\s*\(\s*["'`]https?:\/\/api\.cerebratech\.ai/i,
  },
  {
    label: "axios call to api.cerebratech.ai",
    pattern: /\baxios\.(?:get|post|put|patch|delete|request)\s*\(\s*["'`]https?:\/\/api\.cerebratech\.ai/i,
  },
];

const INCLUDED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".md",
  ".json",
  ".yaml",
  ".yml",
]);

const SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".openclaw",
  "sessions",
]);

function listFiles(rootDir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(rootDir)) {
    if (SKIP_DIRECTORIES.has(entry)) {
      continue;
    }
    const absolutePath = join(rootDir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      files.push(...listFiles(absolutePath));
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

const violations: string[] = [];

for (const relativePath of FORBIDDEN_PATHS) {
  const absolutePath = join(ROOT, relativePath);
  if (existsSync(absolutePath)) {
    violations.push(`Forbidden file present: ${relativePath}`);
  }
}

const files = listFiles(ROOT);
for (const absolutePath of files) {
  const extension = extname(absolutePath).toLowerCase();
  if (!INCLUDED_EXTENSIONS.has(extension)) {
    continue;
  }

  const relativePath = relative(ROOT, absolutePath).replaceAll("\\", "/");
  const content = readFileSync(absolutePath, "utf8");

  for (const rule of FORBIDDEN_SYMBOLS) {
    if (rule.pattern.test(content)) {
      violations.push(`${rule.label} found in ${relativePath}`);
    }
  }

  for (const rule of FORBIDDEN_NETWORK_PATTERNS) {
    if (rule.pattern.test(content)) {
      violations.push(`${rule.label} found in ${relativePath}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Security check failed. Potential exfiltration artifacts detected:");
  for (const issue of violations) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Security check passed: no CogDx exfiltration artifacts detected.");
