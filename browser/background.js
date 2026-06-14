// Service worker — proxies download requests to the local yt-dlp server
// and manages notification + badge state.

const SERVER = 'http://localhost:5000';
const activeJobs = new Map(); // tabId -> {jobId, intervalId}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_DOWNLOAD') {
    handleDownload(msg.url, msg.mode, sender.tab?.id)
      .then(r => sendResponse({ ok: true, jobId: r.jobId }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'CHECK_SERVER') {
    fetch(`${SERVER}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: msg.url }),
      signal: AbortSignal.timeout(8000),
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: !data.error, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'GET_STATUS') {
    const job = activeJobs.get(msg.tabId);
    sendResponse({ job: job ? { jobId: job.jobId, status: job.status, progress: job.progress } : null });
  }
});

async function handleDownload(url, mode, tabId) {
  const res = await fetch(`${SERVER}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, mode }),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const { job_id } = await res.json();

  // Poll until done
  const job = { jobId: job_id, status: 'running', progress: 0 };
  if (tabId) activeJobs.set(tabId, job);

  const intervalId = setInterval(async () => {
    try {
      const s = await fetch(`${SERVER}/api/status/${job_id}`).then(r => r.json());
      job.status = s.status;
      job.progress = s.progress || 0;

      // Update badge
      if (tabId) {
        const label = s.status === 'done' ? '✓' : `${Math.round(job.progress)}%`;
        chrome.action.setBadgeText({ text: label, tabId });
        chrome.action.setBadgeBackgroundColor({
          color: s.status === 'done' ? '#22cc66' : s.status === 'error' ? '#cc2222' : '#ff4444',
          tabId,
        });
      }

      if (s.status === 'done' || s.status === 'error') {
        clearInterval(intervalId);
        if (tabId) activeJobs.delete(tabId);

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: s.status === 'done' ? 'Download complete' : 'Download failed',
          message: s.status === 'done'
            ? (s.filename || 'File saved to ~/Downloads/yt-dlp/')
            : (s.error || 'Unknown error'),
        });

        // Forward status update to content script
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { type: 'JOB_UPDATE', status: s.status, progress: 100, filename: s.filename });
        }
      } else {
        // Progress update to content script
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { type: 'JOB_UPDATE', status: 'running', progress: job.progress }).catch(() => {});
        }
      }
    } catch (_) { /* server temporarily unavailable */ }
  }, 1000);

  return { jobId: job_id };
}
