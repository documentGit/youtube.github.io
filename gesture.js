(function(){
  var v = document.querySelector('video');
  if (!v) return;

  var tgtRate = v.playbackRate;
  var lastVid = new URLSearchParams(location.search).get('v');

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

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;z-index:999998;background:transparent;touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';

  var ov2 = document.createElement('div');
  ov2.style.cssText = 'position:fixed;z-index:999997;background:transparent;touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';

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

  // タップ転送ヘルパー
  // elementFromPointが返した要素がYouTubeの透明レシーバdiv(クラスなしDIV)の場合、
  // それにイベントを送ってもプレイボタンが反応しないので、プレイボタン本体を探して送る。
  function forwardTap(overlay, ex, ey){
    overlay.style.pointerEvents = 'none';
    var el = document.elementFromPoint(ex, ey);

    if (el && el.tagName === 'DIV' && !el.className) {
      var playBtn = document.querySelector('.ytp-play-button');
      if (playBtn) el = playBtn;
    }

    if (el) {
      var opts = {
        bubbles: true,
        cancelable: true,
        clientX: ex,
        clientY: ey,
        pointerType: 'mouse',
        pointerId: 1,
        isPrimary: true
      };
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      } catch(er) {
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }
    }
    setTimeout(function(){ overlay.style.pointerEvents = 'auto'; }, 400);
  }

  // ============ 上半分オーバーレイ ============
  var sx, sy, sr, sw = false, passed = false, mx, mn, uturn = false, pi = null;

  ov.addEventListener('pointerdown', function(t){
    if (t.button && t.button !== 0) return;
    if (pi !== null) return;
    pi = t.pointerId;
    var cv = gv();
    sx = t.clientX;
    sy = t.clientY;
    sr = cv.playbackRate;
    sw = false;
    passed = false;
    mx = 0;
    mn = 0;
    uturn = false;
  });

  ov.addEventListener('pointermove', function(t){
    if (t.pointerId !== pi) return;
    if (passed) return;
    var dx = t.clientX - sx;
    var dy = t.clientY - sy;
    if (!sw) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        sw = true;
      } else {
        return;
      }
    }
    t.preventDefault();
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

  ov.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  ov.addEventListener('selectstart', function(e){ e.preventDefault(); });

  ov.addEventListener('pointerup', function(t){
    if (t.pointerId !== pi) return;
    pi = null;
    if (sw) return;
    passed = true;
    forwardTap(ov, t.clientX, t.clientY);
  });

  ov.addEventListener('pointercancel', function(t){
    if (t.pointerId === pi) pi = null;
  });

  // ============ 中央オーバーレイ ============
  var sx2, st2, sw2 = false, passed2 = false, pi2 = null;

  ov2.addEventListener('pointerdown', function(t){
    if (t.button && t.button !== 0) return;
    if (pi2 !== null) return;
    pi2 = t.pointerId;
    var cv = gv();
    sx2 = t.clientX;
    st2 = cv.currentTime;
    sw2 = false;
    passed2 = false;
  });

  ov2.addEventListener('pointermove', function(t){
    if (t.pointerId !== pi2) return;
    if (passed2) return;
    var dx = t.clientX - sx2;
    if (!sw2) {
      if (Math.abs(dx) < 10) return;
      sw2 = true;
    }
    t.preventDefault();
    var cv = gv();
    var rect = cv.getBoundingClientRect();
    if (!cv.duration || !isFinite(cv.duration)) return;
    var nt = st2 + dx / rect.width * cv.duration / 8;
    nt = Math.max(0, Math.min(cv.duration, nt));
    cv.currentTime = nt;
  });

  ov2.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  ov2.addEventListener('selectstart', function(e){ e.preventDefault(); });

  ov2.addEventListener('pointerup', function(t){
    if (t.pointerId !== pi2) return;
    pi2 = null;
    if (sw2) return;
    passed2 = true;
    forwardTap(ov2, t.clientX, t.clientY);
  });

  ov2.addEventListener('pointercancel', function(t){
    if (t.pointerId === pi2) pi2 = null;
  });

  document.body.appendChild(ov);
  document.body.appendChild(ov2);
  d.appendChild(r);
  d.appendChild(tb);
  document.body.appendChild(d);

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
