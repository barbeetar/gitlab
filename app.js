const issuesIndexPath = "data/issues.json";

const searchForm = document.getElementById("search-form");
const queryButton = document.getElementById("query-issues");
const clearButton = document.getElementById("clear-search");
const reloadButton = document.getElementById("reload-issues");
const resultsContainer = document.getElementById("search-results");
const resultTemplate = document.getElementById("result-template");
const entryCount = document.getElementById("entry-count");
const pageSizeSelect = document.getElementById("page-size");
const sortSelect = document.getElementById("sort-results");
const prevPageButton = document.getElementById("prev-page");
const nextPageButton = document.getElementById("next-page");
const pageStatus = document.getElementById("page-status");
const loadingStatus = document.getElementById("loading-status");
const loadingBarFill = document.getElementById("loading-bar-fill");
const loadingMessage = document.getElementById("loading-message");
const previewTitle = document.getElementById("preview-title");
const previewSource = document.getElementById("generated-filename");
const markdownPreview = document.getElementById("markdown-preview");
const markdownOutput = document.getElementById("markdown-output");
const repoStatus = document.getElementById("repo-status");
const toggleSearchPanelButton = document.getElementById("toggle-search-panel");
const searchPanelBody = document.getElementById("search-panel-body");

let allIssues = [];
let filteredIssues = [];
let currentPage = 1;
let hasLoadedIssues = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setLoading(message, percent) {
  loadingStatus.classList.remove("hidden");
  loadingMessage.textContent = message;
  loadingBarFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function hideLoading(message = "") {
  if (message) {
    repoStatus.textContent = message;
  }
  loadingStatus.classList.add("hidden");
  loadingBarFill.style.width = "0";
}

async function loadIssues() {
  setLoading(`正在讀取 ${issuesIndexPath}...`, 20);
  const response = await fetch(`${issuesIndexPath}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`無法載入 ${issuesIndexPath}，請確認 GitLab Pages pipeline 已成功產生 issues.json。HTTP ${response.status}`);
  }

  setLoading("正在解析 GitLab Issues 快取資料...", 65);
  const data = await response.json();
  const issues = Array.isArray(data) ? data : data.issues || [];
  allIssues = issues.map(normalizeIssue);
  hasLoadedIssues = true;
  setLoading(`已載入 ${allIssues.length} 筆 GitLab Issues。`, 100);
  hideLoading(`已從 ${issuesIndexPath} 載入 ${allIssues.length} 筆 GitLab Issues。`);
}

function normalizeIssue(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const description = String(issue.description || "");
  const createdAt = issue.created_at || issue.updated_at || "";
  const documentDate = extractDocumentDate(description) || createdAt.slice(0, 10);
  return {
    id: issue.id,
    iid: issue.iid,
    title: issue.title || "(未命名 Issue)",
    description,
    labels,
    state: issue.state || "",
    author: issue.author?.name || issue.author?.username || "",
    documentDate,
    createdAt,
    updatedAt: issue.updated_at || "",
    webUrl: issue.web_url || "",
    unit: inferUnit(labels),
    displayLabels: labels.filter((label) => !isUnitLabel(label)),
    summary: summarizeMarkdown(description)
  };
}

function extractDocumentDate(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index].replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
    const sameLineDate = normalized.match(/^日期\s*[:：]\s*(\d{4}-\d{2}-\d{2})/);
    if (sameLineDate) {
      return sameLineDate[1];
    }
    if (normalized === "日期") {
      for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
        const date = lines[next].match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (date) {
          return date[1];
        }
        if (lines[next].trim() && /^#{1,6}\s+/.test(lines[next])) {
          break;
        }
      }
    }
  }
  const fallback = String(markdown || "").match(/(?:日期|date)\s*[:：]\s*(\d{4}-\d{2}-\d{2})/i);
  return fallback?.[1] || "";
}

function inferUnit(issueLabels) {
  const labels = Array.isArray(issueLabels) ? issueLabels : [];
  const unitLabel = labels.find(isUnitLabel);
  if (unitLabel) {
    return unitLabel.split("::").slice(1).join("::").trim();
  }
  return "";
}

function isUnitLabel(label) {
  return /^(unit|單位|部門|department)::/i.test(String(label || ""));
}

function summarizeMarkdown(markdown) {
  return String(markdown || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function applyFilters() {
  const formData = new FormData(searchForm);
  const keyword = String(formData.get("keyword") || "").trim().toLowerCase();
  const label = String(formData.get("label") || "").trim().toLowerCase();
  const from = String(formData.get("from") || "");
  const to = String(formData.get("to") || "");

  filteredIssues = allIssues.filter((issue) => {
    const text = [
      issue.title,
      issue.description,
      issue.summary,
      issue.unit,
      issue.author,
      issue.labels.join(" ")
    ].join(" ").toLowerCase();
    const date = issue.documentDate || issue.createdAt.slice(0, 10);

    return (!keyword || text.includes(keyword))
      && (!label || issue.labels.some((item) => item.toLowerCase().includes(label)) || issue.unit.toLowerCase().includes(label))
      && (!from || date >= from)
      && (!to || date <= to);
  });

  sortIssues();
  currentPage = 1;
  renderResults();
}

function sortIssues() {
  const sortMode = sortSelect.value;
  filteredIssues.sort((a, b) => {
    if (sortMode === "date-asc") {
      return compareText(a.documentDate || a.createdAt, b.documentDate || b.createdAt);
    }
    if (sortMode === "title-asc") {
      return compareText(a.title, b.title);
    }
    if (sortMode === "title-desc") {
      return compareText(b.title, a.title);
    }
    if (sortMode === "label-asc") {
      return compareText(a.unit || a.labels.join(" "), b.unit || b.labels.join(" "));
    }
    if (sortMode === "label-desc") {
      return compareText(b.unit || b.labels.join(" "), a.unit || a.labels.join(" "));
    }
    return compareText(b.documentDate || b.createdAt, a.documentDate || a.createdAt);
  });
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), "zh-Hant", { numeric: true, sensitivity: "base" });
}

function formatDateTime(value) {
  if (!value) {
    return "未填日期";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const parts = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function renderResults() {
  resultsContainer.innerHTML = "";
  const pageSize = Number(pageSizeSelect.value || "10");
  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredIssues.slice(start, start + pageSize);

  entryCount.textContent = hasLoadedIssues ? `共 ${filteredIssues.length} 筆 Issues` : "尚未查詢";
  pageStatus.textContent = `第 ${currentPage} / ${totalPages} 頁`;
  prevPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled = currentPage >= totalPages;
  reloadButton.disabled = !hasLoadedIssues;

  if (!pageItems.length) {
    resultsContainer.innerHTML = `<article class="result-card">查無符合條件的 GitLab Issue。</article>`;
    return;
  }

  for (const issue of pageItems) {
    const node = resultTemplate.content.cloneNode(true);
    const article = node.querySelector(".result-card");
    const title = node.querySelector(".result-title");
    const meta = node.querySelector(".result-meta");
    const summary = node.querySelector(".result-summary");
    const toggle = node.querySelector(".result-toggle");
    const openPreview = node.querySelector(".result-open");
    const issueLink = node.querySelector(".result-file");
    const detail = node.querySelector(".result-detail");

    title.textContent = issue.title;
    meta.innerHTML = [
      issue.iid ? `#${issue.iid}` : "",
      issue.documentDate ? `文件日期：${issue.documentDate}` : "",
      issue.createdAt ? `建立：${formatDateTime(issue.createdAt)}` : "",
      issue.state || "",
      issue.unit ? `單位：${issue.unit}` : "",
      ...issue.displayLabels
    ].filter(Boolean).map((item) => `<span class="meta-pill">${escapeHtml(item)}</span>`).join("");
    summary.textContent = issue.summary || "此 Issue 沒有描述內容。";
    detail.innerHTML = renderIssueFacts(issue);

    toggle.addEventListener("click", () => {
      detail.classList.toggle("hidden");
      toggle.textContent = detail.classList.contains("hidden") ? "展開重點" : "收合重點";
    });
    openPreview.addEventListener("click", () => showPreview(issue));

    if (issue.webUrl) {
      issueLink.href = issue.webUrl;
      issueLink.textContent = "開啟 GitLab Issue";
    } else {
      issueLink.remove();
    }

    article.addEventListener("dblclick", () => showPreview(issue));
    resultsContainer.appendChild(node);
  }
}

function renderIssueFacts(issue) {
  const facts = [
    ["Issue", issue.iid ? `#${issue.iid}` : ""],
    ["文件日期", issue.documentDate],
    ["GitLab 建立時間", issue.createdAt ? formatDateTime(issue.createdAt) : ""],
    ["狀態", issue.state],
    ["單位", issue.unit],
    ["標籤", issue.displayLabels.join("、")],
    ["建立者", issue.author],
    ["摘要", issue.summary || "此 Issue 沒有描述內容。"]
  ].filter(([, value]) => value);

  return facts.map(([label, value]) => (
    `<div class="detail-block"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`
  )).join("");
}

function showPreview(issue) {
  previewTitle.textContent = issue.title;
  previewSource.textContent = issue.webUrl ? `來源：${issue.webUrl}` : "來源：GitLab Issue";
  markdownPreview.innerHTML = renderMarkdown(issue.description || "此 Issue 沒有描述內容。");
  markdownOutput.textContent = issue.description || "";
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];
  let tableLines = [];

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  const flushTable = () => {
    if (!tableLines.length) {
      return;
    }
    html.push(renderTable(tableLines));
    tableLines = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        flushList();
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (isTableLine(line)) {
      flushList();
      tableLines.push(line);
      continue;
    }
    flushTable();

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(listItem[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    flushList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  flushList();
  flushTable();
  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return html.join("\n");
}

function isTableLine(line) {
  return /^\s*\|.+\|\s*$/.test(line);
}

function renderTable(lines) {
  const rows = lines
    .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) {
    return "";
  }
  return `<table><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderInlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\s*\{[^}]*\b(?:width|height)\b[^}]*\})?/gi, (_match, alt, src) => {
    const safeSrc = normalizeAssetPath(src);
    return `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}" loading="lazy">`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => `<a href="${escapeHtml(normalizeAssetPath(href))}" target="_blank" rel="noreferrer">${label}</a>`);
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  return text;
}

function normalizeAssetPath(value) {
  const raw = String(value || "").trim();
  if (/^(https?:|mailto:|#|data:)/i.test(raw)) {
    return raw;
  }
  return raw.replace(/^\.\//, "");
}

async function queryIssues({ reload = false } = {}) {
  try {
    queryButton.disabled = true;
    if (reload || !hasLoadedIssues) {
      await loadIssues();
    }
    applyFilters();
  } catch (error) {
    hideLoading();
    entryCount.textContent = "載入失敗";
    repoStatus.textContent = error.message || "GitLab Issues 讀取失敗。";
    resultsContainer.innerHTML = `<article class="result-card">${escapeHtml(error.message || "GitLab Issues 讀取失敗。")}</article>`;
  } finally {
    queryButton.disabled = false;
  }
}

queryButton.addEventListener("click", () => queryIssues());
reloadButton.addEventListener("click", () => queryIssues({ reload: true }));
clearButton.addEventListener("click", () => {
  searchForm.reset();
  filteredIssues = [];
  currentPage = 1;
  entryCount.textContent = "尚未查詢";
  resultsContainer.innerHTML = "";
  pageStatus.textContent = "第 1 / 1 頁";
  prevPageButton.disabled = true;
  nextPageButton.disabled = true;
  reloadButton.disabled = !hasLoadedIssues;
});
pageSizeSelect.addEventListener("change", () => {
  currentPage = 1;
  renderResults();
});
sortSelect.addEventListener("change", () => {
  sortIssues();
  renderResults();
});
prevPageButton.addEventListener("click", () => {
  currentPage -= 1;
  renderResults();
});
nextPageButton.addEventListener("click", () => {
  currentPage += 1;
  renderResults();
});
toggleSearchPanelButton.addEventListener("click", () => {
  const isHidden = searchPanelBody.classList.toggle("hidden");
  toggleSearchPanelButton.setAttribute("aria-expanded", String(!isHidden));
  toggleSearchPanelButton.textContent = isHidden ? "展開 ▼" : "收合 ▲";
});
