#!/usr/bin/env bash
# install.sh — build and integrate yt-dlp (farouqagboola94-max fork) into the OS
# Usage: bash install.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_BIN="/usr/local/bin"
CONFIG_DIR="${HOME}/.config/yt-dlp"
DOWNLOAD_DIR="${HOME}/Downloads/yt-dlp"

echo "==> Installing yt-dlp from source: ${REPO_DIR}"

# 1. Install ffmpeg if missing
if ! command -v ffmpeg &>/dev/null; then
  echo "==> Installing ffmpeg..."
  if command -v apt-get &>/dev/null; then
    sudo apt-get install -y ffmpeg
  elif command -v brew &>/dev/null; then
    brew install ffmpeg
  elif command -v dnf &>/dev/null; then
    sudo dnf install -y ffmpeg
  else
    echo "WARNING: Could not install ffmpeg automatically. Install it manually."
  fi
fi

# 2. Install yt-dlp in editable mode (live-editable from source)
echo "==> Installing yt-dlp (editable)..."
pip3 install -e "${REPO_DIR}[default]" --break-system-packages --quiet 2>/dev/null \
  || pip3 install -e "${REPO_DIR}[default]" --quiet

# 3. Create directories
echo "==> Creating directories..."
mkdir -p "${CONFIG_DIR}" "${DOWNLOAD_DIR}" "${DOWNLOAD_DIR}/audio" "${DOWNLOAD_DIR}/thumbs"

# 4. Write yt-dlp config (skips if already exists)
if [ ! -f "${CONFIG_DIR}/config" ]; then
  echo "==> Writing ${CONFIG_DIR}/config..."
  cat > "${CONFIG_DIR}/config" <<'EOF'
# yt-dlp configuration — farouqagboola94-max/yt-dlp fork

--output ~/Downloads/yt-dlp/%(uploader)s/%(title)s.%(ext)s
--format bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best
--merge-output-format mp4
--embed-thumbnail
--embed-metadata
--embed-chapters
--progress
--console-title
--retries 10
--fragment-retries 10
--sponsorblock-mark all
EOF
else
  echo "==> ${CONFIG_DIR}/config already exists, skipping."
fi

# 5. Install ytdl wrapper
echo "==> Installing ytdl wrapper to ${INSTALL_BIN}/ytdl..."
sudo tee "${INSTALL_BIN}/ytdl" > /dev/null <<WRAPPER
#!/usr/bin/env bash
# ytdl — convenience wrapper around yt-dlp

set -euo pipefail

DOWNLOAD_DIR="\${HOME}/Downloads/yt-dlp"
YT_DLP="yt-dlp"

usage() {
  cat <<EOF
ytdl — yt-dlp wrapper

Usage:
  ytdl <URL>                  Download best quality video
  ytdl audio <URL>            Download audio only as mp3
  ytdl mp4 <URL>              Download best mp4
  ytdl 1080 <URL>             Download up to 1080p mp4
  ytdl 720 <URL>              Download up to 720p mp4
  ytdl playlist <URL>         Download entire playlist, numbered
  ytdl subs <URL>             Download with auto-generated English subtitles
  ytdl info <URL>             Show available formats (no download)
  ytdl thumb <URL>            Download thumbnail only
  ytdl update                 Reinstall from source
  ytdl version                Show yt-dlp version
  ytdl -- [ARGS...]           Pass raw args directly to yt-dlp

Downloads saved to: \${DOWNLOAD_DIR}/<uploader>/<title>.<ext>
EOF
}

cmd="\${1:-}"

case "\$cmd" in
  ""|--help|-h) usage; exit 0 ;;
  version) \$YT_DLP --version ;;
  update)
    pip3 install -e "${REPO_DIR}[default]" --break-system-packages --quiet 2>/dev/null \
      || pip3 install -e "${REPO_DIR}[default]" --quiet
    echo "yt-dlp updated from source (farouqagboola94-max/yt-dlp)" ;;
  audio)
    shift
    \$YT_DLP --extract-audio --audio-format mp3 --audio-quality 0 \
      --embed-thumbnail --embed-metadata \
      --output "\${DOWNLOAD_DIR}/audio/%(uploader)s/%(title)s.%(ext)s" "\$@" ;;
  mp4)
    shift
    \$YT_DLP --format "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" \
      --merge-output-format mp4 "\$@" ;;
  1080)
    shift
    \$YT_DLP --format "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best" \
      --merge-output-format mp4 "\$@" ;;
  720)
    shift
    \$YT_DLP --format "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best" \
      --merge-output-format mp4 "\$@" ;;
  playlist)
    shift
    \$YT_DLP --output "\${DOWNLOAD_DIR}/%(playlist_uploader)s/%(playlist)s/%(playlist_index)02d - %(title)s.%(ext)s" \
      --yes-playlist "\$@" ;;
  subs)
    shift
    \$YT_DLP --write-auto-subs --sub-langs "en.*" --embed-subs "\$@" ;;
  info)
    shift; \$YT_DLP --list-formats "\$@" ;;
  thumb)
    shift
    \$YT_DLP --write-thumbnail --skip-download \
      --output "\${DOWNLOAD_DIR}/thumbs/%(title)s.%(ext)s" "\$@" ;;
  --) shift; \$YT_DLP "\$@" ;;
  *) \$YT_DLP "\$@" ;;
esac
WRAPPER

sudo chmod +x "${INSTALL_BIN}/ytdl"

echo ""
echo "✓ yt-dlp $(yt-dlp --version) installed at $(which yt-dlp)"
echo "✓ ytdl wrapper installed at ${INSTALL_BIN}/ytdl"
echo "✓ Config: ${CONFIG_DIR}/config"
echo "✓ Downloads: ${DOWNLOAD_DIR}"
echo "✓ ffmpeg: $(which ffmpeg)"
echo ""
echo "Try it:"
echo "  ytdl info <URL>       # inspect formats"
echo "  ytdl audio <URL>      # download mp3"
echo "  ytdl 1080 <URL>       # download 1080p mp4"
