import re

from .common import InfoExtractor
from ..utils import (
    ExtractorError,
    clean_html,
    int_or_none,
    str_or_none,
    traverse_obj,
    unified_strdate,
    url_or_none,
)


class BoomplayIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?boomplay\.com/songs/(?P<id>\d+)'
    _TESTS = [{
        'url': 'https://www.boomplay.com/songs/95833767',
        'info_dict': {
            'id': '95833767',
            'ext': 'mp3',
            'title': str,
            'uploader': str,
            'thumbnail': r're:https?://.+',
        },
        'skip': 'Requires free account or regional access',
    }]

    def _real_extract(self, url):
        song_id = self._match_id(url)
        webpage = self._download_webpage(url, song_id)

        # Extract JSON-LD or OG metadata
        title = (
            self._og_search_title(webpage, default=None)
            or self._html_search_regex(r'<h1[^>]*class="[^"]*song[^"]*"[^>]*>([^<]+)', webpage, 'title', fatal=False)
            or self._html_extract_title(webpage)
        )

        # Boomplay serves audio via an API endpoint; extract the stream token from page
        stream_url = self._search_regex(
            r'"(?:streamUrl|mp3Url|audioUrl)"\s*:\s*"([^"]+)"',
            webpage, 'stream url', default=None)

        if not stream_url:
            # Try the JS data blob
            player_data = self._search_json(
                r'var\s+playerData\s*=', webpage, 'player data', song_id,
                contains_pattern=r'\{(?s:.+)\}', default=None)
            stream_url = traverse_obj(player_data, 'streamUrl') or traverse_obj(player_data, 'mp3Url')

        if not stream_url:
            raise ExtractorError(
                'Could not find stream URL. The track may require a Boomplay account or is geo-restricted.',
                expected=True)

        thumbnail = (
            self._og_search_thumbnail(webpage, default=None)
            or url_or_none(self._search_regex(
                r'"(?:coverUrl|thumbnail|image)"\s*:\s*"([^"]+)"',
                webpage, 'thumbnail', default=None)))

        uploader = (
            self._og_search_property('music:musician', webpage, default=None)
            or clean_html(self._search_regex(
                r'<[^>]+class="[^"]*artist[^"]*"[^>]*>([^<]+)', webpage, 'uploader', default=None)))

        return {
            'id': song_id,
            'title': clean_html(title) or song_id,
            'url': stream_url,
            'thumbnail': thumbnail,
            'uploader': uploader,
            'webpage_url': url,
        }


class BoomplayPlaylistIE(InfoExtractor):
    _VALID_URL = r'https?://(?:www\.)?boomplay\.com/(?:playlists|albums)/(?P<id>\d+)'
    _TESTS = [{
        'url': 'https://www.boomplay.com/playlists/123456',
        'info_dict': {
            'id': '123456',
            'title': str,
        },
        'playlist_mincount': 1,
        'skip': 'Requires regional access',
    }]

    def _real_extract(self, url):
        playlist_id = self._match_id(url)
        webpage = self._download_webpage(url, playlist_id)

        title = self._og_search_title(webpage, default=playlist_id)

        # Extract all song IDs from the playlist page
        song_ids = re.findall(r'/songs/(\d+)', webpage)
        seen = set()
        entries = []
        for sid in song_ids:
            if sid not in seen:
                seen.add(sid)
                entries.append(self.url_result(
                    f'https://www.boomplay.com/songs/{sid}',
                    ie=BoomplayIE.ie_key(),
                    video_id=sid))

        return self.playlist_result(entries, playlist_id, clean_html(title))
