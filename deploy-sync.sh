#!/usr/bin/env bash
# GM Helper - incremental FTP sync to futuremagic.de (Linux)
#
# Port of deploy-sync.ps1: build, then upload new/changed dist/ files and
# remove remote files that are no longer in dist/. Does not wipe the remote tree.
#
# Usage (from repo root):
#   ./deploy-sync.sh
#   npm run deploy:sync:linux
#
# Password: FTP_PASSWORD env only (never prompted, never printed).

set -euo pipefail

FTP_SERVER="${FTP_SERVER:-ftp.futuremagic.de}"
FTP_USER="${FTP_USER:-12529-Pyrion}"
REMOTE_PATH="${REMOTE_PATH:-/webseiten/GM_Helper/}"
BASE_PATH="${BASE_PATH:-/GM_Helper/}"
PUBLIC_URL="${PUBLIC_URL:-https://futuremagic.de/GM_Helper/}"

ALWAYS_UPLOAD=(
  "index.html"
  ".htaccess"
  "futuremagic.json"
  "manifest.webmanifest"
  "sw.js"
  "registerSW.js"
)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

normalize_ftp_dir() {
  local p="${1//\\//}"
  [[ "$p" == /* ]] || p="/$p"
  [[ "$p" == */ ]] || p="$p/"
  printf '%s' "$p"
}

normalize_web_base() {
  local p="${1//\\//}"
  [[ "$p" == /* ]] || p="/$p"
  [[ "$p" == */ ]] || p="$p/"
  printf '%s' "$p"
}

die() {
  echo "Deployment failed: $*" >&2
  exit 1
}

require_ftp_password() {
  if [[ -z "${FTP_PASSWORD:-}" ]]; then
    die "FTP_PASSWORD env is required (no interactive prompt)"
  fi
  echo "Using stored password"
}

ensure_deps() {
  if [[ ! -d node_modules ]] || [[ ! -f node_modules/.package-lock.json && ! -d node_modules/vite ]]; then
    echo "Installing dependencies (npm ci)..."
    npm ci
  elif [[ package-lock.json -nt node_modules ]]; then
    echo "package-lock.json newer than node_modules; running npm ci..."
    npm ci
  fi
}

build_dist() {
  echo "Cleaning build folder..."
  rm -rf dist

  echo "Building application for domainfactory..."
  export GM_HELPER_BASE="$BASE_PATH"
  npm run build:domainfactory

  if [[ ! -f public/.htaccess ]]; then
    die "public/.htaccess is missing"
  fi
  echo "Copying .htaccess..."
  cp public/.htaccess dist/.htaccess
  # Patch RewriteBase to match BASE_PATH (same as deploy-sync.ps1)
  sed -i -E "s|^([[:space:]]*RewriteBase[[:space:]]+)\\S+|\\1${BASE_PATH}|" dist/.htaccess

  if [[ -f public/futuremagic.json ]]; then
    cp public/futuremagic.json dist/futuremagic.json
  fi

  if [[ ! -f dist/index.html ]]; then
    die "Build failed - no index.html found"
  fi
  echo "Build successful!"
}

ftp_escape_user() {
  # lftp/curl: escape special chars in user for URL if needed — keep as-is for open -u
  printf '%s' "$FTP_USER"
}

sync_with_lftp() {
  echo "Syncing with lftp (incremental mirror, delete stale)..."
  local remote
  remote="$(normalize_ftp_dir "$REMOTE_PATH")"
  remote="${remote%/}"

  # Write commands to a 0600 temp script so the password is not on argv / never echoed.
  local cmdfile
  cmdfile="$(mktemp)"
  chmod 600 "$cmdfile"
  cleanup_cmdfile() { rm -f "$cmdfile"; }
  trap cleanup_cmdfile EXIT

  {
    echo "set ftp:passive-mode true"
    echo "set ftp:ssl-allow no"
    echo "set cmd:fail-exit true"
    echo "set net:max-retries 3"
    echo "set net:timeout 60"
    # user/password only in this private file (never echoed)
    printf 'user "%s" "%s"\n' "$(ftp_escape_user)" "${FTP_PASSWORD//\"/\\\"}"
    printf 'open ftp://%s\n' "$FTP_SERVER"
    # mirror -R: upload; --delete: remove remote files not in dist/;
    # --ignore-time: compare by size (matches deploy-sync.ps1 skip-same-size).
    echo "mirror -R --delete --ignore-time --verbose --no-perms dist/ ${remote}/"
    for name in "${ALWAYS_UPLOAD[@]}"; do
      if [[ -f "dist/$name" ]]; then
        printf 'put -O %s dist/%s\n' "$remote" "$name"
      fi
    done
    echo "cls ${remote}/index.html"
    echo "cls ${remote}/.htaccess"
    echo "bye"
  } >"$cmdfile"

  lftp -f "$cmdfile" || die "lftp sync failed"
  cleanup_cmdfile
  trap - EXIT
  echo "Remote critical files present (index.html, .htaccess)."
}

# curl fallback: size-based upload + delete stale (no full wipe)
curl_ftp_list_details() {
  local remote_dir="$1"
  curl --ftp-pasv -sS --user "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_SERVER}${remote_dir}" || true
}

curl_ftp_size() {
  local remote_file="$1"
  local out
  out="$(curl --ftp-pasv -sS -I --user "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_SERVER}${remote_file}" 2>/dev/null | tr -d '\r' || true)"
  local size
  size="$(printf '%s\n' "$out" | awk -F': ' 'tolower($1)=="content-length"{print $2; exit}')"
  if [[ -n "$size" ]]; then
    printf '%s' "$size"
  else
    printf ''
  fi
}

curl_ftp_mkdir() {
  local remote_dir="$1"
  curl --ftp-pasv -sS --user "${FTP_USER}:${FTP_PASSWORD}" \
    --ftp-create-dirs \
    "ftp://${FTP_SERVER}${remote_dir}" -Q "NOOP" >/dev/null 2>&1 || true
  # MKD via quote (ignore already-exists)
  curl --ftp-pasv -sS --user "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_SERVER}/" -Q "MKD ${remote_dir%/}" >/dev/null 2>&1 || true
}

curl_ftp_upload() {
  local local_path="$1"
  local remote_file="$2"
  curl --ftp-pasv -sS --user "${FTP_USER}:${FTP_PASSWORD}" \
    --ftp-create-dirs \
    -T "$local_path" "ftp://${FTP_SERVER}${remote_file}" >/dev/null
}

curl_ftp_delete() {
  local remote_file="$1"
  curl --ftp-pasv -sS --user "${FTP_USER}:${FTP_PASSWORD}" \
    "ftp://${FTP_SERVER}/" -Q "DELE ${remote_file}" >/dev/null
}

# Collect remote files (relative paths) under REMOTE_PATH into assoc-style files via temp
collect_remote_files_curl() {
  local remote_dir="$1"
  local prefix="${2:-}"
  local out_file="$3"
  local listing name rel is_dir

  listing="$(curl_ftp_list_details "$remote_dir")" || return 0
  while IFS= read -r line; do
    [[ -z "${line// }" ]] && continue
    [[ "$line" == total* ]] && continue
    # Last field is name (LIST format)
    name="$(awk '{print $NF}' <<<"$line")"
    [[ -z "$name" || "$name" == "." || "$name" == ".." ]] && continue
    if [[ -n "$prefix" ]]; then
      rel="${prefix}/${name}"
    else
      rel="$name"
    fi
    if [[ "$line" == d* ]] || [[ "$line" == *"<DIR>"* ]]; then
      collect_remote_files_curl "${remote_dir}${name}/" "$rel" "$out_file"
    else
      local size
      size="$(curl_ftp_size "${remote_dir}${name}")"
      [[ -z "$size" ]] && size="-1"
      printf '%s\t%s\n' "$rel" "$size" >>"$out_file"
    fi
  done <<<"$listing"
}

is_always_upload() {
  local rel="$1"
  local a
  for a in "${ALWAYS_UPLOAD[@]}"; do
    [[ "$rel" == "$a" ]] && return 0
  done
  return 1
}

sync_with_curl() {
  echo "Syncing with curl --ftp-pasv (incremental by size, delete stale)..."
  local remote
  remote="$(normalize_ftp_dir "$REMOTE_PATH")"

  curl_ftp_mkdir "$remote"

  local remote_list
  remote_list="$(mktemp)"
  trap 'rm -f "$remote_list"' RETURN

  echo "Listing remote files for comparison..."
  collect_remote_files_curl "$remote" "" "$remote_list"
  local remote_count
  remote_count="$(wc -l <"$remote_list" | tr -d ' ')"
  echo "Remote currently has ${remote_count} file(s)."

  local uploaded=0 skipped=0 deleted=0 failed=0

  echo "Syncing local dist/ to remote..."
  local file rel remote_file local_size remote_size force reason
  while IFS= read -r -d '' file; do
    rel="${file#dist/}"
    remote_file="${remote}${rel}"
    local_size="$(wc -c <"$file" | tr -d ' ')"
    remote_size="$(awk -F'\t' -v r="$rel" '$1==r{print $2; exit}' "$remote_list")"

    force=0
    if is_always_upload "$rel"; then
      force=1
    fi

    if [[ "$force" -eq 0 && -n "$remote_size" && "$remote_size" == "$local_size" ]]; then
      skipped=$((skipped + 1))
      echo "Skip (same size): $rel"
      continue
    fi

    # Ensure parent dirs
    if [[ "$rel" == */* ]]; then
      local parent="${rel%/*}"
      local part path_so_far="$remote"
      IFS='/' read -ra parts <<<"$parent"
      for part in "${parts[@]}"; do
        path_so_far="${path_so_far}${part}/"
        curl_ftp_mkdir "$path_so_far"
      done
    fi

    if curl_ftp_upload "$file" "$remote_file"; then
      uploaded=$((uploaded + 1))
      if [[ "$force" -eq 1 ]]; then
        reason="always"
      elif [[ -z "$remote_size" ]]; then
        reason="new"
      else
        reason="changed"
      fi
      echo "Uploaded (${reason}): ${rel} ($(awk -v b="$local_size" 'BEGIN{printf "%.1f", b/1024}') KB)"
    else
      failed=$((failed + 1))
      echo "Failed: $rel" >&2
    fi
  done < <(find dist -type f -print0 | sort -z)

  echo "Removing stale remote files..."
  while IFS=$'\t' read -r rel remote_size; do
    [[ -z "$rel" ]] && continue
    if [[ -f "dist/$rel" ]]; then
      continue
    fi
    if curl_ftp_delete "${remote}${rel}"; then
      deleted=$((deleted + 1))
      echo "Deleted stale: $rel"
    else
      failed=$((failed + 1))
      echo "Failed delete: $rel" >&2
    fi
  done <"$remote_list"

  echo ""
  echo "=== DEPLOYMENT VERIFICATION ==="
  local critical
  for critical in index.html .htaccess; do
    local size
    size="$(curl_ftp_size "${remote}${critical}")"
    if [[ -n "$size" ]]; then
      echo "[OK] ${critical} verified (${size} bytes)"
    else
      echo "[FAIL] ${critical} MISSING!" >&2
      failed=$((failed + 1))
    fi
  done

  if [[ "$failed" -gt 0 ]]; then
    die "Sync completed with ${failed} failed operation(s)."
  fi

  echo ""
  echo "DIFF SYNC finished! Uploaded ${uploaded}, skipped ${skipped}, deleted ${deleted}."
}

main() {
  REMOTE_PATH="$(normalize_ftp_dir "$REMOTE_PATH")"
  BASE_PATH="$(normalize_web_base "$BASE_PATH")"

  echo "Starting DIFF SYNC GM Cockpit deployment..."
  echo "Remote is not wiped - only new/changed files upload; stale remote files are removed."
  echo "Vite base: $BASE_PATH"
  echo "Public URL: $PUBLIC_URL"

  ensure_deps
  build_dist
  require_ftp_password

  if command -v lftp >/dev/null 2>&1; then
    sync_with_lftp
  elif command -v curl >/dev/null 2>&1; then
    sync_with_curl
  else
    die "Need lftp or curl for FTP sync"
  fi

  echo "App should now work at: $PUBLIC_URL"
}

main "$@"
