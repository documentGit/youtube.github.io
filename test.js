(function(){
  // ============ 初期チェック ============
  var v = document.querySelector('video');
  if (!v) return;

  // ============ 状態管理 ============
  var tgtRate = v.playbackRate;
  var lastVid = new URLSearchParams(location.search).get('v');
  var active = true;

  var gestMode = null;
  var trackingId = null;
  var gestStartX = 0, gestStartY = 0;
  var gestStartRate = 1, gestStartTime = 0;
  var maxDx = 0, minDx = 0, uturnDone = false;

  var panOrigLeft = 0, panOrigTop = 0;
  var panStartX = 0, panStartY = 0;
  var panPointerId = null;

  // ============ 共通CSS片 ============
  var NO_SELECT = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;';
  var OV_STYLE = 'position:fixed;background:transparent;pointer-events:none;touch-action:pan-y;' + NO_SELECT;

  // ============ video要素取得(動画切替検出付き) ============
  function gv(){
    var nv = document.querySelector('video');
    if (nv && (nv !== v || !nv._bmHook)) {
      v = nv;
      try {
        nv.addEventListener('loadstart', function(){
          var curVid = new URLSearchParams(location.search).get('v');
          if (curVid !== lastVid) {
            lastVid = curVid;
            tgtRate = 1;
            speedLabel.textContent = '1x';
          }
        });
        nv.addEventListener('durationchange', function(){ updateUI(); });
        nv.addEventListener('loadedmetadata', function(){ updateUI(); });
        nv._bmHook = 1;
      } catch(er) {}
    }
    return v;
  }

  // ============ ヘルパー関数 ============
  function inVideoArea(cx, cy){
    var cv = gv();
    if (!cv) return false;
    var rect = cv.getBoundingClientRect();
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  function getArea(cx, cy){
    var cv = gv();
    if (!cv) return null;
    var rect = cv.getBoundingClientRect();
    var ry = (cy - rect.top) / rect.height;
    if (ry < 0.5) return 'speed';
    if (ry < 0.9) return 'seek';
    return null;
  }

  function resetGesture(){
    gestMode = null;
    trackingId = null;
    maxDx = 0;
    minDx = 0;
    uturnDone = false;
    overlayTop.style.pointerEvents = 'none';
    overlayMid.style.pointerEvents = 'none';
    divider.style.display = 'none';  // 横線を非表示
  }

  function formatTime(sec){
    var m = parseInt(sec / 60) || 0;
    var s = (parseInt(sec) || 0) - m * 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function updateUI(){
    var cv = gv();
    if (!cv) return;

    var dur = parseInt(cv.duration) || 0;
    timeLabel.textContent = formatTime(cv.currentTime) + '/' + formatTime(cv.duration);

    if (seekBar.style.display !== 'none' && dur > 0) {
      seekBar.value = cv.currentTime / dur * 1000;
    }

    var pr = Math.round(cv.playbackRate * 10) / 10;
    if (Math.abs(pr - tgtRate) > 0.05) {
      try { cv.playbackRate = tgtRate; } catch(er) {}
      pr = tgtRate;
    }
    var prText = pr + 'x';
    if (speedLabel.textContent !== prText) speedLabel.textContent = prText;
  }

  // ============ コントロールパネル作成 ============
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;left:0;z-index:999999;background:#222;padding:3px 6px;border-radius:8px;color:#fff;';

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;width:300px';

  var speedLabel = document.createElement('div');
  speedLabel.textContent = v.playbackRate + 'x';
  speedLabel.style.cssText = 'cursor:pointer;flex:1;text-align:center;padding:2px 0;font-size:12px';
  speedLabel.addEventListener('click', function(){
    var cv = gv();
    if (cv) cv.playbackRate = 1;
    tgtRate = 1;
    speedLabel.textContent = '1x';
  });

  var timeLabel = document.createElement('div');
  timeLabel.style.cssText = 'flex:2;text-align:center;padding:2px 0;font-size:11px;cursor:pointer';
  timeLabel.textContent = '0:00/0:00';

  var pipBtn = document.createElement('button');
  pipBtn.textContent = 'PiP';
  pipBtn.style.cssText = 'flex:1;margin:0 4px;padding:2px 0';
  pipBtn.addEventListener('click', function(){
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      var cv = gv();
      if (cv) cv.requestPictureInPicture();
    }
  });

  var helpBtn = document.createElement('button');
  helpBtn.textContent = '?';
  helpBtn.style.cssText = 'flex:1;margin-right:4px;padding:2px 0';
  helpBtn.addEventListener('click', function(){
    alert('上50% スワイプ：速度変更\n上50% 大きく振り戻し：1xに戻す\n中40% スライド：小刻みシーク\nタップ・ダブルタップ・長押し：YouTubeネイティブ\n時間タップ：シークバー表示・非表示');
  });

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'flex:1;padding:2px 0';
  closeBtn.addEventListener('click', function(){
    clearInterval(uiTimer);
    window.removeEventListener('resize', positionOverlays);
    overlayTop.remove();
    overlayMid.remove();
    divider.remove();
    panel.remove();
    active = false;
  });

  row.appendChild(speedLabel);
  row.appendChild(timeLabel);
  row.appendChild(pipBtn);
  row.appendChild(helpBtn);
  row.appendChild(closeBtn);

  var seekBar = document.createElement('input');
  seekBar.type = 'range';
  seekBar.min = 0;
  seekBar.max = 1000;
  seekBar.step = 1;
  seekBar.value = 0;
  seekBar.style.cssText = 'width:300px;display:block;margin-top:4px';
  seekBar.addEventListener('input', function(){
    var cv = gv();
    if (cv && cv.duration && isFinite(cv.duration)) {
      cv.currentTime = cv.duration * seekBar.value / 1000;
    }
  });
  timeLabel.addEventListener('click', function(){
    seekBar.style.display = seekBar.style.display === 'none' ? 'block' : 'none';
  });

  row.addEventListener('pointerdown', function(t){
    if (t.button && t.button !== 0) return;
    panOrigLeft = panel.offsetLeft;
    panOrigTop = panel.offsetTop;
    panStartX = t.clientX;
    panStartY = t.clientY;
    panPointerId = t.pointerId;
  });
  row.addEventListener('pointermove', function(t){
    if (t.pointerId !== panPointerId) return;
    t.preventDefault();
    panel.style.left = panOrigLeft + t.clientX - panStartX + 'px';
    panel.style.top = panOrigTop + t.clientY - panStartY + 'px';
    panel.style.right = 'auto';
  });
  row.addEventListener('pointerup', function(t){
    if (t.pointerId === panPointerId) panPointerId = null;
  });
  row.addEventListener('pointercancel', function(t){
    if (t.pointerId === panPointerId) panPointerId = null;
  });

  // ============ オーバーレイ作成 ============
  var overlayTop = document.createElement('div');
  overlayTop.style.cssText = OV_STYLE + 'z-index:999998;';

  var overlayMid = document.createElement('div');
  overlayMid.style.cssText = OV_STYLE + 'z-index:999997;';

  // ジェスチャー中のエリア境界線
  // 上半分(speed)と中央(seek)の境目を視覚化。
  // 初期は非表示で、ジェスチャー確定時に表示、reset時に非表示。
  var divider = document.createElement('div');
  divider.style.cssText = 'position:fixed;background:rgba(255,255,255,0.7);height:2px;pointer-events:none;z-index:999998;display:none;box-shadow:0 0 4px rgba(0,0,0,0.5);';

  function positionOverlays(){
    var rect = gv().getBoundingClientRect();
    overlayTop.style.left = rect.left + 'px';
    overlayTop.style.top = rect.top + 'px';
    overlayTop.style.width = rect.width + 'px';
    overlayTop.style.height = (rect.height * 0.5) + 'px';
    overlayMid.style.left = rect.left + 'px';
    overlayMid.style.top = (rect.top + rect.height * 0.5) + 'px';
    overlayMid.style.width = rect.width + 'px';
    overlayMid.style.height = (rect.height * 0.4) + 'px';
    // 境界線も追従
    divider.style.left = rect.left + 'px';
    divider.style.top = (rect.top + rect.height * 0.5 - 1) + 'px';
    divider.style.width = rect.width + 'px';
  }

  // ============ documentレベル監視(スワイプ検知用) ============
  var docOpts = { capture: true, passive: true };

  document.addEventListener('pointerdown', function(t){
    if (!active) return;
    if (t.button && t.button !== 0) return;
    if (trackingId !== null) return;
    if (!inVideoArea(t.clientX, t.clientY)) return;
    trackingId = t.pointerId;
    gestStartX = t.clientX;
    gestStartY = t.clientY;
    var cv = gv();
    if (cv) {
      gestStartRate = cv.playbackRate;
      gestStartTime = cv.currentTime;
    }
    maxDx = 0;
    minDx = 0;
    uturnDone = false;
    gestMode = null;
  }, docOpts);

  document.addEventListener('pointermove', function(t){
    if (!active) return;
    if (t.pointerId !== trackingId) return;
    if (gestMode) return;
    var dx = t.clientX - gestStartX;
    var dy = t.clientY - gestStartY;
    if (Math.abs(dx) < 10) return;
    if (Math.abs(dy) > Math.abs(dx)) return;

    var area = getArea(gestStartX, gestStartY);
    if (area === 'speed') {
      gestMode = 'speed';
      overlayTop.style.pointerEvents = 'auto';
      divider.style.display = 'block';  // 境界線を表示
      try { overlayTop.setPointerCapture(trackingId); } catch(er) {}
    } else if (area === 'seek') {
      gestMode = 'seek';
      overlayMid.style.pointerEvents = 'auto';
      divider.style.display = 'block';  // 境界線を表示
      try { overlayMid.setPointerCapture(trackingId); } catch(er) {}
    }
  }, docOpts);

  document.addEventListener('pointerup', function(t){
    if (!active) return;
    if (t.pointerId === trackingId && !gestMode) trackingId = null;
  }, docOpts);

  document.addEventListener('pointercancel', function(t){
    if (!active) return;
    if (t.pointerId === trackingId && !gestMode) trackingId = null;
  }, docOpts);

  // ============ 上半分オーバーレイ(speedモード) ============
  overlayTop.addEventListener('pointermove', function(t){
    if (gestMode !== 'speed' || t.pointerId !== trackingId) return;
    t.preventDefault();
    var dx = t.clientX - gestStartX;
    if (dx > maxDx) maxDx = dx;
    if (dx < minDx) minDx = dx;
    if (!uturnDone) {
      if (maxDx >= 50 && (maxDx - dx) >= 50) uturnDone = true;
      else if (minDx <= -50 && (dx - minDx) >= 50) uturnDone = true;
    }
    var cv = gv();
    if (uturnDone) {
      cv.playbackRate = 1;
      tgtRate = 1;
      speedLabel.textContent = '1x';
    } else {
      var nr = Math.max(0, Math.min(5, gestStartRate + dx / 200));
      nr = Math.round(nr * 10) / 10;
      cv.playbackRate = nr;
      tgtRate = nr;
      speedLabel.textContent = nr + 'x';
    }
  });

  overlayTop.addEventListener('pointerup', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });
  overlayTop.addEventListener('pointercancel', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });

  // ============ 中央オーバーレイ(seekモード) ============
  overlayMid.addEventListener('pointermove', function(t){
    if (gestMode !== 'seek' || t.pointerId !== trackingId) return;
    t.preventDefault();
    var cv = gv();
    if (!cv.duration || !isFinite(cv.duration)) return;
    var dx = t.clientX - gestStartX;
    var rect = cv.getBoundingClientRect();
    var nt = gestStartTime + dx / rect.width * cv.duration / 8;
    cv.currentTime = Math.max(0, Math.min(cv.duration, nt));
  });

  overlayMid.addEventListener('pointerup', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });
  overlayMid.addEventListener('pointercancel', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });

  // ============ 組み立て・初期化 ============
  document.body.appendChild(overlayTop);
  document.body.appendChild(overlayMid);
  document.body.appendChild(divider);
  panel.appendChild(row);
  panel.appendChild(seekBar);
  document.body.appendChild(panel);

  gv();
  positionOverlays();
  window.addEventListener('resize', positionOverlays);

  setTimeout(function(){
    var rect = gv().getBoundingClientRect();
    panel.style.left = (rect.left + rect.width / 2 - panel.offsetWidth / 2) + 'px';
  }, 50);

  updateUI();
  var uiTimer = setInterval(updateUI, 500);
})();
