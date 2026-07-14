#!/bin/sh
set -eu

entries_path="entries"
mkdir -p "$entries_path"

escape_json() {
  awk 'BEGIN { ORS = "" }
  {
    gsub(/\\/,"\\\\")
    gsub(/"/,"\\\"")
    gsub(/\t/,"\\t")
    gsub(/\r/,"")
    if (NR > 1) printf "\\n"
    printf "%s", $0
  }'
}

extract_meta() {
  key="$1"
  awk -v key="$key" '
    BEGIN { in_meta = 0 }
    NR == 1 && $0 == "---" { in_meta = 1; next }
    in_meta && $0 == "---" { exit }
    in_meta {
      prefix = key ":"
      if (index($0, prefix) == 1) {
        value = substr($0, length(prefix) + 1)
        sub(/^[ \t]+/, "", value)
        print value
        exit
      }
    }
  '
}

extract_section() {
  heading="$1"
  awk -v heading="$heading" '
    function flush() {
      sub(/^[ \t\r\n]+/, "", value)
      sub(/[ \t\r\n]+$/, "", value)
      print value
    }
    {
      line = $0
      sub(/\r$/, "", line)
    }
    line ~ "^[ \t]*##[ \t]+" heading "[ \t]*$" { capture = 1; value = ""; next }
    capture && line ~ "^[ \t]*##[ \t]+" { flush(); capture = 0; exit }
    capture {
      if (value != "") {
        value = value "\n" line
      } else {
        value = line
      }
    }
    END {
      if (capture) {
        flush()
      }
    }
  '
}

tags_json() {
  sed 's/^\[//; s/\]$//' | awk '
    BEGIN { FS = ","; printf "[" }
    {
      for (i = 1; i <= NF; i++) {
        value = $i
        sub(/^[ \t]+/, "", value)
        sub(/[ \t]+$/, "", value)
        if (value != "") {
          gsub(/\\/,"\\\\",value)
          gsub(/"/,"\\\"",value)
          if (count > 0) printf ", "
          printf "\"" value "\""
          count++
        }
      }
    }
    END { printf "]" }
  '
}

output="$entries_path/search-index.json"
tmp_output="${output}.tmp"
printf "[\n" > "$tmp_output"
first=1

for file in "$entries_path"/*.md; do
  [ -e "$file" ] || continue
  source_name=$(basename "$file")
  fallback_title=${source_name%.md}
  title=$(extract_meta "title" < "$file")
  date=$(extract_meta "date" < "$file")
  unit=$(extract_meta "unit" < "$file")
  tags=$(extract_meta "tags" < "$file")
  screenshot=$(extract_meta "screenshot" < "$file")
  screenshot_image=$(extract_meta "screenshotImage" < "$file")
  symptom=$(extract_section "問題現象" < "$file")
  cause=$(extract_section "判斷問題原因" < "$file")
  solution=$(extract_section "解決方式" < "$file")
  [ -n "$title" ] || title="$fallback_title"

  if [ "$first" -eq 0 ]; then
    printf ",\n" >> "$tmp_output"
  fi
  first=0

  path_json=$(printf "%s" "$file" | tr '\\' '/' | escape_json)
  source_json=$(printf "%s" "$source_name" | escape_json)
  title_json=$(printf "%s" "$title" | escape_json)
  date_json=$(printf "%s" "$date" | escape_json)
  unit_json=$(printf "%s" "$unit" | escape_json)
  tags_json_value=$(printf "%s" "$tags" | tags_json)
  screenshot_json=$(printf "%s" "$screenshot" | escape_json)
  screenshot_image_json=$(printf "%s" "$screenshot_image" | escape_json)
  symptom_json=$(printf "%s" "$symptom" | escape_json)
  cause_json=$(printf "%s" "$cause" | escape_json)
  solution_json=$(printf "%s" "$solution" | escape_json)

  cat >> "$tmp_output" <<EOF
  {
    "path": "$path_json",
    "sourceName": "$source_json",
    "title": "$title_json",
    "date": "$date_json",
    "unit": "$unit_json",
    "tags": $tags_json_value,
    "screenshot": "$screenshot_json",
    "screenshotImage": "$screenshot_image_json",
    "symptom": "$symptom_json",
    "cause": "$cause_json",
    "solution": "$solution_json"
  }
EOF
done

printf "\n]\n" >> "$tmp_output"
mv "$tmp_output" "$output"
