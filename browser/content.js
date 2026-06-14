// yt-dlp content script — injected on supported video pages

(function () {
  'use strict';

  if (document.getElementById('ytdlp-btn-wrap')) return; // already injected

  let selectedMode = 'best';
  let downloading = false;

  // ── Build the floating widget ──────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.id = 'ytdlp-btn-wrap';

  // Quality selector row
  const qualityRow = document.createElement('div');
  qualityRow.id = 'ytdlp-quality-row';
  const modes = [
    { label: 'Best',  value: 'best'  },
    { label: '1080p', value: '1080'  },
    { label: '720p',  value: '720'   },
    { label: 'MP3',   value: 'audio' },
  ];
  modes.forEach(m => {
    const b = document.createElement('button');
    b.className = 'ytdlp-q-btn' + (m.value === 'best' ? ' active' : '');
    b.textContent = m.label;
    b.dataset.mode = m.value;
    b.addEventListener('click', () => {
      selectedMode = m.value;
      qualityRow.querySelectorAll('.ytdlp-q-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
    qualityRow.appendChild(b);
  });

  // Main download button
  const mainBtn = document.createElement('button');
  mainBtn.id = 'ytdlp-main-btn';
  mainBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3v13M7 11l5 5 5-5"/><path d="M3 19h18"/>
    </svg>
    <span id="ytdlp-btn-label">Download</span>
  `;
  mainBtn.addEventListener('click', startDownload);

  // Progress bar (hidden initially)
  const progressWrap = document.createElement('div');
  progressWrap.id = 'ytdlp-progress-wrap';
  progressWrap.style.display = 'none';
  progressWrap.innerHTML = `
    <span id="ytdlp-status-text">Starting…</span>
    <div id="ytdlp-progress-bar-bg">
      <div id="ytdlp-progress-bar"></div>
    </div>
  `;

  wrap.appendChild(progressWrap);
  wrap.appendChild(qualityRow);
  wrap.appendChild(mainBtn);
  document.body.appendChild(wrap);

  // ── Listen for updates from background ────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'JOB_UPDATE') return;
    updateProgress(msg.status, msg.progress, msg.filename);
  });

  // ── Handle download click ─────────────────────────────────────────────────
  function startDownload() {
    if (downloading) return;
    downloading = true;

    const url = window.location.href;
    setButtonState('loading', 'Sending…');
    showProgress('Queued…', 0);

    chrome.runtime.sendMessage(
      { type: 'START_DOWNLOAD', url, mode: selectedMode },
      (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          const err = res?.error || chrome.runtime.lastError?.message || 'Could not reach yt-dlp server';
          setButtonState('error', 'Error');
          showProgress('Error: ' + err, 0);
          downloading = false;
        } else {
          setButtonState('loading', 'Downloading…');
        }
      }
    );
  }

  function updateProgress(status, pct, filename) {
    if (status === 'done') {
      setButtonState('done', 'Saved!');
      showProgress(filename || 'Saved to ~/Downloads/yt-dlp/', 100);
      setTimeout(resetButton, 4000);
    } else if (status === 'error') {
      setButtonState('error', 'Failed');
      showProgress('Download failed', 0);
      setTimeout(resetButton, 4000);
    } else {
      setButtonState('loading', `${Math.round(pct)}%`);
      showProgress(`${Math.round(pct)}%`, pct);
    }
  }

  function setButtonState(state, label) {
    mainBtn.className = state === 'loading' ? 'loading' : state === 'done' ? 'done' : state === 'error' ? 'error' : '';
    mainBtn.id = 'ytdlp-main-btn';
    document.getElementById('ytdlp-btn-label').textContent = label;
    mainBtn.disabled = state === 'loading';
  }

  function showProgress(text, pct) {
    progressWrap.style.display = 'block';
    document.getElementById('ytdlp-status-text').textContent = text;
    document.getElementById('ytdlp-progress-bar').style.width = pct + '%';
  }

  function resetButton() {
    downloading = false;
    setButtonState('', 'Download');
    progressWrap.style.display = 'none';
    document.getElementById('ytdlp-progress-bar').style.width = '0%';
  }

  // Handle YouTube SPA navigation (URL changes without page reload)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      resetButton();
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
