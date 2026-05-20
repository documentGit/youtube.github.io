(async () => {
  var stage = 'init';
  try {
    stage = 'videoId';
    var videoId = new URLSearchParams(location.search).get('v');
    if (!videoId) { alert('動画ページではありません'); return; }

    // ---- JSON 抽出ヘルパー ----
    function matchBraces(text, start) {
      var depth = 0, inStr = false, esc = false;
      for (var i = start; i < text.length; i++) {
        var c = text[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) return text.substring(start, i + 1);
        }
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
            try {
              var obj = JSON.parse(js);
              if (obj && (obj.captions || obj.videoDetails)) return obj;
            } catch (_) {}
          }
          idx = text.indexOf(keys[k], idx + 1);
        }
      }
      return null;
    }

    stage = 'window.pr';
    var pr = window.ytInitialPlayerResponse;
    if (pr && !pr.captions && !pr.videoDetails) pr = null;

    if (!pr) {
      stage = 'inline-html';
      pr = extractPR(document.documentElement.outerHTML);
    }
    if (!pr) {
      stage = 'fetch-watch';
      var r = await fetch('/watch?v=' + videoId, { credentials: 'include' });
      var t = await r.text();
      pr = extractPR(t);
    }
    if (!pr) { alert('playerResponse 取得失敗'); return; }

    stage = 'tracks';
    var tracks = ((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks || [];
    if (!tracks.length) { alert('この動画には字幕がありません'); return; }
    var track = tracks.find(x => x.languageCode === 'ja')
             || tracks.find(x => x.kind !== 'asr')
             || tracks[0];

    stage = 'fetch-timedtext';
    var capRes = await fetch(track.baseUrl + '&fmt=json3');
    if (!capRes.ok) { alert('字幕取得 HTTP ' + capRes.status); return; }
    var data = await capRes.json();

    stage = 'render';
    var lines = (data.events || []).map(function (ev) {
      if (!ev.segs) return '';
      var s = Math.floor((ev.tStartMs || 0) / 1000);
      var ts = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      var x = ev.segs.map(function (g) { return g.utf8; }).join('').replace(/\n/g, ' ').trim();
      return x ? ts + ' ' + x : '';
    }).filter(Boolean);

    var title = (document.querySelector('h1') || {}).textContent || document.title;
    var head = 'タイトル: ' + title.trim() + '\nURL: ' + location.href.split('&')[0] + '\n\n';
    var text = head + lines.join('\n');

    // とりあえずここで確認
    alert('成功: ' + lines.length + '行\n\n' + text.slice(0, 200));
    // ↑ ここを既存の UI 生成（textarea + Claude/ChatGPT ボタン）に差し替え
  } catch (e) {
    alert('[' + stage + '] ' + (e && e.message ? e.message : e));
  }
})();
