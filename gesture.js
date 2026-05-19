(function(){
  var v = document.querySelector('video');
  if (!v) return;

  var tgtRate = v.playbackRate;
  var lastVid = new URLSearchParams(location.search).get('v');

  // ============ コントロールパネル ============
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:10px;left:0;z-index:999999;background:#222;padding:3px 6px;border-radius:8px;color:#fff';

  var r = document.createElement('div');
  r.style.cssText = 'display:flex;align-items:center;width:300px';

  var l = document.createElement('div');
  l.textContent = v.playbackRate + 'x';
  l.style.cssText = 'cursor:pointer;flex:1;text-align:center;padding:2px 0;font-size:12px';
  l.addEventListener('click', function(){
    var v = document.querySelector('video');
    if (v) v.playbackRate = 1;
    tgtRate = 1;
    l.textContent = '1x';
  });

  var tm = document.createElement('div');
  tm.style.cssText = 'flex:2;text-align:center;padding:2px 0;font-size:11px;cursor:pointer';
  tm.textContent = '0:00/0:00';

  var p = document.createElement('button');
  p.textContent = 'PiP';
  p.style.cssText = 'flex:1;margin:0 4px;padding:2px 0';
  p.addEventListener('click', function(){
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      var v = document.querySelector('video');
      if (v) v.requestPictureInPicture();
    }
  });

  var hb = document.createElement('button');
  hb.textContent = '?';
  hb.style.cssText = 'flex:1;margin-right:4px;padding:2px 0';
  hb.addEventListener('click', function(){
    alert('上50% スワイプ：速度変更\n上50% 大きく振り戻し：1xに戻す\n中40% スライド：小刻みシーク\nタップ・ダブルタップ・長押し：YouTubeネイティブ\n時間タップ：シークバー表示・非表示');
  });

  var x = document.createElement('button');
  x.textContent = '✕';
  x.style.cssText = 'flex:1;padding:2px 0';
  x.addEventListener('click', function(){
    clearInterval(t);
    ov.remove();
    ov2.remove();
    d.remove();
    // documentリスナーは残るが、active=falseなので無害
    active = false;
  });

  r.appendChild(l);
  r.appendChild(tm);
  r.appendChild(p);
  r.appendChild(hb);
  r.appendChild(x);

  var tb = document.createElement('input');
  tb.type = 'range';
  tb.min = 0;
  tb.max = 1000;
  tb.step = 1;
  tb.value = 0;
  tb.style.cssText = 'width:300px;display:block;margin-top:4px';
  tb.addEventListener('input', function(){
    var cv = gv();
    if (cv && cv.duration && isFinite(cv.duration)) {
      cv.currentTime = cv.duration * tb.value / 1000;
    }
  });
  tm.addEventListener('click', function(){
    tb.style.display = tb.style.display === 'none' ? 'block' : 'none';
  });

  var a, b, c, e, di = null;
  r.addEventListener('pointerdown', function(t){
    if (t.button && t.button !== 0) return;
    a = d.offsetLeft;
    b = d.offsetTop;
    c = t.clientX;
    e = t.clientY;
    di = t.pointerId;
  });
  r.addEventListener('pointermove', function(t){
    if (t.pointerId !== di) return;
    t.preventDefault();
    d.style.left = a + t.clientX - c + 'px';
    d.style.top = b + t.clientY - e + 'px';
    d.style.right = 'auto';
  });
  r.addEventListener('pointerup', function(t){
    if (t.pointerId === di) di = null;
  });
  r.addEventListener('pointercancel', function(t){
    if (t.pointerId === di) di = null;
  });

  // ============ オーバーレイ ============
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;z-index:999998;background:transparent;pointer-events:none;touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';

  var ov2 = document.createElement('div');
  ov2.style.cssText = 'position:fixed;z-index:999997;background:transparent;pointer-events:none;touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';

  // ジェスチャー状態
  var mode = null;       // null / 'speed' / 'seek'
  var trackingId = null; // 現在追跡中のpointerId/identifier
  var sx = 0, sy = 0, sr = 1, st0 = 0;
  var mx = 0, mn = 0, uturn = false;
  var active = true;

  function resetGesture(){
    mode = null;
    trackingId = null;
    mx = 0;
    mn = 0;
    uturn = false;
    ov.style.pointerEvents = 'none';
    ov2.style.pointerEvents = 'none';
  }

  // タップ位置がvideo領域内かどうかを判定
  function inVideoArea(cx, cy){
    var cv = gv();
    if (!cv) return false;
    var rect = cv.getBoundingClientRect();
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  // タップ位置のエリア(上半分 or 中央40%)を判定
  function getArea(cx, cy){
    var cv = gv();
    if (!cv) return null;
    var rect = cv.getBoundingClientRect();
    var ry = (cy - rect.top) / rect.height;
    if (ry < 0.5) return 'speed';
    if (ry < 0.9) return 'seek';
    return null;
  }

  // ============ document レベル監視(キャプチャ段階) ============
  // pointerdown: 開始座標を記録
  document.addEventListener('pointerdown', function(t){
    if (!active) return;
    if (t.button && t.button !== 0) return;
    if (trackingId !== null) return;
    if (!inVideoArea(t.clientX, t.clientY)) return;
    trackingId = t.pointerId;
    sx = t.clientX;
    sy = t.clientY;
    var cv = gv();
    if (cv) {
      sr = cv.playbackRate;
      st0 = cv.currentTime;
    }
    mx = 0;
    mn = 0;
    uturn = false;
    mode = null;
  }, { capture: true, passive: true });

  // pointermove: 動きを監視、10px以上でスワイプ判定
  document.addEventListener('pointermove', function(t){
    if (!active) return;
    if (t.pointerId !== trackingId) return;
    if (mode) return; // モード確定済みはオーバーレイで処理
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;
    if (Math.abs(dx) < 10) return;
    if (Math.abs(dy) > Math.abs(dx)) return;

    var area = getArea(sx, sy);
    if (area === 'speed') {
      mode = 'speed';
      ov.style.pointerEvents = 'auto';
      try { ov.setPointerCapture(trackingId); } catch(er) {}
    } else if (area === 'seek') {
      mode = 'seek';
      ov2.style.pointerEvents = 'auto';
      try { ov2.setPointerCapture(trackingId); } catch(er) {}
    }
  }, { capture: true, passive: true });

  // pointerup: モード未確定ならただクリア
  document.addEventListener('pointerup', function(t){
    if (!active) return;
    if (t.pointerId === trackingId && !mode) {
      trackingId = null;
    }
  }, { capture: true, passive: true });

  document.addEventListener('pointercancel', function(t){
    if (!active) return;
    if (t.pointerId === trackingId && !mode) {
      trackingId = null;
    }
  }, { capture: true, passive: true });

  function gv(){
    var nv = document.querySelector('video');
    if (nv) {
      if (nv !== v || !nv._bmHook) {
        v = nv;
        try {
          nv.addEventListener('loadstart', function(){
            var curVid = new URLSearchParams(location.search).get('v');
            if (curVid !== lastVid) {
              lastVid = curVid;
              tgtRate = 1;
              l.textContent = '1x';
            }
          });
          nv._bmHook = 1;
        } catch(er) {}
      }
    }
    return v;
  }

  function pos(){
    var b = gv().getBoundingClientRect();
    ov.style.left = b.left + 'px';
    ov.style.top = b.top + 'px';
    ov.style.width = b.width + 'px';
    ov.style.height = (b.height * 0.5) + 'px';
    ov2.style.left = b.left + 'px';
    ov2.style.top = (b.top + b.height * 0.5) + 'px';
    ov2.style.width = b.width + 'px';
    ov2.style.height = (b.height * 0.4) + 'px';
  }
  pos();

  // ============ 上半分オーバーレイ(速度モード) ============
  ov.addEventListener('pointermove', function(t){
    if (mode !== 'speed') return;
    if (t.pointerId !== trackingId) return;
    t.preventDefault();
    var dx = t.clientX - sx;
    if (dx > mx) mx = dx;
    if (dx < mn) mn = dx;
    if (!uturn) {
      if (mx >= 50 && (mx - dx) >= 50) {
        uturn = true;
      } else if (mn <= -50 && (dx - mn) >= 50) {
        uturn = true;
      }
    }
    var cv = gv();
    if (uturn) {
      cv.playbackRate = 1;
      tgtRate = 1;
      l.textContent = '1x';
    } else {
      var nr = Math.max(0, Math.min(5, sr + dx / 200));
      nr = Math.round(nr * 10) / 10;
      cv.playbackRate = nr;
      tgtRate = nr;
      l.textContent = nr + 'x';
    }
  });

  ov.addEventListener('pointerup', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });
  ov.addEventListener('pointercancel', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });

  // ============ 中央オーバーレイ(シークモード) ============
  ov2.addEventListener('pointermove', function(t){
    if (mode !== 'seek') return;
    if (t.pointerId !== trackingId) return;
    t.preventDefault();
    var dx = t.clientX - sx;
    var cv = gv();
    var rect = cv.getBoundingClientRect();
    if (!cv.duration || !isFinite(cv.duration)) return;
    var nt = st0 + dx / rect.width * cv.duration / 8;
    nt = Math.max(0, Math.min(cv.duration, nt));
    cv.currentTime = nt;
  });

  ov2.addEventListener('pointerup', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });
  ov2.addEventListener('pointercancel', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });

  // ============ 組み立て・初期化 ============
  document.body.appendChild(ov);
  document.body.appendChild(ov2);
  d.appendChild(r);
  d.appendChild(tb);
  document.body.appendChild(d);

  gv();

  setTimeout(function(){
    var vr = gv().getBoundingClientRect();
    var dw = d.offsetWidth;
    d.style.left = (vr.left + vr.width / 2 - dw / 2) + 'px';
  }, 50);

  var t = setInterval(function(){
    pos();
    var cv = gv();
    if (cv) {
      var cur = parseInt(cv.currentTime) || 0;
      var dur = parseInt(cv.duration) || 0;
      var cm = parseInt(cur / 60);
      var cs = cur - cm * 60;
      var dm = parseInt(dur / 60);
      var ds = dur - dm * 60;
      var p1 = cs < 10 ? '0' + cs : cs;
      var p2 = ds < 10 ? '0' + ds : ds;
      tm.textContent = cm + ':' + p1 + '/' + dm + ':' + p2;
      if (tb.style.display !== 'none' && dur > 0) tb.value = cur / dur * 1000;

      var pr = Math.round(cv.playbackRate * 10) / 10;
      if (Math.abs(pr - tgtRate) > 0.05) {
        try { cv.playbackRate = tgtRate; } catch(er) {}
        pr = tgtRate;
      }
      var prT = pr + 'x';
      if (l.textContent !== prT) l.textContent = prT;
    }
  }, 1000);
})();
