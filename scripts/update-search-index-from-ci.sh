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

api_v4_url=$(require_env "CI_API_V4_URL")
project_id=$(require_env "CI_PROJECT_ID")
write_token=$(require_env "GITLAB_WRITE_TOKEN")
target_branch="${CI_COMMIT_REF_NAME:-${CI_DEFAULT_BRANCH:-main}}"
entries_path="${ENTRIES_PATH:-entries}"
search_index_path="$entries_path/search-index.json"

entries_path=$(printf "%s" "$entries_path" | sed 's#\\#/#g; s#^\./##; s#/*$##')
search_index_path="$entries_path/search-index.json"
project_encoded=$(printf "%s" "$project_id" | urlencode)
branch_encoded=$(printf "%s" "$target_branch" | urlencode)

before_file="/tmp/search-index.before"
if [ -f "$search_index_path" ]; then
  cp "$search_index_path" "$before_file"
else
  : > "$before_file"
fi

sh scripts/build-search-index.sh

if cmp -s "$before_file" "$search_index_path"; then
  echo "search-index.json is already up to date."
  exit 0
fi

file_exists() {
  path_encoded=$(printf "%s" "$search_index_path" | urlencode)
  status=$(curl -sS -o /tmp/gitlab-file-check.json -w "%{http_code}" \
    --header "PRIVATE-TOKEN: $write_token" \
    "$api_v4_url/projects/$project_encoded/repository/files/$path_encoded?ref=$branch_encoded")
  if [ "$status" = "200" ]; then
    return 0
  fi
  if [ "$status" = "404" ]; then
    return 1
  fi
  echo "Failed to check $search_index_path: HTTP $status" >&2
  cat /tmp/gitlab-file-check.json >&2 || true
  exit 1
}

search_index_action="create"
if file_exists; then
  search_index_action="update"
fi

search_index_encoded=$(base64 < "$search_index_path" | tr -d '\n')
search_index_path_json=$(printf "%s" "$search_index_path" | json_escape)

cat > /tmp/search-index-payload.json <<EOF
{
  "branch": "$(printf "%s" "$target_branch" | json_escape)",
  "commit_message": "docs: update search index [skip ci]",
  "actions": [
    {
      "action": "$search_index_action",
      "file_path": "$search_index_path_json",
      "content": "$search_index_encoded",
      "encoding": "base64"
    }
  ]
}
EOF

status=$(curl -sS -o /tmp/gitlab-search-index-response.json -w "%{http_code}" \
  --request POST \
  --header "PRIVATE-TOKEN: $write_token" \
  --header "Content-Type: application/json" \
  --data @/tmp/search-index-payload.json \
  "$api_v4_url/projects/$project_encoded/repository/commits")

if [ "$status" != "200" ] && [ "$status" != "201" ]; then
  echo "Failed to update search-index.json: HTTP $status" >&2
  cat /tmp/gitlab-search-index-response.json >&2 || true
  exit 1
fi

echo "Updated $search_index_path in repository."
