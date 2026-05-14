(function(){
  // m.youtube.com → www.youtube.com リダイレクト
  if (location.host !== 'www.youtube.com') {
    var u = new URL(location);
    u.host = 'www.youtube.com';
    u.searchParams.set('app', 'desktop');
    location.href = u;
    return;
  }

  var b = document.querySelector('button[aria-label*="文字起こし"]');
  if (b) b.click();

  setTimeout(function(){
    var lines = [];
    var oldSegs = document.querySelectorAll('ytd-transcript-segment-renderer');
    var newSegs = document.querySelectorAll('transcript-segment-view-model');

    if (oldSegs.length) {
      oldSegs.forEach(function(s){
        var ts = s.querySelector('.segment-timestamp');
        var tx = s.querySelector('.segment-text');
        var t = ts ? ts.textContent.trim() : '';
        var x = tx ? tx.textContent.trim() : '';
        if (x) lines.push(t + ' ' + x);
      });
    } else if (newSegs.length) {
      newSegs.forEach(function(s){
        var ts = s.querySelector('.ytwTranscriptSegmentViewModelTimestamp');
        var t = ts ? ts.textContent.trim() : '';
        var parts = [];
        for (var i = 0; i < s.children.length; i++) {
          var c = s.children[i];
          if (!c.className || c.className.indexOf('ytwTranscriptSegmentViewModelTimestamp') < 0) {
            parts.push(c.textContent.trim());
          }
        }
        lines.push(t + ' ' + parts.join(' '));
      });
    }

    var title = (document.querySelector('h1.ytd-watch-metadata') || document.querySelector('h1') || {}).textContent || document.title;
    title = title.trim();
    var ch = (document.querySelector('ytd-channel-name a') || document.querySelector('ytd-channel-name') || {}).textContent || '';
    ch = ch.trim();
    var url = location.href.split('&')[0];
    var head = 'タイトル: ' + title + '\nチャンネル: ' + ch + '\nURL: ' + url + '\n\n';
    var text = head + lines.join('\n');
    var q = '以下のYouTube動画の文字起こしを要約してください\n\n' + text;
    var prompt2 = '以下に貼り付けるYouTube動画(' + title + ')の文字起こしを要約してください。本文はクリップボードにコピー済みなので、この後すぐ貼り付けます。';

    // ボタン共通スタイル
    // ボーダーなし、色差で区別。
    // 右側だけ線にしたい場合は 'border:none' を 'border:none;border-right:1px solid #888' に。
    var st = 'position:fixed;top:0;height:10vh;z-index:2147483647;font-size:13px;border:none;border-radius:0;box-sizing:border-box;margin:0;';

    var bs = document.createElement('button');
    bs.textContent = '全選択';
    bs.style.cssText = st + 'left:0;width:20vw;background:#eee;';
    bs.onclick = function(){
      ta.value = q;
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); bs.textContent = 'コピー試行'; } catch(e) {}
    };

    var bcl = document.createElement('button');
    bcl.textContent = 'Claude';
    bcl.style.cssText = st + 'left:20vw;width:20vw;background:#d97757;color:#fff;';
    bcl.onclick = function(){
      var u = 'https://claude.ai/new?q=' + encodeURIComponent(q);
      if (u.length < 2000) {
        window.open(u, '_blank');
      } else {
        ta.value = text;
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt2), '_blank');
      }
    };

    var bgpt = document.createElement('button');
    bgpt.textContent = 'ChatGPT';
    bgpt.style.cssText = st + 'left:40vw;width:20vw;background:#10a37f;color:#fff;';
    bgpt.onclick = function(){
      var u = 'https://chatgpt.com/?q=' + encodeURIComponent(q);
      if (u.length < 2000) {
        window.open(u, '_blank');
      } else {
        ta.value = text;
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        window.open('https://chatgpt.com/?q=' + encodeURIComponent(prompt2), '_blank');
      }
    };

    var bgm = document.createElement('button');
    bgm.textContent = 'Gemini';
    bgm.style.cssText = st + 'left:60vw;width:20vw;background:#1c69d4;color:#fff;';
    bgm.onclick = function(){
      ta.value = q;
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch(e) {}
      window.open('https://gemini.google.com/app', '_blank');
    };

    var bc = document.createElement('button');
    bc.textContent = '閉じる';
    bc.style.cssText = st + 'right:0;width:20vw;background:#eee;';
    bc.onclick = function(){
      ta.remove(); bs.remove(); bcl.remove(); bgpt.remove(); bgm.remove(); bc.remove();
    };

    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:10vh;left:0;width:100vw;height:90vh;z-index:2147483646;font-size:13px;box-sizing:border-box;margin:0;';

    document.body.appendChild(ta);
    document.body.appendChild(bs);
    document.body.appendChild(bcl);
    document.body.appendChild(bgpt);
    document.body.appendChild(bgm);
    document.body.appendChild(bc);
    ta.focus();
    ta.select();
  }, 3000);
})();
