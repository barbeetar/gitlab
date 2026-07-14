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
|   |-- build-search-index.js
|   `-- commit-entry-from-ci.js
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

目前 `.gitlab-ci.yml` 不指定 Docker image，避免公司 runner 因為無法連到 Docker Hub 而出現 `ErrImagePull` / `ImagePullBackOff`。

這代表 GitLab runner 的預設執行環境需要有 Node.js。CI 會先執行：

```text
node --version
```

如果這一步失敗，代表 runner 預設環境沒有 Node.js。

若公司有指定可用的內部 Node image，請在 `.gitlab-ci.yml` 的 `commit_entry` 和 `pages` job 加上公司允許的 image，例如：

```yaml
image: your-company-node-image:20
```

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

## 寫入流程

```text
網頁產生 Markdown
-> 觸發 GitLab pipeline
-> commit_entry job 使用 GITLAB_WRITE_TOKEN commit 到 repo
-> push 觸發 pages job
-> build-search-index.js 重新產生 entries/search-index.json
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
5. GitLab CI 會在部署產物中重建 `search-index.json` 並部署 Pages。
