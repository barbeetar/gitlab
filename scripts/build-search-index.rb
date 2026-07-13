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
