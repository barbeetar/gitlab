const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const apiV4Url = process.env.CI_API_V4_URL || "";
const projectId = process.env.CI_PROJECT_ID || "";
const branch = process.env.CI_COMMIT_REF_NAME || process.env.CI_DEFAULT_BRANCH || "main";
const issuesToken = process.env.GITLAB_ISSUES_TOKEN || "";
const writeToken = process.env.GITLAB_WRITE_TOKEN || "";
const issueState = process.env.ISSUE_STATE || "all";
const issueLabels = process.env.ISSUE_LABELS || "";
const maxPages = Number(process.env.ISSUE_MAX_PAGES || "10");
const assetDir = "assets/issue-assets";

fs.mkdirSync(assetDir, { recursive: true });

if (!issuesToken || !writeToken) {
  console.log("GITLAB_ISSUES_TOKEN or GITLAB_WRITE_TOKEN is not set; skipping issue asset sync.");
  process.exit(0);
}

if (!apiV4Url || !projectId) {
  throw new Error("CI_API_V4_URL and CI_PROJECT_ID are required.");
}

function gitlabBaseUrl() {
  return apiV4Url.replace(/\/api\/v4\/?$/, "");
}

function curlText(args) {
  return execFileSync("curl", args, { encoding: "utf8" });
}

function fetchIssues() {
  const issues = [];
  const query = new URLSearchParams({
    per_page: "100",
    scope: "all",
    order_by: "updated_at",
    sort: "desc"
  });
  if (issueState !== "all") {
    query.set("state", issueState);
  }
  if (issueLabels) {
    query.set("labels", issueLabels);
  }

  for (let page = 1; page <= maxPages; page += 1) {
    query.set("page", String(page));
    const responsePath = `/tmp/gitlab-issues-sync-${page}.json`;
    const headerPath = `/tmp/gitlab-issues-sync-${page}.headers`;
    const status = curlText([
      "-sS",
      "-D", headerPath,
      "-o", responsePath,
      "-w", "%{http_code}",
      "--header", `PRIVATE-TOKEN: ${issuesToken}`,
      `${apiV4Url}/projects/${encodeURIComponent(projectId)}/issues?${query}`
    ]);

    if (status !== "200") {
      throw new Error(`Failed to fetch GitLab issues: HTTP ${status}`);
    }

    issues.push(...JSON.parse(fs.readFileSync(responsePath, "utf8")));
    const headers = fs.readFileSync(headerPath, "utf8");
    const nextPage = headers.match(/^x-next-page:\s*(\d+)/im)?.[1];
    if (!nextPage) {
      break;
    }
  }

  return issues;
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

  return [...urls].filter((url) => !/^(\.\/)?(data|assets)\/issue-assets\//i.test(String(url).trim()));
}

function projectBase(issue) {
  return String(issue.web_url || "").split("/-/issues/")[0].replace(/\/$/, "");
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
  const gitlabBase = gitlabBaseUrl();
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
    if (uploadsIndex !== -1) {
      add(`${gitlabBase}/-/project/${issue.project_id || projectId}${raw.slice(uploadsIndex)}`);
    }
    return candidates;
  }

  if (raw.startsWith("/uploads/")) {
    addUploadApi(raw);
    add(`${base}${raw}`);
    add(`${gitlabBase}/-/project/${issue.project_id || projectId}${raw}`);
    return candidates;
  }

  if (raw.startsWith("uploads/")) {
    addUploadApi(`/${raw}`);
    add(`${base}/${raw}`);
    add(`${gitlabBase}/-/project/${issue.project_id || projectId}/${raw}`);
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
  if (!match) {
    return [];
  }

  const uploadProjectId = issue.project_id || projectId;
  const secret = safeDecodeURIComponent(match[1]);
  const filename = safeDecodeURIComponent(match[2].split("/").pop() || "");
  if (!uploadProjectId || !secret || !filename) {
    return [];
  }

  return [
    `${apiV4Url}/projects/${encodeURIComponent(uploadProjectId)}/uploads/${encodeURIComponent(secret)}/${encodeURIComponent(filename)}`
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

function isLikelyImage(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 8) {
    return false;
  }

  const header = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (header.startsWith("<!doctype html") || header.startsWith("<html") || header.includes("sign in")) {
    return false;
  }

  return (
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a" ||
    buffer.subarray(0, 4).toString("ascii") === "RIFF" ||
    buffer.subarray(0, 4).toString("ascii") === "<svg"
  );
}

function downloadFirstAvailable(originalUrl, issue, targetPath) {
  for (const url of candidateUrls(originalUrl, issue)) {
    const temporaryPath = `${targetPath}.tmp`;
    try {
      execFileSync("curl", [
        "-fL",
        "-sS",
        "--header", `PRIVATE-TOKEN: ${issuesToken}`,
        "--output", temporaryPath,
        url
      ], { stdio: "inherit" });
      if (isLikelyImage(temporaryPath)) {
        fs.renameSync(temporaryPath, targetPath);
        return true;
      }
      fs.rmSync(temporaryPath, { force: true });
      console.error(`Downloaded response is not an image, skipped: ${url}`);
    } catch (_error) {
      fs.rmSync(temporaryPath, { force: true });
      // Try the next possible GitLab upload URL shape.
    }
  }
  return false;
}

function collectInvalidExistingAssets() {
  if (!fs.existsSync(assetDir)) {
    return [];
  }

  return fs.readdirSync(assetDir)
    .map((filename) => `${assetDir}/${filename}`)
    .filter((filePath) => fs.statSync(filePath).isFile() && !isLikelyImage(filePath));
}

function collectExistingManagedAssets() {
  if (!fs.existsSync(assetDir)) {
    return [];
  }

  return fs.readdirSync(assetDir)
    .filter((filename) => /^issue-.+\.[a-z0-9]+$/i.test(filename))
    .map((filename) => `${assetDir}/${filename}`)
    .filter((filePath) => fs.statSync(filePath).isFile());
}

function commitAssetChanges(changes) {
  if (!changes.length) {
    console.log("No issue asset changes to commit.");
    return;
  }

  const actions = changes.map(({ action, assetPath }) => ({
    action,
    file_path: assetPath.replace(/\\/g, "/"),
    ...(action === "delete" ? {} : {
      content: fs.readFileSync(assetPath).toString("base64"),
      encoding: "base64"
    })
  }));

  const payloadPath = "/tmp/gitlab-issue-assets-commit.json";
  const responsePath = "/tmp/gitlab-issue-assets-commit-response.json";
  fs.writeFileSync(payloadPath, JSON.stringify({
    branch,
    commit_message: "docs: sync issue assets [skip ci]",
    actions
  }));

  const status = curlText([
    "-sS",
    "-o", responsePath,
    "-w", "%{http_code}",
    "--request", "POST",
    "--header", `PRIVATE-TOKEN: ${writeToken}`,
    "--header", "Content-Type: application/json",
    "--data", `@${payloadPath}`,
    `${apiV4Url}/projects/${encodeURIComponent(projectId)}/repository/commits`
  ]);

  if (status !== "200" && status !== "201") {
    const responseText = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, "utf8") : "";
    throw new Error(`Failed to commit issue assets: HTTP ${status} ${responseText}`);
  }

  console.log(`Committed ${changes.length} issue asset change(s).`);
}

const issues = fetchIssues();
const invalidExistingAssets = new Set(collectInvalidExistingAssets());
const repairedInvalidAssets = new Set();
const referencedAssets = new Set();
const assetChanges = [];

for (const issue of issues) {
  for (const originalUrl of collectImageUrls(issue.description || "")) {
    const assetPath = assetPathFor(originalUrl, issue);
    referencedAssets.add(assetPath);
    if (fs.existsSync(assetPath) && isLikelyImage(assetPath)) {
      continue;
    }

    const action = fs.existsSync(assetPath) ? "update" : "create";
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    if (downloadFirstAvailable(originalUrl, issue, assetPath)) {
      assetChanges.push({ action, assetPath });
      repairedInvalidAssets.add(assetPath);
    } else {
      console.error(`Failed to download issue image: ${originalUrl}`);
    }
  }
}

for (const assetPath of collectExistingManagedAssets()) {
  if (!referencedAssets.has(assetPath) && fs.existsSync(assetPath)) {
    fs.rmSync(assetPath, { force: true });
    assetChanges.push({ action: "delete", assetPath });
  }
}

for (const assetPath of invalidExistingAssets) {
  if (!repairedInvalidAssets.has(assetPath) && fs.existsSync(assetPath)) {
    fs.rmSync(assetPath, { force: true });
    assetChanges.push({ action: "delete", assetPath });
  }
}

commitAssetChanges(assetChanges);
