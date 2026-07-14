const process = require("process");

function requiredEnv(name) {
  const value = process.env[name] || "";
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeRelativePath(value) {
  return String(value || "entries").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function fromBase64(value) {
  return Buffer.from(value, "base64").toString("utf8");
}

function toBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function gitlabFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "PRIVATE-TOKEN": token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  return response;
}

async function fileExists(apiV4Url, projectId, token, branch, filePath) {
  const encodedProject = encodeURIComponent(projectId);
  const encodedPath = encodeURIComponent(filePath);
  const encodedBranch = encodeURIComponent(branch);
  const url = `${apiV4Url}/projects/${encodedProject}/repository/files/${encodedPath}?ref=${encodedBranch}`;
  const response = await gitlabFetch(url, token);

  if (response.ok) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }

  throw new Error(`Failed to check file ${filePath}: ${response.status} ${await response.text()}`);
}

async function getAvailableFilename(apiV4Url, projectId, token, branch, entriesPath, filename) {
  const baseName = filename.replace(/\.md$/i, "");
  let candidate = filename;
  let counter = 2;

  while (await fileExists(apiV4Url, projectId, token, branch, `${entriesPath}/${candidate}`)) {
    candidate = `${baseName}-${counter}.md`;
    counter += 1;
  }

  return candidate;
}

async function main() {
  const apiV4Url = requiredEnv("CI_API_V4_URL");
  const projectId = requiredEnv("CI_PROJECT_ID");
  const writeToken = requiredEnv("GITLAB_WRITE_TOKEN");
  const targetBranch = process.env.TARGET_BRANCH || process.env.CI_COMMIT_REF_NAME || "main";
  const entriesPath = normalizeRelativePath(process.env.ENTRIES_PATH || "entries");
  const requestedFilename = requiredEnv("ENTRY_FILENAME");
  const markdown = fromBase64(requiredEnv("ENTRY_MARKDOWN_BASE64"));
  const imagesJson = process.env.ENTRY_IMAGES_JSON_BASE64
    ? fromBase64(process.env.ENTRY_IMAGES_JSON_BASE64)
    : "[]";
  const images = JSON.parse(imagesJson);
  const targetFilename = await getAvailableFilename(apiV4Url, projectId, writeToken, targetBranch, entriesPath, requestedFilename);

  const actions = [
    {
      action: "create",
      file_path: `${entriesPath}/${targetFilename}`,
      content: toBase64(markdown),
      encoding: "base64"
    }
  ];

  for (const image of images) {
    if (!image.path || !image.base64) {
      continue;
    }
    actions.push({
      action: "create",
      file_path: image.path,
      content: image.base64,
      encoding: "base64"
    });
  }

  const url = `${apiV4Url}/projects/${encodeURIComponent(projectId)}/repository/commits`;
  const response = await gitlabFetch(url, writeToken, {
    method: "POST",
    body: JSON.stringify({
      branch: targetBranch,
      commit_message: `docs: add troubleshooting entry ${targetFilename}`,
      actions
    })
  });

  if (![200, 201].includes(response.status)) {
    throw new Error(`Failed to create commit: ${response.status} ${await response.text()}`);
  }

  console.log(`Created troubleshooting entry: ${entriesPath}/${targetFilename}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
