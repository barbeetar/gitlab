# GitLab 部署方式

這份文件說明如何把 Troubleshooting Vault 部署到 GitLab Pages。

這個版本是 GitLab Pages 專用版本。網站是靜態檔案；寫入 repo 時，網頁只觸發 GitLab pipeline，真正可寫 repo 的 token 放在 GitLab CI/CD Variables。

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
|   |-- build-issues-index.sh
|   |-- commit-entry-from-ci.sh
|   `-- update-search-index-from-ci.sh
`-- entries
    |-- example.md
    `-- search-index.json
```

不需要上傳 GitHub 專用檔案：

```text
.github/workflows/create-entry.yml
.nojekyll
```

## CI 執行環境

目前 `.gitlab-ci.yml` 使用 shell 腳本，不指定 Docker image，不需要 Ruby、Node.js 或 Python。

CI 需要 runner 環境有：

```text
sh, awk, sed, basename, curl, base64, cmp, cp
```

`update_search_index` 和 `commit_entry` 都會透過 GitLab API 寫回 repo，所以需要 `curl`。

如果你使用 Alpine 且環境沒有 `curl`，可以在 `.gitlab-ci.yml` 的 job 加 `before_script` 安裝，例如 `apk add --no-cache curl`。

如果 runner 環境缺少必要指令，請改用公司允許的基礎 image，或請 runner 管理員提供內建這些工具的 runner。

如果公司 runner 需要 tag，請參考：

```text
gitlab-ci.with-runner-tags.yml
```

把 `your-company-runner-tag` 改成公司 runner tag 後，再套用到 `.gitlab-ci.yml`。

## CI/CD Variables

先建立 Project access token，建議：

```text
Role: Maintainer
Scopes: api, read_repository, write_repository
```

再到：

```text
Settings > CI/CD > Variables
```

新增：

```text
Key: GITLAB_WRITE_TOKEN
Value: 你的 Project access token
Type: Variable
Environment scope: All
Mask variable: 建議勾選
Protect variable: 只有部署分支是 protected branch 時才勾
```

`GITLAB_WRITE_TOKEN` 不會出現在前端，只有 GitLab runner 會讀到。

如果要讓網站讀取 private GitLab Issues，另新增：

```text
Key: GITLAB_ISSUES_TOKEN
Value: 可讀 Issues API 的 Project access token
Type: Variable
Environment scope: All
Mask variable: 建議勾選
Protect variable: 只有部署分支是 protected branch 時才勾
```

建議 scopes：

```text
read_api
```

可選篩選變數：

```text
ISSUE_STATE=all
ISSUE_LABELS=troubleshooting,ERP
ISSUE_MAX_PAGES=10
```

## Pipeline Trigger Token

到：

```text
Settings > CI/CD > Pipeline trigger tokens
```

建立一個 trigger token。

這個 token 是給網頁觸發 pipeline 用的，不是 repo 寫入 token。它仍會出現在瀏覽器 Network request，所以請只在可信任裝置使用。

## 網站設定

網站上的 `GitLab Pipeline 設定` 填：

```text
GitLab Project ID: project id 或 group/project
Pipeline Trigger Token: pipeline trigger token
Markdown 目錄: entries
Branch: main 或你的部署分支
GitLab Base URL: https://gitlab.com
```

如果是公司 self-managed GitLab，`GitLab Base URL` 改成公司 GitLab 網址。

## GitLab Issues 查詢模式

網站可以切換資料來源為 `GitLab Issues`，但前端不直接連 GitLab Issues API。Issues 由 GitLab CI 在 Pages 部署時產生：

```text
GitLab issue template
-> 使用者在 GitLab Issues 新增 issue 並套用 template
-> issue description 內可直接貼圖片
-> pages job 執行 scripts/build-issues-index.sh
-> Runner 使用 GITLAB_ISSUES_TOKEN 讀 GitLab Issues API
-> 產生 public/data/issues.json
-> 前端讀取 data/issues.json
-> issue description 以 Markdown 文件樣式顯示
```

注意：

- 前端不保存 Issues API token，也不會碰到 CORS。
- Private issues 會被轉成 `data/issues.json` 放進 Pages 部署產物。
- 請確認 GitLab Pages access control 有限制可看的人；否則 private issues 內容會被能打開 Pages 的人讀到。
- 沒有設定 `GITLAB_ISSUES_TOKEN` 時，CI 會產生空的 `data/issues.json`。
- 如果 issue 圖片來自 private GitLab uploads，使用者可能需要同時登入 GitLab 才能載入圖片。

## 寫入流程

```text
網頁產生 Markdown
-> 觸發 GitLab pipeline
-> commit_entry job 使用 GITLAB_WRITE_TOKEN commit 到 repo
-> commit_entry job 同步更新 entries/search-index.json
-> push 觸發 pages job
-> update_search_index job 檢查 search-index.json 是否需要寫回 repo
-> build-search-index.sh 在 Pages 部署產物中再次重建 entries/search-index.json
-> GitLab Pages 更新
-> 網頁偵測 search-index.json 出現新檔名
```

## 部署流程

1. 把檔案 push 到 GitLab repo。
2. 到 `Build > Pipelines` 確認 pipeline 成功。
3. 到 `Deploy > Pages` 查看 GitLab Pages URL。

GitLab Pages 網址通常會類似：

```text
https://<namespace>.gitlab.io/<project>/
```

## Private Repo 注意事項

如果 GitLab repo 是 private：

- GitLab Pages 是否公開，取決於 GitLab Pages access control 設定。
- 不建議把任何 repo 寫入 token 寫死在 `index.html` 或 `app.js`。
- 若內容涉及內部系統，建議 Pages access control 設成只允許 project members。

## 手動新增資料

如果不使用網頁寫入，也可以手動：

1. 在網站建立 Markdown。
2. 按 `下載檔案` 或 `複製內容`。
3. 到 GitLab repo 的 `entries/` 手動新增 `.md`。
4. Commit 到部署分支。
5. GitLab CI 的 `update_search_index` job 會更新 repo 內的 `entries/search-index.json`，並在部署產物中再次重建後部署 Pages。
