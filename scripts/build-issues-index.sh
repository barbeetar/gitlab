#!/bin/sh
set -eu

issues_output="public/data/issues.json"
mkdir -p public/data

if [ -z "${GITLAB_ISSUES_TOKEN:-}" ]; then
  echo "GITLAB_ISSUES_TOKEN is not set; writing empty issues index."
  printf "[]\n" > "$issues_output"
  exit 0
fi

api_v4_url="${CI_API_V4_URL:-}"
project_id="${CI_PROJECT_ID:-}"
issue_state="${ISSUE_STATE:-all}"
issue_labels="${ISSUE_LABELS:-}"
max_pages="${ISSUE_MAX_PAGES:-10}"

if [ -z "$api_v4_url" ] || [ -z "$project_id" ]; then
  echo "CI_API_V4_URL and CI_PROJECT_ID are required." >&2
  exit 1
fi

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

project_encoded=$(printf "%s" "$project_id" | urlencode)
query="per_page=100&scope=all&order_by=updated_at&sort=desc"
if [ "$issue_state" != "all" ]; then
  query="$query&state=$(printf "%s" "$issue_state" | urlencode)"
fi
if [ -n "$issue_labels" ]; then
  query="$query&labels=$(printf "%s" "$issue_labels" | urlencode)"
fi

tmp_output="${issues_output}.tmp"
printf "[\n" > "$tmp_output"
first=1
page=1

while [ "$page" -le "$max_pages" ]; do
  body_file="/tmp/gitlab-issues-page-${page}.json"
  header_file="/tmp/gitlab-issues-page-${page}.headers"
  status=$(curl -sS -D "$header_file" -o "$body_file" -w "%{http_code}" \
    --header "PRIVATE-TOKEN: $GITLAB_ISSUES_TOKEN" \
    "$api_v4_url/projects/$project_encoded/issues?$query&page=$page")

  if [ "$status" != "200" ]; then
    echo "Failed to fetch GitLab issues: HTTP $status" >&2
    cat "$body_file" >&2 || true
    exit 1
  fi

  page_items=$(sed '1s/^\[//; $s/\]$//' "$body_file")
  if [ -n "$(printf "%s" "$page_items" | tr -d '[:space:]')" ]; then
    if [ "$first" -eq 0 ]; then
      printf ",\n" >> "$tmp_output"
    fi
    first=0
    printf "%s" "$page_items" >> "$tmp_output"
  fi

  next_page=$(awk 'BEGIN { IGNORECASE = 1 } /^x-next-page:/ { gsub(/\r/, "", $2); print $2 }' "$header_file" | tail -n 1)
  if [ -z "$next_page" ]; then
    break
  fi
  page="$next_page"
done

printf "\n]\n" >> "$tmp_output"
mv "$tmp_output" "$issues_output"
echo "Wrote $issues_output"
