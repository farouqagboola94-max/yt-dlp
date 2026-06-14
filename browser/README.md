# yt-dlp Browser Extension

One-click video downloader for Chrome and Firefox, powered by your local yt-dlp installation.

## How it works

The extension talks to the `yt-dlp-web` Flask server running locally on port 5000.
The server calls yt-dlp and saves files to `~/Downloads/yt-dlp/`.

```
Browser Extension  →  localhost:5000  →  yt-dlp  →  ~/Downloads/yt-dlp/
```

## Requirements

- yt-dlp installed (done via `install.sh`)
- Flask web server running: **`yt-dlp-web`**

## Install in Chrome / Edge / Brave

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `browser/` folder
5. Pin the extension to the toolbar

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `browser/manifest.json`

> For permanent install, package as a signed extension via [addons.mozilla.org](https://addons.mozilla.org).

## Supported sites

YouTube, TikTok, Instagram, X/Twitter, Facebook, Boomplay, SoundCloud,
Vimeo, Twitch, Reddit, Dailymotion — and 1,800+ more via yt-dlp.

## Usage

1. Start the server: `yt-dlp-web`
2. Navigate to any video page
3. Click the **red download button** (bottom-right corner)
4. Or click the extension icon in the toolbar for the popup UI

## Quality options

| Mode    | Output                    |
|---------|---------------------------|
| Best    | Highest quality MP4       |
| 1080p   | Capped at 1080p MP4       |
| 720p    | Capped at 720p MP4        |
| MP3     | Audio only, highest quality |

## Files

```
browser/
├── manifest.json   — Extension manifest (MV3)
├── background.js   — Service worker (download jobs, notifications, badge)
├── content.js      — Floating button injected into video pages
├── content.css     — Styles for injected button
├── popup.html      — Toolbar popup UI
├── popup.js        — Popup logic
└── icons/          — Extension icons (16px, 48px, 128px)
```
