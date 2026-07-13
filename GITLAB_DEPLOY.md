# GitLab 部署方式

這份文件說明如何把 Troubleshooting Vault 部署到 GitLab Pages。

這個資料夾是 GitLab Pages 專用版本。  
靜態網站可以正常部署；寫入 repo 時需要在網頁暫時貼上 GitLab token。Token 不會長期儲存，重新整理後需要重新貼上。

## 可以直接使用的功能

- 瀏覽網站
- 建立 Markdown
- 即時預覽 Markdown
- 複製 Markdown
- 下載 Markdown
- 讀取公開可存取的 Markdown / search-index 資料

## GitHub 版不能直接沿用的功能

- GitHub Actions polling
- GitHub repo 自動偵測

GitLab 版會直接從前端呼叫 GitLab Repository Commits API。

## 建議 GitLab 專案結構

```text
.
|-- index.html
|-- style.css
|-- app.js
|-- README.md
|-- GITLAB_DEPLOY.md
|-- .gitlab-ci.yml
`-- entries
    |-- example.md
    `-- search-index.json
```

不需要上傳 GitHub 專用檔案：

```text
.github/workflows/create-entry.yml
.nojekyll
```

`.nojekyll` 是 GitHub Pages 用的，GitLab Pages 不需要。

## 建立 `.gitlab-ci.yml`

在 repo 根目錄新增：

```yaml
pages:
  image: ruby:3.3
  stage: deploy
  script:
    - mkdir -p public
    - ruby scripts/build-search-index.rb
    - cp index.html style.css app.js README.md GITLAB_DEPLOY.md public/
    - cp -r entries public/
    - if [ -d assets ]; then cp -r assets public/; fi
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

GitLab Pages 會把 `public/` 目錄發佈成網站。

## 建立索引腳本

建議新增：

```text
scripts/build-search-index.rb
```

內容：

```ruby
require "json"
require "fileutils"

entries_path = "entries"
FileUtils.mkdir_p(entries_path)

def parse_markdown(raw)
  meta = {}
  body = raw
  match = raw.match(/\A---\s*\n(.*?)\n---\s*\n?(.*)\z/m)
  if match
    body = match[2]
    match[1].each_line do |line|
      key, value = line.split(":", 2)
      next unless key && value
      meta[key.strip] = value.strip
    end
  end
  [meta, body]
end

def section(body, heading)
  pattern = /^## #{Regexp.escape(heading)}\s*$\n(.*?)(?=^## |\z)/m
  match = body.match(pattern)
  match ? match[1].strip : ""
end

def tags(value)
  value.to_s.sub(/\A\[/, "").sub(/\]\z/, "").split(",").map(&:strip).reject(&:empty?)
end

entries = Dir.glob(File.join(entries_path, "*.md")).sort.map do |path|
  raw = File.read(path, encoding: "UTF-8")
  meta, body = parse_markdown(raw)
  {
    path: path.tr("\\", "/"),
    sourceName: File.basename(path),
    title: meta["title"].to_s.empty? ? File.basename(path, ".md") : meta["title"].to_s,
    date: meta["date"].to_s,
    unit: meta["unit"].to_s,
    tags: tags(meta["tags"]),
    screenshot: meta["screenshot"].to_s,
    screenshotImage: meta["screenshotImage"].to_s,
    symptom: section(body, "問題現象"),
    cause: section(body, "判斷問題原因"),
    solution: section(body, "解決方式")
  }
end

File.write(File.join(entries_path, "search-index.json"), JSON.pretty_generate(entries), encoding: "UTF-8")
```

這樣每次推送到 GitLab default branch 時，都會在 GitLab Pages 部署產物中重新產生 `entries/search-index.json`。

## GitLab Pages 設定

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
- 網站前端如果要讀 private repo 的 Markdown，需要 token 或後端 API。
- 不建議把 GitLab token 寫死在 `index.html` 或 `app.js`。

## 寫入 GitLab Repo

前端 `GitLab API 設定` 填：

```text
GitLab Project ID: project id 或 group/project
GitLab Token: 你的 GitLab token
Markdown 目錄: entries
Branch: main
GitLab Base URL: https://gitlab.com
```

Token 不會寫入 localStorage；重新整理或重新開啟頁面後需要重新貼上。  
不要把 GitLab token 寫死在 `index.html` 或 `app.js`。

按 `寫入 GitLab Repo` 後，網站會等待該 commit 觸發的 GitLab pipeline 完成，進度條會顯示 pipeline 狀態。Pipeline 成功後 Pages 仍可能需要短時間更新，若查不到最新資料，請稍等後按 `重新讀取資料`。

如果只是個人手動維護，可以先用這個流程：

1. 在網站建立 Markdown。
2. 按 `下載檔案` 或 `複製內容`。
3. 到 GitLab repo 的 `entries/` 手動新增 `.md`。
4. push 或 commit 後，GitLab CI 會在部署產物中重建 `search-index.json` 並部署 Pages。
