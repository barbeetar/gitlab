# Troubleshooting Issues

這是 GitLab Pages 版本的 Troubleshooting 查詢網站。資料來源只使用 GitLab Issues；使用者在 GitLab Issue 建立除錯文件，GitLab CI 會把 Issues 轉成 `public/data/issues.json`，前端只讀這個靜態 JSON。

## 主要功能

- 查詢 GitLab Issues 的標題、description、labels、建立者與日期。
- Issue description 會用類似 GitLab / GitHub 的 Markdown 樣式顯示。
- 支援分頁、排序、關鍵字查詢、標籤 / 單位查詢與日期區間。
- Private GitLab Issues 可由 CI 用 `GITLAB_ISSUES_TOKEN` 讀取後發布成 Pages 靜態資料。
- Issue 內貼上的 GitLab upload 圖片會由 CI 同步到 repo 的 `assets/issue-assets/`，避免 Pages 顯示 404；Issue 已移除引用的舊圖片也會在下一次 pipeline 清理。

## 檔案結構

```text
.
|-- .gitlab-ci.yml
|-- gitlab-ci.with-runner-tags.yml
|-- index.html
|-- style.css
|-- app.js
|-- README.md
|-- GITLAB_DEPLOY.md
|-- GitLab_Issue_Troubleshooting_使用SOP.md
`-- scripts
    |-- build-issues-index.sh
    |-- rewrite-issue-assets.js
    `-- sync-issue-assets.js
```

## GitLab CI/CD Variables

到 `Settings > CI/CD > Variables` 建立：

```text
Key: GITLAB_ISSUES_TOKEN
Value: Project access token
Visibility: Masked and hidden
Scopes: read_api
```

如果 Issue 內有圖片，並且要把圖片同步 commit 到 repo，另建：

```text
Key: GITLAB_WRITE_TOKEN
Value: Project access token
Visibility: Masked and hidden
Scopes: api, read_repository, write_repository
```

可選變數：

```text
ISSUE_STATE=all
ISSUE_LABELS=troubleshooting
ISSUE_MAX_PAGES=10
```

`GITLAB_ISSUES_TOKEN` 和 `GITLAB_WRITE_TOKEN` 只在 GitLab Runner 內使用，不會出現在前端。

## 使用方式

1. 在 GitLab Issues 建立 troubleshooting issue。
2. Issue description 內直接用 Markdown 撰寫，也可以貼圖片。
3. 等 GitLab pipeline 成功。
4. 打開 GitLab Pages 網站。
5. 按「查詢」讀取 `data/issues.json`。
6. 點「展開文件」或「在預覽區開啟」查看 Issue description。

## Pipeline 流程

```text
GitLab Issues
-> sync_issue_assets job 下載 Issue 圖片、清理未引用圖片，並 commit 到 assets/issue-assets/
-> pages job 執行 scripts/build-issues-index.sh
-> 產生 public/data/issues.json
-> scripts/rewrite-issue-assets.js 改寫圖片路徑
-> GitLab Pages 發布 index.html / app.js / style.css / data/issues.json / assets/
-> 前端查詢 data/issues.json
```

## 公司 Runner 需要 tags

如果公司 GitLab Runner 必須指定 tag，請參考：

```text
gitlab-ci.with-runner-tags.yml
```

把裡面的 `your-company-runner-tag` 改成公司 runner tag，再把內容套用到 `.gitlab-ci.yml`。

## 注意事項

- 這個版本已移除 Markdown Repo 建立與 `entries/search-index.json` 查詢。
- 網頁不再提供「寫入 GitLab Repo」功能，建立文件請直接用 GitLab Issues。
- 如果 GitLab Issues 是 private，請確認 GitLab Pages access control 有限制可看的人；否則 `data/issues.json` 內的內容會被能打開 Pages 的人看到。
- 新增或修改 Issue 後，需要重新跑 pipeline 或等排程 pipeline 執行，Pages 才會更新。
- 如果圖片在 Pages 看不到，請先確認 pipeline 是否成功，以及 repo 是否產生 `assets/issue-assets/`。
