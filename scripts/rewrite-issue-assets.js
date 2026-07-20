const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const issuesPath = process.argv[2] || "public/data/issues.json";
const issues = JSON.parse(fs.readFileSync(issuesPath, "utf8"));
const assetDir = "assets/issue-assets";

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

  return [...urls].filter((url) => !/^(\.\/)?(data|assets)\/issue-assets\//i.test(String(url).trim()));
}

function projectBase(issue) {
  return String(issue.web_url || "").split("/-/issues/")[0].replace(/\/$/, "");
}

function gitlabBaseUrlFromIssue(issue) {
  try {
    return new URL(issue.web_url).origin;
  } catch (_error) {
    return "";
  }
}

function candidateUrls(originalUrl, issue) {
  const raw = String(originalUrl || "").trim();
  if (!raw || /^(data:|blob:|mailto:|#)/i.test(raw)) {
    return [];
  }
  if (raw.startsWith("//")) {
    return [`https:${raw}`];
  }

  const base = projectBase(issue);
  const gitlabBase = gitlabBaseUrlFromIssue(issue);
  const candidates = [];
  const add = (value) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  };
  const addUploadApi = (value) => {
    for (const apiUrl of uploadApiUrls(value, issue)) {
      add(apiUrl);
    }
  };

  if (/^https?:\/\//i.test(raw)) {
    addUploadApi(raw);
    add(raw);
    const uploadsIndex = raw.indexOf("/uploads/");
    if (uploadsIndex !== -1 && gitlabBase) {
      add(`${gitlabBase}/-/project/${issue.project_id}${raw.slice(uploadsIndex)}`);
    }
    return candidates;
  }

  if (raw.startsWith("/uploads/")) {
    addUploadApi(raw);
    add(`${base}${raw}`);
    if (gitlabBase) {
      add(`${gitlabBase}/-/project/${issue.project_id}${raw}`);
    }
    return candidates;
  }

  if (raw.startsWith("uploads/")) {
    addUploadApi(`/${raw}`);
    add(`${base}/${raw}`);
    if (gitlabBase) {
      add(`${gitlabBase}/-/project/${issue.project_id}/${raw}`);
    }
    return candidates;
  }

  try {
    add(new URL(raw, `${base}/`).toString());
  } catch (_error) {
    // Ignore unsupported relative URL.
  }
  return candidates;
}

function uploadApiUrls(url, issue) {
  const match = String(url || "").match(/\/uploads\/([^/?#\/]+)\/([^?#]+)/);
  if (!match || !issue.project_id) {
    return [];
  }

  const gitlabBase = gitlabBaseUrlFromIssue(issue);
  const secret = safeDecodeURIComponent(match[1]);
  const filename = safeDecodeURIComponent(match[2].split("/").pop() || "");
  if (!gitlabBase || !secret || !filename) {
    return [];
  }

  return [
    `${gitlabBase}/api/v4/projects/${encodeURIComponent(issue.project_id)}/uploads/${encodeURIComponent(secret)}/${encodeURIComponent(filename)}`
  ];
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function extensionFromUrl(url) {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    return extension && extension.length <= 8 ? extension : ".png";
  } catch (_error) {
    return ".png";
  }
}

function assetPathFor(originalUrl, issue) {
  const candidates = candidateUrls(originalUrl, issue);
  const canonical = candidates[0] || `${issue.iid || issue.id || "issue"}-${originalUrl}`;
  const hash = crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 16);
  return `${assetDir}/issue-${issue.iid || issue.id || "issue"}-${hash}${extensionFromUrl(canonical)}`;
}

let rewrittenCount = 0;

for (const issue of issues) {
  let description = String(issue.description || "");
  for (const originalUrl of collectImageUrls(description)) {
    const assetPath = assetPathFor(originalUrl, issue);
    if (fs.existsSync(assetPath)) {
      description = description.split(originalUrl).join(assetPath);
      rewrittenCount += 1;
    }
  }
  issue.description = description;
}

fs.writeFileSync(issuesPath, `${JSON.stringify(issues, null, 2)}\n`);
console.log(`Rewrote ${rewrittenCount} issue image reference(s) to repo assets.`);
