const entriesIndexPath = "entries/index.json";
const localSearchIndexPath = "entries/search-index.json";
const localIssuesIndexPath = "data/issues.json";

const form = document.getElementById("entry-form");
const markdownOutput = document.getElementById("markdown-output");
const markdownPreview = document.getElementById("markdown-preview");
const previewTitle = document.getElementById("preview-title");
const generatedFilename = document.getElementById("generated-filename");
const copyButton = document.getElementById("copy-markdown");
const downloadButton = document.getElementById("download-markdown");
const saveToRepoButton = document.getElementById("save-to-repo");
const searchForm = document.getElementById("search-form");
const searchSourceSelect = document.getElementById("search-source");
const resultsContainer = document.getElementById("search-results");
const entryCount = document.getElementById("entry-count");
const queryButton = document.getElementById("query-entries");
const clearSearchButton = document.getElementById("clear-search");
const reloadButton = document.getElementById("reload-entries");
const toggleSearchPanelButton = document.getElementById("toggle-search-panel");
const searchPanelBody = document.getElementById("search-panel-body");
const pageSizeSelect = document.getElementById("page-size");
const sortResultsSelect = document.getElementById("sort-results");
const prevPageButton = document.getElementById("prev-page");
const nextPageButton = document.getElementById("next-page");
const pageStatus = document.getElementById("page-status");
const loadingStatus = document.getElementById("loading-status");
const loadingBarFill = document.getElementById("loading-bar-fill");
const loadingMessage = document.getElementById("loading-message");
const resultTemplate = document.getElementById("result-template");
const repoStatus = document.getElementById("repo-status");
const apiForm = document.getElementById("api-form");
const saveApiConfigButton = document.getElementById("save-api-config");
const apiStatus = document.getElementById("api-status");
const apiProgress = document.getElementById("api-progress");
const apiProgressFill = document.getElementById("api-progress-fill");
const apiProgressMessage = document.getElementById("api-progress-message");
const editorImageFile = document.getElementById("editor-image-file");
const editorUploadStatus = document.getElementById("editor-upload-status");
const screenshotFile = document.getElementById("screenshot-file");
const screenshotPasteZone = document.getElementById("screenshot-paste-zone");

let generatedState = { filename: "", markdown: "" };
let allEntries = [];
let filteredEntries = [];
let currentPage = 1;
let hasLoadedEntries = false;
let hasAttemptedSearch = false;
let isLoadingEntries = false;
let activeEditor = null;
let pendingImages = [];
let draftFilenameKey = "";
let draftTimestampSuffix = "";
const apiConfigStorageKey = "troubleshooting-actions-config";
const maxImageWidth = 900;
const maxImageHeight = 650;
const maxSingleImageBase64Chars = 90000;
const maxImagesPayloadChars = 120000;

function setLoadingStatus(message, progress = 0, visible = true) {
  loadingStatus.classList.toggle("hidden", !visible);
  loadingMessage.textContent = message;
  loadingBarFill.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
}

function hideLoadingStatus() {
  setLoadingStatus("", 100, false);
}

function setApiProgress(message, progress = 0, visible = true) {
  apiProgress.classList.toggle("hidden", !visible);
  apiProgressMessage.textContent = message;
  apiProgressFill.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
}

function hideApiProgress() {
  setApiProgress("", 100, false);
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildTimestampSuffix(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function getDraftTimestampSuffix(data) {
  const draftKey = [data.date, data.unit, data.title].map((value) => String(value || "").trim()).join("|");
  if (!draftTimestampSuffix || draftFilenameKey !== draftKey) {
    draftFilenameKey = draftKey;
    draftTimestampSuffix = buildTimestampSuffix();
  }
  return draftTimestampSuffix;
}

function resetDraftFilename() {
  draftFilenameKey = "";
  draftTimestampSuffix = "";
}

function escapeBlock(text) {
  return String(text || "").trim().replace(/\r\n/g, "\n");
}

function normalizeRelativePath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(text) {
  return renderEscapedInlineMarkdown(escapeHtml(text));
}

function renderTrustedInlineMarkdown(text) {
  return renderEscapedInlineMarkdown(escapeHtml(text)
    .replace(/&lt;img\s+([^&]*?)src=&quot;([^&]+)&quot;([^&]*?)&gt;/gi, (_match, before, src, after) => {
      const altMatch = `${before} ${after}`.match(/alt=&quot;([^&]*)&quot;/i);
      const alt = altMatch ? altMatch[1] : "GitLab issue image";
      return `![${alt}](${src})`;
    }));
}

function renderEscapedInlineMarkdown(escapedText) {
  return escapedText
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      const pendingImage = pendingImages.find((image) => image.path === src);
      const safeSrc = escapeHtml(pendingImage ? pendingImage.previewUrl : src);
      const safeAlt = escapeHtml(alt || "image");
      return `
        <figure class="markdown-image">
          <img src="${safeSrc}" alt="${safeAlt}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('image-load-failed')">
          <figcaption><a href="${safeSrc}" target="_blank" rel="noreferrer">開啟圖片</a><span>圖片無法載入，請確認 GitLab 登入狀態或圖片權限。</span></figcaption>
        </figure>
      `;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const safeHref = escapeHtml(href);
      return `<a href="${safeHref}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function isTableBlock(lines) {
  return lines.length >= 2
    && lines[0].includes("|")
    && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1]);
}

function renderTable(lines) {
  const parseRow = (line) => line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).filter((line) => line.includes("|")).map(parseRow);

  return `
    <table>
      <thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function renderMarkdownBlock(text, options = {}) {
  const inlineRenderer = options.trustedHtmlImages ? renderTrustedInlineMarkdown : renderInlineMarkdown;
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    const headingMatch = lines[index].match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 1, 4);
      blocks.push(`<h${level}>${inlineRenderer(headingMatch[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    const tableCandidate = lines.slice(index, index + 8);
    if (isTableBlock(tableCandidate)) {
      const tableLines = [];
      while (index < lines.length && lines[index].includes("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    if (/^\s*[-*]\s+/.test(lines[index])) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${inlineRenderer(item)}</li>`).join("")}</ul>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^\s*[-*]\s+/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${inlineRenderer(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }

  return blocks.join("");
}

function buildMarkdown(data) {
  const tags = data.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const slugBase = slugify(`${data.date}-${data.unit}-${data.title}`) || "draft-entry";
  const filename = `${slugBase}-${getDraftTimestampSuffix(data)}.md`;

  const markdown = `---
title: ${data.title}
date: ${data.date}
unit: ${data.unit}
tags: [${tags.join(", ")}]
screenshot: ${data.screenshot || ""}
screenshotImage: ${data.screenshotImage || ""}
---

## 問題現象
${escapeBlock(data.symptom)}

## 判斷問題原因
${escapeBlock(data.cause)}

## 解決方式
${escapeBlock(data.solution)}
`;

  return { filename, markdown };
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
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
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = body.match(pattern);
  return match ? match[1].trim() : "";
}

function normalizeTags(tagString) {
  return String(tagString || "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function buildEntryFromMarkdown(raw, options = {}) {
  const { meta, body } = parseFrontMatter(raw);
  return {
    path: options.path || "",
    apiPath: options.apiPath || "",
    repoConfig: options.repoConfig || null,
    raw,
    loaded: true,
    sourceName: options.sourceName || "",
    title: meta.title || options.fallbackTitle || "未命名紀錄",
    date: meta.date || "",
    unit: meta.unit || "",
    screenshot: meta.screenshot || "",
    screenshotImage: meta.screenshotImage || "",
    tags: normalizeTags(meta.tags || ""),
    symptom: extractSection(body, "問題現象"),
    cause: extractSection(body, "判斷問題原因"),
    solution: extractSection(body, "解決方式")
  };
}

function buildEntryFromLocalSearchIndexItem(item) {
  const apiPath = normalizeRelativePath(item.path || item.filename || "");
  const sourceName = item.sourceName || apiPath.split("/").pop() || "entry.md";
  return {
    path: apiPath,
    apiPath,
    repoConfig: null,
    raw: "",
    loaded: true,
    sourceName,
    title: item.title || sourceName.replace(/\.md$/i, ""),
    date: item.date || "",
    unit: item.unit || "",
    screenshot: item.screenshot || "",
    screenshotImage: item.screenshotImage || "",
    tags: Array.isArray(item.tags) ? item.tags : normalizeTags(item.tags || ""),
    symptom: item.symptom || "",
    cause: item.cause || "",
    solution: item.solution || ""
  };
}

function isIncompleteIndexedEntry(entry) {
  return !entry.date || !entry.unit || !entry.symptom || !entry.cause || !entry.solution;
}

async function hydrateIncompleteIndexedEntries(entries) {
  const hydrated = [];
  let completed = 0;
  const incompleteCount = entries.filter(isIncompleteIndexedEntry).length;

  for (const entry of entries) {
    if (!isIncompleteIndexedEntry(entry) || !entry.path) {
      hydrated.push(entry);
      continue;
    }

    try {
      completed += 1;
      setLoadingStatus(`正在補齊不完整索引：${completed}/${incompleteCount}`, 45 + (completed / incompleteCount) * 35);
      const response = await fetch(`${entry.path}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        hydrated.push(entry);
        continue;
      }

      const raw = await response.text();
      const parsed = buildEntryFromMarkdown(raw, {
        path: entry.path,
        sourceName: entry.sourceName,
        fallbackTitle: entry.title
      });
      hydrated.push({
        ...entry,
        ...parsed,
        title: parsed.title || entry.title,
        sourceName: entry.sourceName || parsed.sourceName
      });
    } catch (error) {
      console.warn("Failed to hydrate incomplete indexed entry", entry.path, error);
      hydrated.push(entry);
    }
  }

  return hydrated;
}

function renderMarkdownArticle(entry) {
  if (entry.issueIid) {
    const tagsHtml = entry.tags.length
      ? `<p><strong>Labels:</strong> ${entry.tags.map((tag) => `<code>${escapeHtml(tag)}</code>`).join(" ")}</p>`
      : "";
    const issueLinkHtml = entry.path
      ? `<p><strong>Issue:</strong> <a href="${escapeHtml(entry.path)}" target="_blank" rel="noreferrer">${escapeHtml(entry.sourceName || entry.path)}</a></p>`
      : "";
    return `
      <h1>${escapeHtml(entry.title || "未命名 Issue")}</h1>
      <p><strong>建立日期:</strong> ${escapeHtml(entry.date || "未填日期")}</p>
      ${entry.unit ? `<p><strong>提出單位:</strong> ${escapeHtml(entry.unit)}</p>` : ""}
      ${tagsHtml}
      ${issueLinkHtml}
      <hr>
      ${renderMarkdownBlock(entry.raw || entry.symptom || "未填寫", { trustedHtmlImages: true })}
    `;
  }

  const tagsHtml = entry.tags.length
    ? `<p><strong>Tags:</strong> ${entry.tags.map((tag) => `<code>${escapeHtml(tag)}</code>`).join(" ")}</p>`
    : "";
  const screenshotLinkHtml = entry.screenshot
    ? `<p><strong>畫面網站連結:</strong> <a href="${escapeHtml(entry.screenshot)}" target="_blank" rel="noreferrer">${escapeHtml(entry.screenshot)}</a></p>`
    : "";
  const screenshotImageHtml = entry.screenshotImage
    ? renderScreenshotImage(entry.screenshotImage)
    : "";

  return `
    <h1>${escapeHtml(entry.title || "未命名紀錄")}</h1>
    <p><strong>日期:</strong> ${escapeHtml(entry.date || "未填日期")}</p>
    <p><strong>提出單位:</strong> ${escapeHtml(entry.unit || "未填單位")}</p>
    ${tagsHtml}
    ${screenshotLinkHtml}
    ${screenshotImageHtml}
    <hr>
    <h2>問題現象</h2>
    ${renderMarkdownBlock(entry.symptom || "未填寫")}
    <h2>判斷問題原因</h2>
    ${renderMarkdownBlock(entry.cause || "未填寫")}
    <h2>解決方式</h2>
    ${renderMarkdownBlock(entry.solution || "未填寫")}
  `;
}

function renderScreenshotImage(screenshotImage) {
  const pendingImage = pendingImages.find((image) => image.path === screenshotImage);
  const displayUrl = pendingImage ? pendingImage.previewUrl : screenshotImage;
  const safeDisplayUrl = escapeHtml(displayUrl);
  const safeScreenshotImage = escapeHtml(screenshotImage);
  const imageHtml = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(screenshotImage)
    ? `<img src="${safeDisplayUrl}" alt="問題現象畫面截圖">`
    : "";

  return `
    <p><strong>畫面截圖:</strong> <a href="${safeDisplayUrl}" target="_blank" rel="noreferrer">${safeScreenshotImage}</a></p>
    ${imageHtml}
  `;
}

function renderGeneratedMarkdown(state) {
  generatedState = state;
  const generatedEntry = buildEntryFromMarkdown(state.markdown, {
    sourceName: state.filename,
    fallbackTitle: state.filename.replace(/\.md$/i, "")
  });
  renderMainPreview(generatedEntry, {
    previewLabel: "建立文件預覽",
    filenameLabel: `建議檔名：entries/${state.filename}`,
    rawMarkdown: state.markdown
  });
}

function getTargetEditor() {
  if (activeEditor && form.contains(activeEditor)) {
    return activeEditor;
  }
  return form.querySelector("textarea[name='symptom']");
}

function insertIntoEditor(before, selectedFallback = "", after = "") {
  const editor = getTargetEditor();
  if (!editor) {
    return;
  }

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || selectedFallback;
  const replacement = `${before}${selected}${after}`;
  editor.value = `${editor.value.slice(0, start)}${replacement}${editor.value.slice(end)}`;
  editor.focus();
  editor.setSelectionRange(start + before.length, start + before.length + selected.length);
}

function insertBlockIntoEditor(block) {
  const editor = getTargetEditor();
  if (!editor) {
    return;
  }

  const start = editor.selectionStart;
  const prefix = start > 0 && !editor.value.slice(0, start).endsWith("\n") ? "\n\n" : "";
  const suffix = editor.value.slice(start).startsWith("\n") ? "\n" : "\n\n";
  const replacement = `${prefix}${block}${suffix}`;
  editor.value = `${editor.value.slice(0, start)}${replacement}${editor.value.slice(start)}`;
  editor.focus();
  const cursor = start + replacement.length;
  editor.setSelectionRange(cursor, cursor);
}

function safeAssetName(fileName) {
  const extension = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "png";
  const baseName = slugify(fileName.replace(/\.[^.]+$/, "")) || "image";
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${uniquePart}-${baseName}.${extension}`;
}

function safeCompressedAssetName(fileName) {
  const baseName = slugify(fileName.replace(/\.[^.]+$/, "")) || "image";
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${uniquePart}-${baseName}.jpg`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片讀取失敗，無法壓縮。"));
    image.src = dataUrl;
  });
}

async function prepareImageForRepo(file) {
  if (/image\/(gif|svg\+xml)/i.test(file.type)) {
    const base64 = await readFileAsBase64(file);
    if (base64.length > maxSingleImageBase64Chars) {
      throw new Error("GIF/SVG 圖片太大，請改用較小的 PNG/JPG 截圖。");
    }
    return {
      path: `assets/${safeAssetName(file.name)}`,
      base64,
      name: file.name,
      previewUrl: URL.createObjectURL(file)
    };
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const initialRatio = Math.min(1, maxImageWidth / image.width, maxImageHeight / image.height);
  const scales = [1, 0.85, 0.7, 0.55, 0.42];
  const qualities = [0.72, 0.62, 0.52, 0.42];

  for (const scale of scales) {
    const ratio = initialRatio * scale;
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = compressedDataUrl.includes(",") ? compressedDataUrl.split(",")[1] : compressedDataUrl;
      if (base64.length <= maxSingleImageBase64Chars) {
        return {
          path: `assets/${safeCompressedAssetName(file.name)}`,
          base64,
          name: file.name,
          previewUrl: compressedDataUrl
        };
      }
    }
  }

  throw new Error("圖片仍然太大，請縮小截圖範圍後再貼上。");
}

async function handleEditorImageFiles(files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) {
    return;
  }

  const snippets = [];
  for (const file of selectedFiles) {
    if (!file.type.startsWith("image/")) {
      continue;
    }
    const preparedImage = await prepareImageForRepo(file);
    pendingImages.push(preparedImage);
    snippets.push(`![${preparedImage.name}](${preparedImage.path})`);
  }

  if (snippets.length) {
    insertBlockIntoEditor(snippets.join("\n\n"));
    editorUploadStatus.textContent = `已加入 ${pendingImages.length} 張待上傳圖片，圖片會先壓縮後再送到 pipeline。`;
    updatePreviewFromCurrentForm();
  }

  editorImageFile.value = "";
}

async function handleScreenshotFile(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    editorUploadStatus.textContent = "問題現象畫面截圖只支援圖片檔。";
    return;
  }

  const preparedImage = await prepareImageForRepo(file);
  pendingImages.push(preparedImage);

  const screenshotImageField = form.elements.namedItem("screenshotImage");
  if (screenshotImageField) {
    screenshotImageField.value = preparedImage.path;
  }

  editorUploadStatus.textContent = `已加入問題現象截圖：${preparedImage.path}。圖片已壓縮，按「寫入 Repo」時會上傳到 repo。`;
  updatePreviewFromCurrentForm();
}

async function handleScreenshotPaste(event) {
  const clipboard = event.clipboardData;
  const imageFile = Array.from(clipboard?.items || [])
    .find((item) => item.type.startsWith("image/"))
    ?.getAsFile()
    || Array.from(clipboard?.files || []).find((file) => file.type.startsWith("image/"));

  if (!imageFile) {
    editorUploadStatus.textContent = "剪貼簿裡沒有圖片，請先截圖或複製圖片後再貼上。";
    return;
  }

  event.preventDefault();
  screenshotPasteZone.textContent = "或點這裡後直接貼上截圖（Ctrl + V）";
  await handleScreenshotFile(imageFile);
}

async function handleEditorPaste(event) {
  const imageFiles = Array.from(event.clipboardData?.files || [])
    .filter((file) => file.type.startsWith("image/"));

  if (!imageFiles.length) {
    return;
  }

  event.preventDefault();
  activeEditor = event.currentTarget;
  await handleEditorImageFiles(imageFiles);
}

function updatePreviewFromCurrentForm() {
  const data = Object.fromEntries(new FormData(form).entries());
  renderGeneratedMarkdown(buildMarkdown(data));
}

function handleEditorCommand(command) {
  if (command === "bold") {
    insertIntoEditor("**", "粗體文字", "**");
    return;
  }

  if (command === "list") {
    insertBlockIntoEditor("- 項目一\n- 項目二\n- 項目三");
    return;
  }

  if (command === "table") {
    insertBlockIntoEditor("| 欄位一 | 欄位二 | 欄位三 |\n| --- | --- | --- |\n| 內容 | 內容 | 內容 |");
    return;
  }

  if (command === "image-upload") {
    editorImageFile.click();
  }
}

function renderMainPreview(entry, options = {}) {
  previewTitle.textContent = options.previewLabel || "文件預覽";
  generatedFilename.textContent = options.filenameLabel || entry.sourceName || "目前預覽文件";
  markdownPreview.innerHTML = renderMarkdownArticle(entry);
  markdownOutput.textContent = options.rawMarkdown || "";
}

function setRepoStatus(message) {
  repoStatus.textContent = message;
}

function setApiStatus(message) {
  apiStatus.textContent = message;
}

function getApiConfig() {
  const data = Object.fromEntries(new FormData(apiForm).entries());
  return {
    gitlabProjectId: String(data.gitlabProjectId || "").trim(),
    gitlabToken: String(data.gitlabToken || "").trim(),
    gitlabBaseUrl: normalizeGitLabBaseUrl(data.gitlabBaseUrl || "https://gitlab.com"),
    entriesPath: normalizeRelativePath(data.entriesPath || "entries"),
    branch: String(data.branch || "").trim()
  };
}

function normalizeGitLabBaseUrl(value) {
  const raw = String(value || "https://gitlab.com").trim();
  try {
    const url = new URL(raw);
    return url.origin;
  } catch (_error) {
    return raw.replace(/\/$/, "");
  }
}

function getIssueProjectWebUrl(issue, config) {
  if (issue.web_url && issue.web_url.includes("/-/issues/")) {
    return issue.web_url.split("/-/issues/")[0];
  }
  return `${config.gitlabBaseUrl}/${String(config.gitlabProjectId || "").replace(/^\/+|\/+$/g, "")}`;
}

function getIssueUploadsBaseUrl(issue, config) {
  const projectId = String(issue.project_id || config.gitlabProjectId || "").trim();
  if (/^\d+$/.test(projectId)) {
    return `${config.gitlabBaseUrl.replace(/\/$/, "")}/-/project/${projectId}/uploads/`;
  }

  return `${getIssueProjectWebUrl(issue, config).replace(/\/$/, "")}/uploads/`;
}

function normalizeIssueMarkdownUrls(markdown, issue, config) {
  const projectWebUrl = getIssueProjectWebUrl(issue, config).replace(/\/$/, "");
  const uploadsBaseUrl = getIssueUploadsBaseUrl(issue, config);
  const gitlabBaseUrl = config.gitlabBaseUrl.replace(/\/$/, "");
  return String(markdown || "")
    .replace(/(!?\[[^\]]*\]\()\s*\/uploads\//g, `$1${uploadsBaseUrl}`)
    .replace(/(!?\[[^\]]*\]\()\s*uploads\//g, `$1${uploadsBaseUrl}`)
    .replace(/(!?\[[^\]]*\]\()\s*\/(?!\/)/g, `$1${gitlabBaseUrl}/`)
    .replace(/(<img\b[^>]*\bsrc=["'])\/uploads\//gi, `$1${uploadsBaseUrl}`)
    .replace(/(<img\b[^>]*\bsrc=["'])uploads\//gi, `$1${uploadsBaseUrl}`)
    .replace(/(<img\b[^>]*\bsrc=["'])\/(?!\/)/gi, `$1${gitlabBaseUrl}/`);
}

function extractUnitFromIssue(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const unitLabel = labels.find((label) => /^(unit|單位|提出單位)::/i.test(label));
  return unitLabel ? unitLabel.split("::").slice(1).join("::").trim() : "";
}

function buildEntryFromGitLabIssue(issue, config) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const description = normalizeIssueMarkdownUrls(issue.description || "", issue, config);
  return {
    path: issue.web_url || "",
    apiPath: "",
    repoConfig: null,
    raw: description,
    loaded: true,
    sourceName: `Issue #${issue.iid}`,
    title: issue.title || `Issue #${issue.iid}`,
    date: String(issue.created_at || issue.updated_at || "").slice(0, 10),
    unit: extractUnitFromIssue(issue),
    screenshot: issue.web_url || "",
    screenshotImage: "",
    tags: labels,
    symptom: description,
    cause: "",
    solution: "",
    issueState: issue.state || "",
    issueIid: issue.iid
  };
}

async function loadGitLabIssues() {
  const config = getApiConfig();
  setLoadingStatus(`正在讀取 ${localIssuesIndexPath}...`, 35);
  const response = await fetch(`${localIssuesIndexPath}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`無法載入 ${localIssuesIndexPath}。請確認 GitLab Pages pipeline 已成功產生 issues.json。`);
  }
  const issuesIndex = await response.json();
  const issues = Array.isArray(issuesIndex) ? issuesIndex : issuesIndex.issues || [];
  return sortEntries(issues.map((issue) => buildEntryFromGitLabIssue(issue, config)));
}

function saveApiConfig() {
  const config = getApiConfig();
  localStorage.setItem(apiConfigStorageKey, JSON.stringify({
    gitlabProjectId: config.gitlabProjectId,
    gitlabBaseUrl: config.gitlabBaseUrl,
    entriesPath: config.entriesPath,
    branch: config.branch
  }));
  const tokenNote = config.gitlabToken
    ? "目前頁面已有 Pipeline Trigger Token，可觸發寫入 pipeline；重新開頁後需重新貼上。"
    : "Pipeline Trigger Token 欄位目前是空的，無法觸發寫入 pipeline。";
  setApiStatus(`已儲存 Project ID、Markdown 目錄、Branch 與 Base URL。${tokenNote} GitLab Issues 查詢會讀取 CI 產生的 ${localIssuesIndexPath}。`);
  allEntries = [];
  filteredEntries = [];
  hasLoadedEntries = false;
  hasAttemptedSearch = false;
  updateUnitOptions();
  showInitialSearchState();
}

function restoreApiConfig() {
  try {
    const raw = localStorage.getItem(apiConfigStorageKey);
    if (!raw) {
      return;
    }

    const config = JSON.parse(raw);
    const projectIdField = apiForm.elements.namedItem("gitlabProjectId");
    const tokenField = apiForm.elements.namedItem("gitlabToken");
    const baseUrlField = apiForm.elements.namedItem("gitlabBaseUrl");
    const entriesPathField = apiForm.elements.namedItem("entriesPath");
    const branchField = apiForm.elements.namedItem("branch");
    if (projectIdField) {
      projectIdField.value = config.gitlabProjectId || "";
    }
    if (tokenField) {
      tokenField.value = "";
    }
    if (baseUrlField) {
      baseUrlField.value = config.gitlabBaseUrl || "https://gitlab.com";
    }
    if (entriesPathField) {
      entriesPathField.value = config.entriesPath || "entries";
    }
    if (branchField) {
      branchField.value = config.branch || "";
    }
    setApiStatus(`已載入 Project ID、Markdown 目錄、Branch 與 Base URL。Pipeline Trigger Token 不會長期儲存；GitLab Issues 查詢讀取 ${localIssuesIndexPath}。`);
  } catch (error) {
    console.error(error);
  }
}

async function copyMarkdown() {
  if (!generatedState.markdown) {
    return;
  }

  await navigator.clipboard.writeText(generatedState.markdown);
}

async function saveMarkdownToRepo() {
  setApiProgress("正在檢查表單...", 5);
  if (!form.reportValidity()) {
    setApiStatus("請先完成必填欄位再寫入 GitLab");
    hideApiProgress();
    return;
  }

  setApiProgress("正在產生最新 Markdown...", 12);
  const currentData = Object.fromEntries(new FormData(form).entries());
  renderGeneratedMarkdown(buildMarkdown(currentData));

  if (!generatedState.markdown) {
    setApiStatus("請先產生 Markdown 再寫入 GitLab");
    hideApiProgress();
    return;
  }

  const config = getApiConfig();
  if (!config.gitlabProjectId) {
    setApiStatus("請先填入 GitLab Project ID。");
    hideApiProgress();
    return;
  }

  if (!config.gitlabToken) {
    setApiStatus("請先填入 Pipeline Trigger Token。");
    hideApiProgress();
    return;
  }

  const branch = config.branch || "main";
  const entriesPath = config.entriesPath || "entries";
  const apiBase = `${config.gitlabBaseUrl || "https://gitlab.com"}/api/v4/projects/${encodeURIComponent(config.gitlabProjectId)}`;
  const imageNote = pendingImages.length ? `，包含 ${pendingImages.length} 張待上傳圖片` : "";
  setApiStatus(`正在觸發 GitLab pipeline，由 CI/CD Variables 內的 token 寫入 repo${imageNote}...`);
  setApiProgress("正在準備 pipeline payload...", 25);

  try {
    validateImagesPayload(pendingImages);
    const imagesPayload = buildImagesTsv(pendingImages);
    const body = new URLSearchParams({
      token: config.gitlabToken,
      ref: branch,
      "variables[TRIGGER_ACTION]": "create_entry",
      "variables[ENTRY_FILENAME]": generatedState.filename,
      "variables[ENTRY_MARKDOWN_BASE64]": toBase64Unicode(generatedState.markdown),
      "variables[ENTRY_IMAGES_TSV_BASE64]": toBase64Unicode(imagesPayload),
      "variables[ENTRIES_PATH]": entriesPath,
      "variables[TARGET_BRANCH]": branch
    });

    setApiProgress("正在觸發 GitLab pipeline...", 45);
    const response = await fetch(`${apiBase}/trigger/pipeline`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(buildGitLabTriggerError(response.status, errorText, config));
    }

    const result = await response.json();
    setApiProgress("已觸發 pipeline，正在等待 Pages 出現新資料...", 60);
    setApiStatus(`已觸發 pipeline：${generatedState.filename}${result.web_url ? `（${result.web_url}）` : ""}`);

    await waitForEntryPublished(generatedState.filename);

    setApiProgress("新資料已部署到 Pages，可以重新查詢。", 100);
    setApiStatus(`寫入完成：${entriesPath}/${generatedState.filename}`);
    setRepoStatus("新資料已出現在 search-index.json。已重新讀取資料。");
    pendingImages = [];
    resetDraftFilename();
    editorUploadStatus.textContent = "待上傳圖片已送出。";
    hasLoadedEntries = false;
    await loadEntries();
    setTimeout(hideApiProgress, 2500);
  } catch (error) {
    setApiStatus(`寫入失敗: ${error.message}`);
    setApiProgress("寫入失敗，請查看錯誤訊息。", 100);
    console.error(error);
  }
}

function buildGitLabTriggerError(status, errorText, config) {
  const cleanText = stripHtml(errorText).trim();
  if (status === 404) {
    const pagesHostHint = /pages/i.test(config.gitlabBaseUrl)
      ? "目前 GitLab Base URL 看起來是 GitLab Pages 主機；Pages 主機通常沒有 /api/v4，請改填 GitLab 專案管理介面的主機。"
      : "";
    return [
      `目前 API Base：${config.gitlabBaseUrl}/api/v4/projects/${encodeURIComponent(config.gitlabProjectId)}`,
      "GitLab pipeline 觸發失敗 404：找不到 project 或 trigger endpoint。",
      pagesHostHint,
      "GitLab Base URL 必須填 GitLab 專案管理介面的根網址，不是 GitLab Pages 網址，也不是 project URL。",
      "例如你平常進 GitLab repo 的網址如果是 https://gitlab.company.com/group/project，這裡只填 https://gitlab.company.com。",
      "請確認 GitLab Project ID 正確，建議使用數字 Project ID。",
      "請確認 Pipeline Trigger Token 是在同一個 project 建立。",
      "請確認 Branch 填的是實際存在的分支。"
    ].filter(Boolean).join(" ");
  }
  if (status === 403 || status === 401) {
    return "GitLab pipeline 觸發失敗：Trigger Token 無效、過期，或沒有權限觸發這個 project。";
  }
  return cleanText || `GitLab pipeline 觸發失敗 ${status}`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function toBase64Unicode(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function buildImagesTsv(images) {
  const rows = images
    .map((image) => `${image.path}\t${image.base64}`)
    .join("\n");
  return rows ? `${rows}\n` : "";
}

function validateImagesPayload(images) {
  const payloadLength = toBase64Unicode(buildImagesTsv(images)).length;
  if (payloadLength > maxImagesPayloadChars) {
    throw new Error(`待上傳圖片太大，目前約 ${Math.ceil(payloadLength / 1024)} KB，請減少圖片數量或縮小截圖範圍後再寫入。`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEntryPublished(filename) {
  const baseName = filename.replace(/\.md$/i, "");
  const filenamePattern = new RegExp(`^${escapeRegExp(baseName)}(?:-\\d+)?\\.md$`, "i");
  for (let attempt = 1; attempt <= 80; attempt += 1) {
    const progress = Math.min(98, 60 + attempt * 0.45);
    setApiProgress("Pipeline 已觸發，正在等待 GitLab Pages 更新搜尋索引...", progress);

    try {
      const response = await fetch(`${localSearchIndexPath}?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const index = await response.json();
        const items = Array.isArray(index) ? index : index.entries || [];
        const found = items.some((item) => {
          const sourceName = item.sourceName || String(item.path || "").split("/").pop() || item.filename || "";
          const itemFilename = item.filename || sourceName;
          const pathFilename = String(item.path || "").split("/").pop() || "";
          return filenamePattern.test(sourceName) || filenamePattern.test(itemFilename) || filenamePattern.test(pathFilename);
        });
        if (found) {
          return;
        }
      }
    } catch (error) {
      console.warn("search-index polling failed", error);
    }

    await sleep(3000);
  }

  throw new Error("已觸發 pipeline，但等待 Pages 更新逾時。請到 GitLab Pipelines 確認狀態，成功後再按重新讀取資料。");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function downloadMarkdown() {
  if (!generatedState.markdown) {
    return;
  }

  const blob = new Blob([generatedState.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = generatedState.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderResults(entries) {
  resultsContainer.innerHTML = "";
  entryCount.textContent = `共 ${entries.length} 筆紀錄`;
  const pageSize = Number(pageSizeSelect.value) || 10;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedEntries = entries.slice(startIndex, startIndex + pageSize);
  pageStatus.textContent = `第 ${currentPage} / ${totalPages} 頁`;
  prevPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled = currentPage >= totalPages;

  if (!entries.length) {
    resultsContainer.innerHTML = `<div class="result-card">找不到符合條件的紀錄。</div>`;
    pageStatus.textContent = "第 0 / 0 頁";
    prevPageButton.disabled = true;
    nextPageButton.disabled = true;
    return;
  }

  for (const entry of pagedEntries) {
    const fragment = resultTemplate.content.cloneNode(true);
    const meta = fragment.querySelector(".result-meta");
    const titleEl = fragment.querySelector(".result-title");
    const summaryEl = fragment.querySelector(".result-summary");
    const fileLink = fragment.querySelector(".result-file");
    const detail = fragment.querySelector(".result-detail");
    const toggle = fragment.querySelector(".result-toggle");
    const openButton = fragment.querySelector(".result-open");

    if (!meta || !titleEl || !summaryEl || !fileLink || !detail || !toggle || !openButton) {
      console.error("Result template is missing expected elements.");
      continue;
    }

    [entry.date || "未填日期", entry.unit || "未填單位", ...(entry.tags || [])].forEach((value) => {
      const pill = document.createElement("span");
      pill.className = "meta-pill";
      pill.textContent = value;
      meta.appendChild(pill);
    });

    titleEl.textContent = entry.title || "未命名紀錄";
    summaryEl.textContent = entry.symptom || entry.cause || entry.solution
      || (entry.loaded ? "沒有摘要" : `尚未載入內容。來源檔案：${entry.sourceName || entry.apiPath || "Markdown"}`);

    if (!entry.path) {
      fileLink.textContent = "無來源連結";
      fileLink.removeAttribute("href");
      fileLink.removeAttribute("target");
      fileLink.style.opacity = "0.6";
      fileLink.style.pointerEvents = "none";
    } else {
      fileLink.href = entry.path;
      fileLink.textContent = entry.issueIid ? "查看 Issue" : "查看 Markdown";
    }

    detail.classList.add("markdown-body");
    detail.innerHTML = renderMarkdownArticle(entry);

    toggle.addEventListener("click", async () => {
      if (detail.classList.contains("hidden")) {
        detail.classList.remove("hidden");
        toggle.textContent = "收合文件";
        return;
      }

      detail.classList.add("hidden");
      toggle.textContent = "展開文件";
    });

    openButton.addEventListener("click", async () => {
      renderMainPreview(entry, {
        previewLabel: "查詢文件預覽",
        filenameLabel: entry.issueIid
          ? `來源：GitLab Issue #${entry.issueIid}`
          : entry.path ? `來源：${entry.path}` : `來源：${entry.sourceName || entry.title || "Markdown 紀錄"}`,
        rawMarkdown: buildRawMarkdownFromEntry(entry)
      });
    });

    resultsContainer.appendChild(fragment);
  }
}

function showInitialSearchState() {
  filteredEntries = [];
  entryCount.textContent = hasLoadedEntries ? `已載入 ${allEntries.length} 筆，請輸入條件後按查詢` : "尚未查詢";
  resultsContainer.innerHTML = `<div class="result-card">請設定查詢條件後按「查詢」。如果讀取失敗，或 repo 資料更新後，才需要按「重新讀取資料」。</div>`;
  pageStatus.textContent = "第 0 / 0 頁";
  prevPageButton.disabled = true;
  nextPageButton.disabled = true;
  setSearchLoadingState(false);
}

function setSearchLoadingState(isLoading) {
  isLoadingEntries = isLoading;
  if (queryButton) {
    queryButton.disabled = isLoading;
    queryButton.textContent = isLoading ? "查詢中..." : "查詢";
  }
  if (reloadButton) {
    reloadButton.disabled = isLoading || !hasAttemptedSearch;
  }
}

function updateUnitOptions() {
  const unitList = document.getElementById("unit-options");
  if (!unitList) {
    return;
  }

  const units = [...new Set(allEntries
    .map((entry) => String(entry.unit || "").trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-Hant"));

  unitList.innerHTML = "";

  for (const unit of units) {
    const option = document.createElement("option");
    option.value = unit;
    unitList.appendChild(option);
  }
}

function buildRawMarkdownFromEntry(entry) {
  return entry.raw || [
    "---",
    `title: ${entry.title || ""}`,
    `date: ${entry.date || ""}`,
    `unit: ${entry.unit || ""}`,
    `tags: [${(entry.tags || []).join(", ")}]`,
    `screenshot: ${entry.screenshot || ""}`,
    `screenshotImage: ${entry.screenshotImage || ""}`,
    "---",
    "",
    "## 問題現象",
    entry.symptom || "",
    "",
    "## 判斷問題原因",
    entry.cause || "",
    "",
    "## 解決方式",
    entry.solution || ""
  ].join("\n");
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "zh-Hant", {
    numeric: true,
    sensitivity: "base"
  });
}

function applyResultSort(entries) {
  const sortMode = sortResultsSelect?.value || "date-desc";
  const sorted = [...entries];

  sorted.sort((left, right) => {
    if (sortMode === "date-asc") {
      return compareText(left.date || "", right.date || "") || compareText(left.title, right.title);
    }
    if (sortMode === "title-asc") {
      return compareText(left.title, right.title) || compareText(right.date || "", left.date || "");
    }
    if (sortMode === "title-desc") {
      return compareText(right.title, left.title) || compareText(right.date || "", left.date || "");
    }
    if (sortMode === "unit-asc") {
      return compareText(left.unit, right.unit) || compareText(right.date || "", left.date || "");
    }
    if (sortMode === "unit-desc") {
      return compareText(right.unit, left.unit) || compareText(right.date || "", left.date || "");
    }
    return compareText(right.date || "", left.date || "") || compareText(right.sourceName, left.sourceName);
  });

  return sorted;
}

function filterEntries() {
  const formData = new FormData(searchForm);
  const keyword = String(formData.get("keyword") || "").toLowerCase().trim();
  const unit = String(formData.get("unit") || "").toLowerCase().trim();
  const from = String(formData.get("from") || "");
  const to = String(formData.get("to") || "");

  filteredEntries = applyResultSort(allEntries.filter((entry) => {
    const haystack = [
      entry.title,
      entry.unit,
      entry.sourceName,
      entry.apiPath,
      entry.symptom,
      entry.cause,
      entry.solution,
      entry.tags.join(" ")
    ].join(" ").toLowerCase();

    const keywordMatch = !keyword || haystack.includes(keyword);
    const unitMatch = !unit || String(entry.unit || "").toLowerCase().includes(unit);
    const fromMatch = !from || entry.date >= from;
    const toMatch = !to || entry.date <= to;
    return keywordMatch && unitMatch && fromMatch && toMatch;
  }));

  currentPage = 1;
  renderResults(filteredEntries);
}

function updateResultSort() {
  if (!hasLoadedEntries || !hasAttemptedSearch) {
    return;
  }

  filteredEntries = applyResultSort(filteredEntries);
  currentPage = 1;
  renderResults(filteredEntries);
}

async function runSearch() {
  if (isLoadingEntries) {
    return;
  }

  hasAttemptedSearch = true;
  setSearchLoadingState(false);

  if (!hasLoadedEntries) {
    await loadEntries();
    return;
  }

  filterEntries();
}

function clearSearchConditions() {
  searchForm.reset();
  currentPage = 1;
  hasAttemptedSearch = false;
  showInitialSearchState();
}

async function reloadCurrentSearch() {
  if (isLoadingEntries) {
    return;
  }

  hasAttemptedSearch = true;
  await loadEntries();
}

function goToPage(direction) {
  const pageSize = Number(pageSizeSelect.value) || 10;
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  currentPage = Math.min(Math.max(currentPage + direction, 1), totalPages);
  renderResults(filteredEntries);
}

function toggleSearchPanel() {
  const isHidden = searchPanelBody.classList.toggle("hidden");
  toggleSearchPanelButton.textContent = isHidden ? "展開 ▼" : "收合 ▲";
  toggleSearchPanelButton.setAttribute("aria-expanded", String(!isHidden));
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    const left = a.date || a.sourceName || a.title || "";
    const right = b.date || b.sourceName || b.title || "";
    return right.localeCompare(left);
  });
}

async function loadEntries() {
  if (isLoadingEntries) {
    return;
  }

  setSearchLoadingState(true);
  entryCount.textContent = "載入資料中...";
  resultsContainer.innerHTML = "";
  pageStatus.textContent = "第 0 / 0 頁";
  prevPageButton.disabled = true;
  nextPageButton.disabled = true;
  setLoadingStatus("正在準備讀取資料...", 5);

  const source = searchSourceSelect?.value || "markdown";
  if (source === "issues") {
    try {
      setRepoStatus(`GitLab Issues 模式：正在讀取 ${localIssuesIndexPath}。`);
      setLoadingStatus("正在讀取 GitLab Issues 快取資料...", 10);
      allEntries = await loadGitLabIssues();
      hasLoadedEntries = true;
      updateUnitOptions();
      filterEntries();
      setRepoStatus(`已從 ${localIssuesIndexPath} 載入 ${allEntries.length} 筆 GitLab Issues 資料。`);
      hideLoadingStatus();
    } catch (error) {
      allEntries = [];
      filteredEntries = [];
      hasLoadedEntries = false;
      updateUnitOptions();
      entryCount.textContent = "無法載入 GitLab Issues";
      resultsContainer.innerHTML = `<div class="result-card">${escapeHtml(error.message || "GitLab Issues 讀取失敗。")}</div>`;
      console.error(error);
      hideLoadingStatus();
    }
    setSearchLoadingState(false);
    return;
  }

  try {
    setRepoStatus(`GitLab Pages 模式：正在讀取 ${localSearchIndexPath}。`);
    setLoadingStatus(`正在讀取 ${localSearchIndexPath}...`, 20);
    const searchIndexResponse = await fetch(localSearchIndexPath, { cache: "no-store" });
    if (!searchIndexResponse.ok) {
      throw new Error(`Cannot load ${localSearchIndexPath}`);
    }

    const localIndex = await searchIndexResponse.json();
    const items = Array.isArray(localIndex) ? localIndex : localIndex.entries || [];
    const indexedEntries = items.map(buildEntryFromLocalSearchIndexItem);
    const hydratedEntries = await hydrateIncompleteIndexedEntries(indexedEntries);
    allEntries = sortEntries(hydratedEntries);
    hasLoadedEntries = true;
    updateUnitOptions();
    filterEntries();
    setRepoStatus(`已從 ${localSearchIndexPath} 載入 ${allEntries.length} 筆 Markdown 索引。`);
    hideLoadingStatus();
    setSearchLoadingState(false);
    return;
  } catch (error) {
    console.warn(error);
  }

  try {
    setRepoStatus(`找不到 ${localSearchIndexPath}，改用備用 ${entriesIndexPath}。請確認 GitLab Pages 部署產物是否包含 ${localSearchIndexPath}。`);
    setLoadingStatus(`正在讀取 ${entriesIndexPath}...`, 10);
    const indexResponse = await fetch(entriesIndexPath, { cache: "no-store" });
    if (!indexResponse.ok) {
      throw new Error(`Cannot load ${entriesIndexPath}`);
    }

    const index = await indexResponse.json();
    const loaded = [];
    for (const [indexNumber, item] of index.entries.entries()) {
      const response = await fetch(item.path, { cache: "no-store" });
      const raw = await response.text();
      loaded.push(buildEntryFromMarkdown(raw, {
        path: item.path
      }));
      setLoadingStatus(`正在讀取 Markdown：${indexNumber + 1}/${index.entries.length}`, 20 + ((indexNumber + 1) / index.entries.length) * 70);
    }

    allEntries = sortEntries(loaded);
    hasLoadedEntries = true;
    updateUnitOptions();
    filterEntries();
    setRepoStatus(`已從 ${entriesIndexPath} 載入 ${allEntries.length} 筆 Markdown`);
    hideLoadingStatus();
  } catch (error) {
    allEntries = [];
    filteredEntries = [];
    hasLoadedEntries = false;
    updateUnitOptions();
    entryCount.textContent = "無法載入 Markdown 索引";
    resultsContainer.innerHTML = `<div class="result-card">請確認 GitLab Pages 部署產物內存在 <code>${localSearchIndexPath}</code>。如果剛寫入資料，請先等 GitLab pipeline 成功後再重新讀取。</div>`;
    console.error(error);
    hideLoadingStatus();
  }

  setSearchLoadingState(false);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  renderGeneratedMarkdown(buildMarkdown(data));
});

form.addEventListener("input", updatePreviewFromCurrentForm);
form.addEventListener("change", updatePreviewFromCurrentForm);

form.querySelectorAll("textarea").forEach((textarea) => {
  textarea.addEventListener("focus", () => {
    activeEditor = textarea;
  });
  textarea.addEventListener("paste", (event) => {
    handleEditorPaste(event)
      .then(() => updatePreviewFromCurrentForm())
      .catch((error) => {
        editorUploadStatus.textContent = `貼上圖片失敗：${error.message}`;
        console.error(error);
      });
  });
});

document.querySelectorAll("[data-editor-command]").forEach((button) => {
  button.addEventListener("click", () => {
    handleEditorCommand(button.dataset.editorCommand);
    updatePreviewFromCurrentForm();
  });
});

editorImageFile.addEventListener("change", (event) => {
  handleEditorImageFiles(event.target.files).catch((error) => {
    editorUploadStatus.textContent = `圖片讀取失敗：${error.message}`;
    console.error(error);
  });
});
screenshotFile.addEventListener("change", (event) => {
  handleScreenshotFile(event.target.files[0]).catch((error) => {
    editorUploadStatus.textContent = `截圖讀取失敗：${error.message}`;
    console.error(error);
  });
});
screenshotPasteZone.addEventListener("paste", (event) => {
  handleScreenshotPaste(event).catch((error) => {
    editorUploadStatus.textContent = `貼上截圖失敗：${error.message}`;
    console.error(error);
  });
});
screenshotPasteZone.addEventListener("focus", () => {
  editorUploadStatus.textContent = "現在可以直接貼上問題現象截圖。";
});

copyButton.addEventListener("click", () => {
  copyMarkdown().catch((error) => console.error(error));
});

downloadButton.addEventListener("click", downloadMarkdown);
saveToRepoButton.addEventListener("click", () => {
  saveMarkdownToRepo().catch((error) => console.error(error));
});
saveApiConfigButton.addEventListener("click", saveApiConfig);
queryButton.addEventListener("click", () => {
  runSearch().catch((error) => console.error(error));
});
clearSearchButton.addEventListener("click", clearSearchConditions);
reloadButton.addEventListener("click", () => {
  reloadCurrentSearch().catch((error) => console.error(error));
});
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch().catch((error) => console.error(error));
});
pageSizeSelect.addEventListener("change", () => {
  if (!hasLoadedEntries) {
    showInitialSearchState();
    return;
  }
  currentPage = 1;
  renderResults(filteredEntries);
});
searchSourceSelect.addEventListener("change", () => {
  allEntries = [];
  filteredEntries = [];
  hasLoadedEntries = false;
  hasAttemptedSearch = false;
  updateUnitOptions();
  showInitialSearchState();
});
sortResultsSelect.addEventListener("change", updateResultSort);
toggleSearchPanelButton.addEventListener("click", toggleSearchPanel);
prevPageButton.addEventListener("click", () => goToPage(-1));
nextPageButton.addEventListener("click", () => goToPage(1));

restoreApiConfig();
showInitialSearchState();
