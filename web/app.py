import os
import re
import threading
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory

app = Flask(__name__)

DOWNLOAD_DIR = Path.home() / 'Downloads' / 'yt-dlp'
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# In-memory job store  {job_id: {status, progress, filename, error}}
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


def run_download(job_id: str, url: str, mode: str):
    import subprocess

    format_map = {
        'best':   ['--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
                   '--merge-output-format', 'mp4'],
        '1080':   ['--format', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best',
                   '--merge-output-format', 'mp4'],
        '720':    ['--format', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best',
                   '--merge-output-format', 'mp4'],
        'audio':  ['--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0'],
    }

    out_template = str(DOWNLOAD_DIR / '%(uploader)s' / '%(title)s.%(ext)s')
    fmt_args = format_map.get(mode, format_map['best'])

    cmd = [
        'yt-dlp',
        '--no-check-certificates',
        '--embed-metadata',
        '--embed-thumbnail',
        '--newline',          # one progress line per update
        '-o', out_template,
        *fmt_args,
        url,
    ]

    with jobs_lock:
        jobs[job_id]['status'] = 'running'

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

        filename = None
        for line in proc.stdout:
            line = line.rstrip()
            # Pick up destination filename
            m = re.search(r'\[(?:download|Merger|ffmpeg)\]\s+(?:Destination|Merging formats into):\s*(.+)', line)
            if m:
                filename = m.group(1).strip()
            # Parse download percentage
            pct_m = re.search(r'(\d+\.?\d*)%', line)
            pct = float(pct_m.group(1)) if pct_m else None
            with jobs_lock:
                if pct is not None:
                    jobs[job_id]['progress'] = pct
                jobs[job_id]['log'] = line

        proc.wait()
        with jobs_lock:
            if proc.returncode == 0:
                jobs[job_id]['status'] = 'done'
                jobs[job_id]['progress'] = 100
                if filename:
                    jobs[job_id]['filename'] = os.path.basename(filename)
            else:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = jobs[job_id].get('log', 'Unknown error')
    except Exception as exc:
        with jobs_lock:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error'] = str(exc)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def get_info():
    url = request.json.get('url', '').strip()
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    import subprocess
    result = subprocess.run(
        ['yt-dlp', '--no-check-certificates', '--dump-json', '--no-playlist', url],
        capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return jsonify({'error': result.stderr.strip() or 'Failed to fetch info'}), 400
    import json
    try:
        data = json.loads(result.stdout)
        return jsonify({
            'title': data.get('title', ''),
            'uploader': data.get('uploader', data.get('channel', '')),
            'duration': data.get('duration_string', ''),
            'thumbnail': data.get('thumbnail', ''),
            'extractor': data.get('extractor', ''),
            'formats': len(data.get('formats', [])),
        })
    except Exception:
        return jsonify({'error': 'Could not parse response'}), 500


@app.route('/api/download', methods=['POST'])
def start_download():
    url = request.json.get('url', '').strip()
    mode = request.json.get('mode', 'best')
    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    job_id = str(uuid.uuid4())[:8]
    with jobs_lock:
        jobs[job_id] = {'status': 'queued', 'progress': 0, 'log': '', 'filename': None, 'error': None}

    thread = threading.Thread(target=run_download, args=(job_id, url, mode), daemon=True)
    thread.start()
    return jsonify({'job_id': job_id})


@app.route('/api/status/<job_id>')
def job_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


@app.route('/downloads/<path:filename>')
def serve_file(filename):
    return send_from_directory(str(DOWNLOAD_DIR), filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
