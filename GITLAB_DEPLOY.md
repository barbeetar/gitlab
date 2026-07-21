# GitLab Issues Pages 部署方式

這個版本只使用 GitLab Issues 作為 troubleshooting 文件來源。前端不直接呼叫 GitLab API，也不保存 API token；所有 GitLab API 存取都在 GitLab CI Runner 內完成。

## 需要上傳的檔案

```text
.gitlab-ci.yml
gitlab-ci.with-runner-tags.yml
index.html
style.css
app.js
README.md
GITLAB_DEPLOY.md
GitLab_Issue_Troubleshooting_使用SOP.md
scripts/build-issues-index.sh
scripts/rewrite-issue-assets.js
scripts/sync-issue-assets.js
```

## CI/CD Variables

### 讀取 Issues

建立 Project access token：

```text
Role: Reporter 或以上
Scopes: read_api
```

加入 CI/CD Variable：

```text
Key: GITLAB_ISSUES_TOKEN
Value: token 內容
Visibility: Masked and hidden
```

### 同步 Issue 圖片

如果 Issue description 內會貼圖片，建議再建立 Project access token：

```text
Role: Maintainer
Scopes: api, read_repository, write_repository
```

加入 CI/CD Variable：

```text
Key: GITLAB_WRITE_TOKEN
Value: token 內容
Visibility: Masked and hidden
```

`sync_issue_assets` job 會用這個 token 把圖片 commit 到 `assets/issue-assets/`。

## 可選變數

```text
ISSUE_STATE=all
ISSUE_LABELS=troubleshooting
ISSUE_MAX_PAGES=10
```

- `ISSUE_STATE` 可用 `all`、`opened`、`closed`。
- `ISSUE_LABELS` 可限制只匯出特定 label。
- `ISSUE_MAX_PAGES` 控制最多讀取幾頁，每頁 100 筆。

## Pipeline Jobs

```text
sync_issue_assets
```

讀取 GitLab Issues，找出 description 內的圖片，下載後 commit 到 `assets/issue-assets/`。如果下載到 GitLab sign-in HTML，腳本會判斷不是圖片並跳過或修正錯檔。

```text
pages
```

複製前端檔案到 `public/`，執行 `scripts/build-issues-index.sh` 產生 `public/data/issues.json`，並發布 GitLab Pages。

## 公司 Runner 需要 tag

如果公司 runner 需要 tag：

1. 打開 `gitlab-ci.with-runner-tags.yml`。
2. 把 `your-company-runner-tag` 改成公司指定 tag。
3. 用這份內容覆蓋 `.gitlab-ci.yml`。

## 更新網站資料

新增或修改 GitLab Issue 後，Pages 不會即時更新。你需要：

1. 手動 Run pipeline。
2. 或設定 Pipeline schedule 定期重跑。
3. pipeline 成功後回網站按「重新讀取 Issues」。

## 安全注意

- 前端只讀 `data/issues.json`，不會看到 `GITLAB_ISSUES_TOKEN` 或 `GITLAB_WRITE_TOKEN`。
- `data/issues.json` 是 Pages 靜態檔。能開 Pages 的人，就能讀到匯出的 Issue 內容。
- 如果 Issues 是公司內部資料，請啟用 GitLab Pages access control。
