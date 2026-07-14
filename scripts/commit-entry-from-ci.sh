#!/bin/sh
set -eu

require_env() {
  name="$1"
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name is required" >&2
    exit 1
  fi
  printf "%s" "$value"
}

json_escape() {
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

urlencode() {
  awk 'BEGIN {
    for (i = 0; i <= 255; i++) {
      hex = sprintf("%02X", i)
      char = sprintf("%c", i)
      ord[char] = hex
    }
  }
  {
    for (i = 1; i <= length($0); i++) {
      c = substr($0, i, 1)
      if (c ~ /[A-Za-z0-9_.~-]/) {
        printf "%s", c
      } else {
        printf "%%%s", ord[c]
      }
    }
  }'
}

decode_base64_file() {
  input="$1"
  output="$2"
  if base64 -d "$input" > "$output" 2>/dev/null; then
    return
  fi
  base64 --decode "$input" > "$output"
}

api_v4_url=$(require_env "CI_API_V4_URL")
project_id=$(require_env "CI_PROJECT_ID")
write_token=$(require_env "GITLAB_WRITE_TOKEN")
target_branch="${TARGET_BRANCH:-${CI_COMMIT_REF_NAME:-main}}"
entries_path="${ENTRIES_PATH:-entries}"
requested_filename=$(require_env "ENTRY_FILENAME")
markdown_base64=$(require_env "ENTRY_MARKDOWN_BASE64")

entries_path=$(printf "%s" "$entries_path" | sed 's#\\#/#g; s#^\./##; s#/*$##')
project_encoded=$(printf "%s" "$project_id" | urlencode)
branch_encoded=$(printf "%s" "$target_branch" | urlencode)

file_exists() {
  path="$1"
  path_encoded=$(printf "%s" "$path" | urlencode)
  status=$(curl -sS -o /tmp/gitlab-file-check.json -w "%{http_code}" \
    --header "PRIVATE-TOKEN: $write_token" \
    "$api_v4_url/projects/$project_encoded/repository/files/$path_encoded?ref=$branch_encoded")
  if [ "$status" = "200" ]; then
    return 0
  fi
  if [ "$status" = "404" ]; then
    return 1
  fi
  echo "Failed to check file $path: HTTP $status" >&2
  cat /tmp/gitlab-file-check.json >&2 || true
  exit 1
}

base_name=${requested_filename%.[mM][dD]}
target_filename="$requested_filename"
counter=2
while file_exists "$entries_path/$target_filename"; do
  target_filename="${base_name}-${counter}.md"
  counter=$((counter + 1))
done

printf "%s" "$markdown_base64" > /tmp/entry-markdown.b64
decode_base64_file /tmp/entry-markdown.b64 /tmp/entry.md
mkdir -p "$entries_path"
cp /tmp/entry.md "$entries_path/$target_filename"
sh scripts/build-search-index.sh

markdown_encoded=$(base64 < /tmp/entry.md | tr -d '\n')
entry_path_json=$(printf "%s/%s" "$entries_path" "$target_filename" | json_escape)
search_index_path="$entries_path/search-index.json"
search_index_path_json=$(printf "%s" "$search_index_path" | json_escape)
search_index_encoded=$(base64 < "$search_index_path" | tr -d '\n')
search_index_action="create"
if file_exists "$search_index_path"; then
  search_index_action="update"
fi

cat > /tmp/actions.json <<EOF
    {
      "action": "create",
      "file_path": "$entry_path_json",
      "content": "$markdown_encoded",
      "encoding": "base64"
    },
    {
      "action": "$search_index_action",
      "file_path": "$search_index_path_json",
      "content": "$search_index_encoded",
      "encoding": "base64"
    }
EOF

if [ -n "${ENTRY_IMAGES_TSV_BASE64:-}" ]; then
  printf "%s" "$ENTRY_IMAGES_TSV_BASE64" > /tmp/entry-images.tsv.b64
  decode_base64_file /tmp/entry-images.tsv.b64 /tmp/entry-images.tsv
  image_count=0
  while IFS="$(printf '\t')" read -r image_path image_base64 || [ -n "$image_path" ]; do
    [ -n "$image_path" ] || continue
    [ -n "$image_base64" ] || continue
    image_count=$((image_count + 1))
    image_path_json=$(printf "%s" "$image_path" | json_escape)
    cat >> /tmp/actions.json <<EOF
,
    {
      "action": "create",
      "file_path": "$image_path_json",
      "content": "$image_base64",
      "encoding": "base64"
    }
EOF
  done < /tmp/entry-images.tsv
  echo "Prepared $image_count image file action(s)."
else
  echo "No image payload received."
fi

cat > /tmp/payload.json <<EOF
{
  "branch": "$(printf "%s" "$target_branch" | json_escape)",
  "commit_message": "docs: add troubleshooting entry $(printf "%s" "$target_filename" | json_escape)",
  "actions": [
$(cat /tmp/actions.json)
  ]
}
EOF

status=$(curl -sS -o /tmp/gitlab-commit-response.json -w "%{http_code}" \
  --request POST \
  --header "PRIVATE-TOKEN: $write_token" \
  --header "Content-Type: application/json" \
  --data @/tmp/payload.json \
  "$api_v4_url/projects/$project_encoded/repository/commits")

if [ "$status" != "200" ] && [ "$status" != "201" ]; then
  echo "Failed to create commit: HTTP $status" >&2
  cat /tmp/gitlab-commit-response.json >&2 || true
  exit 1
fi

echo "Created troubleshooting entry: $entries_path/$target_filename"
