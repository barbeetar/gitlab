const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const issuesPath = process.argv[2] || "public/data/issues.json";
const outputDir = process.argv[3] || "public/data/issue-assets";
const token = process.env.GITLAB_ISSUES_TOKEN || "";

if (!token) {
  process.exit(0);
}

const issues = JSON.parse(fs.readFileSync(issuesPath, "utf8"));
fs.mkdirSync(outputDir, { recursive: true });

function getProjectBase(issue) {
  return String(issue.web_url || "").split("/-/issues/")[0].replace(/\/$/, "");
}

function normalizeUrl(value, issue) {
  const raw = String(value || "").trim();
  if (!raw || /^(data:|blob:|mailto:|#)/i.test(raw)) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  const projectBase = getProjectBase(issue);
  if (!projectBase) {
    return "";
  }
  if (raw.startsWith("/uploads/")) {
    return `${projectBase}${raw}`;
  }
  if (raw.startsWith("uploads/")) {
    return `${projectBase}/${raw}`;
  }

  try {
    return new URL(raw, `${projectBase}/`).toString();
  } catch (_error) {
    return "";
  }
}

function extensionFromUrl(url) {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).toLowerCase();
  return extension && extension.length <= 8 ? extension : ".png";
}

function safeName(value) {
  return String(value || "image")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "image";
}

function collectImageUrls(markdown) {
  const urls = new Set();
  const markdownImagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;
  const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = markdownImagePattern.exec(markdown))) {
    urls.add(match[1]);
  }
  while ((match = htmlImagePattern.exec(markdown))) {
    urls.add(match[1]);
  }

  return [...urls];
}

function downloadImage(url, targetPath) {
  execFileSync("curl", [
    "-fL",
    "-sS",
    "--header",
    `PRIVATE-TOKEN: ${token}`,
    "--output",
    targetPath,
    url
  ], { stdio: "inherit" });
}

let downloadedCount = 0;

for (const issue of issues) {
  let description = String(issue.description || "");
  const imageUrls = collectImageUrls(description);

  for (const originalUrl of imageUrls) {
    const absoluteUrl = normalizeUrl(originalUrl, issue);
    if (!absoluteUrl) {
      continue;
    }

    const issueId = issue.iid || issue.id || "issue";
    const urlHash = Buffer.from(absoluteUrl).toString("base64url").slice(0, 12);
    const assetName = `${safeName(`issue-${issueId}`)}-${urlHash}${extensionFromUrl(absoluteUrl)}`;
    const targetPath = path.join(outputDir, assetName);
    const publicPath = `data/issue-assets/${assetName}`;

    try {
      if (!fs.existsSync(targetPath)) {
        downloadImage(absoluteUrl, targetPath);
        downloadedCount += 1;
      }
      description = description.split(originalUrl).join(publicPath);
    } catch (_error) {
      console.error(`Failed to download issue image: ${absoluteUrl}`);
    }
  }

  issue.description = description;
}

fs.writeFileSync(issuesPath, `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Rewrote issue image assets. Downloaded ${downloadedCount} file(s).`);
