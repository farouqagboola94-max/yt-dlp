'use strict';

let currentMode = 'best';
let currentTabUrl = '';
let serverOnline = false;
let pollTimer = null;

const SERVER = 'http://localhost:5000';

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    currentTabUrl = tab.url;
    checkServer(tab.url);
  } else {
    setServerStatus(false, 'No active tab');
  }
});

// ── Server health + page info ──────────────────────────────────────────────
async function checkServer(url) {
  try {
    const res = await fetch(`${SERVER}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (data.error) {
      setServerStatus(true, 'online');
      showPageInfo({ title: 'Unsupported or unavailable', uploader: '', duration: '', extractor: '' });
      document.getElementById('dl-btn').disabled = true;
    } else {
      setServerStatus(true, 'online');
      showPageInfo(data);
    }
  } catch (e) {
    setServerStatus(false, 'offline');
  }
}

function setServerStatus(online, label) {
  serverOnline = online;
  const dot = document.getElementById('server-dot');
  dot.className = 'server-dot ' + (online ? 'online' : 'offline');
  document.getElementById('server-label').textContent = label;
  document.getElementById('offline-warn').style.display = online ? 'none' : 'block';
  document.getElementById('dl-btn').disabled = !online;
}

function showPageInfo(data) {
  document.getElementById('page-title').textContent = data.title || '—';
  const parts = [data.uploader, data.duration, data.extractor].filter(Boolean);
  document.getElementById('page-meta').textContent = parts.join(' · ');

  if (data.thumbnail) {
    const img = document.getElementById('thumb');
    img.src = data.thumbnail;
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; };
  }
}

// ── Quality picker ─────────────────────────────────────────────────────────
function setMode(el) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  currentMode = el.dataset.mode;
}

// ── Download ───────────────────────────────────────────────────────────────
async function download() {
  if (!serverOnline || !currentTabUrl) return;

  const btn = document.getElementById('dl-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';

  showProgressSection(true);
  updateProgress(0, 'Queued…');

  try {
    const res = await fetch(`${SERVER}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentTabUrl, mode: currentMode }),
    });
    const { job_id } = await res.json();
    pollJob(job_id);
  } catch (e) {
    updateProgress(0, 'Error: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Retry';
  }
}

function pollJob(jobId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const job = await fetch(`${SERVER}/api/status/${jobId}`).then(r => r.json());
      const pct = job.progress || 0;

      if (job.status === 'done') {
        clearInterval(pollTimer);
        updateProgress(100, `Saved: ${job.filename || '~/Downloads/yt-dlp/'}`);
        document.getElementById('dl-btn').disabled = false;
        document.getElementById('dl-btn').textContent = 'Download again';
      } else if (job.status === 'error') {
        clearInterval(pollTimer);
        updateProgress(0, `Failed: ${job.error || 'unknown error'}`);
        document.getElementById('dl-btn').disabled = false;
        document.getElementById('dl-btn').textContent = 'Retry';
      } else {
        updateProgress(pct, `${Math.round(pct)}% — ${job.log || ''}`.trim());
      }
    } catch (_) { /* server momentarily busy */ }
  }, 800);
}

function showProgressSection(show) {
  document.getElementById('progress-section').style.display = show ? 'block' : 'none';
}

function updateProgress(pct, text) {
  document.getElementById('pbar').style.width = pct + '%';
  document.getElementById('status-text').textContent = text;
}
