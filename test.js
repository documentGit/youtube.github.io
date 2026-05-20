(async () => {
  var stage = 'init';
  try {
    stage = 'videoId';
    var videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) { alert('動画ページではありません'); return; }

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
    if (!pr) { alert('playerResponse 取得失敗'); return; }

    var tracks = ((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
    if (!tracks.length) { alert('字幕なし'); return; }
    var track = tracks.find(x => x.languageCode === 'ja')
             || tracks.find(x => x.kind !== 'asr')
             || tracks[0];

    // ★ ここから細かく分割
    stage = 'show-baseurl';
    var baseUrl = track.baseUrl || '';
    // まず baseUrl の実体を確認（長いので先頭だけ）
    if (!confirm('baseUrl 先頭:\n' + baseUrl.slice(0, 300) + '\n\n続行?')) return;

    stage = 'normalize-url';
    // スキーマなしなら付ける
    if (baseUrl.startsWith('//')) baseUrl = 'https:' + baseUrl;
    if (baseUrl.startsWith('/')) baseUrl = 'https://www.youtube.com' + baseUrl;

    stage = 'validate-url';
    var urlObj;
    try { urlObj = new URL(baseUrl); }
    catch(e) { alert('URL 不正: ' + e.message + '\n' + baseUrl.slice(0, 200)); return; }
    urlObj.searchParams.set('fmt', 'json3');
    var finalUrl = urlObj.toString();

    stage = 'fetch-call';
    var capRes = await fetch(finalUrl);

    stage = 'fetch-status';
    if (!capRes.ok) { alert('HTTP ' + capRes.status); return; }

    stage = 'read-text';
    var raw = await capRes.text();

    stage = 'inspect-text';
    if (!raw) { alert('空応答'); return; }
    // 応答の先頭を見せる（JSON か XML か HTML かを判別）
    if (!confirm('応答先頭:\n' + raw.slice(0, 300) + '\n\nパース続行?')) return;

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
    alert('成功: ' + lines.length + '行');
  } catch (e) {
    alert('[' + stage + '] ' + (e && e.message ? e.message : e));
  }
})();
