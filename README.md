# Troubleshooting Vault - GitLab Pages

這是 Troubleshooting Vault 的 GitLab Pages 版本。網站本身是靜態網頁，資料用 `entries/` 裡的 Markdown 檔案保存，查詢使用 GitLab CI 產生的 `entries/search-index.json`。

## 主要功能

- 建立 Troubleshooting Markdown 文件
- 即時預覽 Markdown，顯示成接近 GitLab / GitHub 的文件樣式
- 支援粗體、表格、清單、貼上圖片與截圖
- 查詢既有 Markdown 紀錄，並可用分頁控制每頁筆數
- 查詢結果可依日期、標題、提出單位排序
- 使用 Pipeline Trigger Token 觸發 GitLab CI
- 真正可寫 repo 的 token 放在 GitLab CI/CD Variables

## 專案結構

```text
.
|-- index.html
|-- style.css
|-- app.js
|-- README.md
|-- GITLAB_DEPLOY.md
|-- .gitlab-ci.yml
|-- scripts
|   |-- build-search-index.sh
|   `-- commit-entry-from-ci.sh
`-- entries
    |-- example.md
    |-- index.json
    `-- search-index.json
```

`entries/search-index.json` 是主要查詢來源。`entries/index.json` 目前只是備用 fallback，如果 `search-index.json` 無法載入才會使用。

## 第一次部署

1. 建立一個 GitLab project。
2. 把這個資料夾內的檔案上傳到 repo 根目錄。
3. 確認 repo 根目錄有 `.gitlab-ci.yml`。
4. 確認 repo 內有 `scripts/build-search-index.sh` 和 `scripts/commit-entry-from-ci.sh`。
5. 確認 repo 內有 `entries/` 資料夾。
6. 到 `Build > Pipelines` 查看 pipeline 是否成功。
7. 到 `Deploy > Pages` 查看 GitLab Pages 網址。

如果 pipeline 成功，GitLab Pages 會發布 `public/` 內的網站檔案，包含 `index.html`、`style.css`、`app.js`、`entries/` 和 `assets/`。

目前 `.gitlab-ci.yml` 使用 shell 腳本，不需要 Ruby、Node.js 或 Python，也不會拉 Docker Hub image。

CI 需要 runner 環境有這些常見指令：

```text
sh, awk, sed, basename, curl, base64
```

建立資料時貼上的圖片會和 Markdown 一起由 CI commit 到 repo。

## 建立 GitLab 寫入 Token

建議使用 Project access token，不建議使用個人 Personal access token。這個 token 不要填在網頁上，請放在 GitLab CI/CD Variables。

建議設定：

```text
Role: Maintainer
Scopes: api, read_repository, write_repository
```

原因：

- `api`：CI job 呼叫 GitLab Commits API 需要。
- `read_repository`：CI job 檢查檔案是否已存在時需要讀取 repo。
- `write_repository`：CI job 寫入 Markdown 和圖片時需要。

到 `Settings > CI/CD > Variables` 新增：

```text
Key: GITLAB_WRITE_TOKEN
Value: 你的 Project access token
Masked: 建議開啟
Protected: 如果你的部署分支是 protected branch 才開啟
```

這個 token 只會在 GitLab runner 裡使用，不會出現在網站前端。

## 建立 Pipeline Trigger Token

到 `Settings > CI/CD > Pipeline trigger tokens` 建立 trigger token。

這個 token 是給網頁觸發 pipeline 用的，不是 repo 寫入 token。它仍會出現在瀏覽器 Network request 裡，所以請只在可信任裝置使用，但風險比把 `api/write_repository` token 放在前端低。

## 網站上的 GitLab Pipeline 設定

在網站右側或下方的 `GitLab Pipeline 設定` 填：

```text
GitLab Project ID: 建議填數字 Project ID
Pipeline Trigger Token: Pipeline trigger token
Markdown 目錄: entries
Branch: 你的 Pages 部署分支，通常是 main
GitLab Base URL: https://gitlab.com
```

如果你用的是 self-managed GitLab，`GitLab Base URL` 要改成公司 GitLab 的網址，例如：

```text
https://gitlab.example.com
```

## 日常使用流程

### 建立資料

1. 在 `建立文件 Markdown` 填寫日期、提出單位、標題、問題現象、原因與解決方式。
2. 如果有問題畫面網址，填在 `問題現象畫面連結`。
3. 如果有截圖，可以用檔案上傳，也可以點截圖貼上區後按 `Ctrl + V`。
4. 內容會即時顯示在文件預覽。
5. 確認內容後按 `寫入 GitLab Repo`。
6. 網站會觸發 GitLab pipeline，由 CI/CD Variables 內的 `GITLAB_WRITE_TOKEN` 寫入 repo。
7. 如果查詢還看不到新資料，稍等 GitLab Pages 更新後按 `重新讀取資料`。

### 查詢資料

1. 在查詢區輸入關鍵字、提出單位或日期範圍。
2. 按 `查詢`。
3. 結果會從 `entries/search-index.json` 載入。
4. 可用每頁筆數控制結果數量。
5. 可用排序選單切換日期、標題或提出單位排序。
6. 點 `展開文件` 可直接查看文件預覽樣式。
7. 點 `在預覽區開啟` 可把該筆資料放到主要預覽區。

### 重新讀取資料

`重新讀取資料` 適合在這些情況使用：

- 剛寫入新資料，pipeline 已成功，但查詢結果還是舊的。
- 你在 GitLab repo 手動新增或修改了 `entries/` 裡的 Markdown。
- GitLab Pages 剛重新部署完成。

不要在 pipeline 還沒完成前期待查到新資料，因為 `search-index.json` 要等 CI 重建並部署後才會更新。

## 手動新增資料

如果不想用 token 寫入，也可以手動維護：

1. 在網站建立文件。
2. 按 `下載檔案` 或 `複製內容`。
3. 到 GitLab repo 的 `entries/` 新增 `.md` 檔案。
4. Commit 到部署分支。
5. GitLab CI 會執行 `scripts/build-search-index.sh`。
6. `entries/search-index.json` 會在 Pages 部署產物中被重建。
7. Pipeline 成功、Pages 更新後，網站就能查到資料。

## Markdown 格式

```md
---
title: ERP 匯出報表失敗
date: 2026-07-01
unit: 製造部
tags: [ERP, 報表, 權限]
screenshot: https://example.com/erp/report-export
screenshotImage: assets/erp-export-error.png
---

## 問題現象
描述使用者看到的畫面、錯誤訊息、重現條件。

## 判斷問題原因
記錄分析過程與判斷結果。

## 解決方式
記錄修復步驟、後續追蹤事項。
```

## 常見問題

### 查不到剛建立的資料

通常是 GitLab pipeline 或 Pages 部署還沒完成。請先確認 `Build > Pipelines` 成功，再回網站按 `重新讀取資料`。

### 顯示找不到 `entries/search-index.json`

代表 Pages 部署產物裡沒有產生搜尋索引。請確認：

- `.gitlab-ci.yml` 有執行 `sh scripts/build-search-index.sh`
- `scripts/build-search-index.sh` 有上傳到 repo
- `entries/` 內至少有 Markdown 檔案
- pipeline 是成功狀態

### 寫入失敗或 token 錯誤

請確認：

- `GitLab Project ID` 正確，建議使用數字 Project ID
- 網頁填的是 Pipeline Trigger Token，不是 Project access token
- CI/CD Variables 有設定 `GITLAB_WRITE_TOKEN`
- `GITLAB_WRITE_TOKEN` 沒有過期
- `GITLAB_WRITE_TOKEN` role 是 Maintainer
- `GITLAB_WRITE_TOKEN` scopes 包含 `api`、`read_repository`、`write_repository`
- `Branch` 填的是實際要寫入與部署的分支

### 圖片貼上後會存在哪裡

建立文件時貼上的圖片會先暫存在瀏覽器頁面。按 `寫入 GitLab Repo` 後，圖片會跟 Markdown 一起由 CI commit 到 repo 的 `assets/` 資料夾。

## 更多部署細節

請看：

```text
GITLAB_DEPLOY.md
```
