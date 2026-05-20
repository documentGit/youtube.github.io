(async () => {
  var stage = 'init';
  try {
    stage = 'videoId';
    var videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) { prompt('動画ページではありません', ''); return; }

    function matchBraces(text, start) {
      var depth = 0, inStr = false, esc = false;
      for (var i = start; i < text.length; i++) {
        var c = text[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
      }
      return null;
    }
    function extractPR(text) {
      var keys = ['ytInitialPlayerResponse', '"playerResponse"'];
      for (var k = 0; k < keys.length; k++) {
        var idx = text.indexOf(keys[k]);
        while (idx >= 0) {
          var bi = text.indexOf('{', idx);
          if (bi < 0 || bi - idx > 200) break;
          var js = matchBraces(text, bi);
          if (js) {
            try { var obj = JSON.parse(js); if (obj && (obj.captions || obj.videoDetails)) return obj; } catch(_){}
          }
          idx = text.indexOf(keys[k], idx + 1);
        }
      }
      return null;
    }

    var pr = window.ytInitialPlayerResponse;
    if (pr && !pr.captions && !pr.videoDetails) pr = null;
    if (!pr) pr = extractPR(document.documentElement.outerHTML);
    if (!pr) {
      var r = await fetch('/watch?v=' + videoId, { credentials: 'include' });
      pr = extractPR(await r.text());
    }
    if (!pr) { prompt('playerResponse 取得失敗', ''); return; }

    var tracks = ((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
    if (!tracks.length) { prompt('字幕なし', ''); return; }
    var track = tracks.find(x => x.languageCode === 'ja')
             || tracks.find(x => x.kind !== 'asr')
             || tracks[0];

    stage = 'show-baseurl';
    var baseUrl = track.baseUrl || '';
    var ans1 = prompt('baseUrl (コピーしてOK、中止ならCancel):', baseUrl);
    if (ans1 === null) return;

    stage = 'normalize-url';
    if (baseUrl.startsWith('//')) baseUrl = 'https:' + baseUrl;
    if (baseUrl.startsWith('/')) baseUrl = 'https://www.youtube.com' + baseUrl;

    stage = 'validate-url';
    var urlObj;
    try { urlObj = new URL(baseUrl); }
    catch(e) { prompt('URL 不正: ' + e.message, baseUrl); return; }
    urlObj.searchParams.set('fmt', 'json3');
    var finalUrl = urlObj.toString();

    stage = 'fetch-call';
    var capRes = await fetch(finalUrl);

    stage = 'fetch-status';
    if (!capRes.ok) { prompt('HTTP ' + capRes.status, finalUrl); return; }

    stage = 'read-text';
    var raw = await capRes.text();

    stage = 'inspect-text';
    if (!raw) { prompt('空応答', finalUrl); return; }
    var ans2 = prompt('応答先頭 500 文字 (続行ならOK):', raw.slice(0, 500));
    if (ans2 === null) return;

    stage = 'parse-json';
    var data = JSON.parse(raw);

    stage = 'render';
    var lines = (data.events || []).map(function (ev) {
      if (!ev.segs) return '';
      var s = Math.floor((ev.tStartMs || 0) / 1000);
      var ts = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      var x = ev.segs.map(function (g) { return g.utf8; }).join('').replace(/\n/g, ' ').trim();
      return x ? ts + ' ' + x : '';
    }).filter(Boolean);
    prompt('成功: ' + lines.length + '行', lines.slice(0, 5).join('\n'));
  } catch (e) {
    prompt('[' + stage + '] エラー', (e && e.message ? e.message : String(e)));
  }
})();
