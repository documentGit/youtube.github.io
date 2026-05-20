javascript:(async()=>{
  try {
    var videoId = new URL(location.href).searchParams.get('v');
    if (!videoId) { alert('動画ページではありません'); return; }

    // 1) playerResponse をページ内から拾う(同一オリジン)
    var pr = window.ytInitialPlayerResponse;
    if (!pr) {
      var html = document.documentElement.outerHTML;
      var m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/);
      if (m) { try { pr = JSON.parse(m[1]); } catch(e){} }
    }
    // m サイトのページに無ければ /watch を同一オリジン fetch
    if (!pr) {
      var r = await fetch('/watch?v=' + videoId, {credentials:'include'});
      var t = await r.text();
      var m2 = t.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/);
      if (m2) pr = JSON.parse(m2[1]);
    }
    if (!pr) { alert('playerResponse 取得失敗'); return; }

    // 2) 字幕トラックを選ぶ
    var tracks = ((pr.captions||{}).playerCaptionsTracklistRenderer||{}).captionTracks || [];
    if (!tracks.length) { alert('この動画には字幕がありません'); return; }
    var track = tracks.find(t=>t.languageCode==='ja')
             || tracks.find(t=>t.kind!=='asr')
             || tracks[0];

    // 3) 字幕 XML を取得してパース
    //    baseUrl は www.youtube.com 配下なのでクロスオリジン。
    //    fmt=json3 を付けると JSON で返り扱いやすい。
    var url = track.baseUrl + '&fmt=json3';
    var capRes = await fetch(url);
    var data = await capRes.json();

    var lines = (data.events||[]).map(function(ev){
      if (!ev.segs) return '';
      var s = Math.floor((ev.tStartMs||0)/1000);
      var ts = Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
      var text = ev.segs.map(function(x){return x.utf8;}).join('').replace(/\n/g,' ').trim();
      return text ? ts + ' ' + text : '';
    }).filter(Boolean);

    // 4) 以後は今のブックマークレットと同じく textarea + 各 LLM 飛ばしボタン
    var title = (document.querySelector('h1') || {}).textContent || document.title;
    var head = 'タイトル: ' + title.trim() + '\nURL: ' + location.href.split('&')[0] + '\n\n';
    var text = head + lines.join('\n');
    // 既存の UI 生成コードに text を渡せばそのまま動く
    console.log(text);
    // ...
  } catch(e) { alert(e); }
})();
