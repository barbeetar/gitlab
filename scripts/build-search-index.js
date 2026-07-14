const fs = require("fs");
const path = require("path");

const entriesPath = "entries";
fs.mkdirSync(entriesPath, { recursive: true });

function parseMarkdown(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }

  const meta = {};
  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    meta[key] = value;
  }

  return { meta, body: match[2] };
}

function extractSection(body, heading) {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$\\n([\\s\\S]*?)(?=^## |\\z)`, "m");
  const match = body.match(pattern);
  return match ? match[1].trim() : "";
}

function parseTags(value) {
  return String(value || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const entries = fs.readdirSync(entriesPath)
  .filter((file) => file.toLowerCase().endsWith(".md"))
  .sort()
  .map((file) => {
    const filePath = path.join(entriesPath, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseMarkdown(raw);

    return {
      path: filePath.replace(/\\/g, "/"),
      sourceName: file,
      title: meta.title || file.replace(/\.md$/i, ""),
      date: meta.date || "",
      unit: meta.unit || "",
      tags: parseTags(meta.tags),
      screenshot: meta.screenshot || "",
      screenshotImage: meta.screenshotImage || "",
      symptom: extractSection(body, "問題現象"),
      cause: extractSection(body, "判斷問題原因"),
      solution: extractSection(body, "解決方式")
    };
  });

fs.writeFileSync(path.join(entriesPath, "search-index.json"), `${JSON.stringify(entries, null, 2)}\n`, "utf8");
