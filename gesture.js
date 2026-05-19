(function(){
  // ============ 初期チェック ============
  var v = document.querySelector('video');
  if (!v) return;

  // ============ 状態管理 ============
  var tgtRate = v.playbackRate;
  var lastVid = new URLSearchParams(location.search).get('v');
  var active = true;

  // ジェスチャー状態
  // gestMode: null(待機) / 'speed'(速度変更中) / 'seek'(シーク中)
  var gestMode = null;
  var trackingId = null;
  var gestStartX = 0, gestStartY = 0;
  var gestStartRate = 1, gestStartTime = 0;
  var maxDx = 0, minDx = 0, uturnDone = false;

  // パネルドラッグ状態
  var panOrigLeft = 0, panOrigTop = 0;
  var panStartX = 0, panStartY = 0;
  var panPointerId = null;

  // ============ 共通CSS片 ============
  var NO_SELECT = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;';
  var OV_STYLE = 'position:fixed;background:transparent;pointer-events:none;touch-action:pan-y;' + NO_SELECT;

  // ============ video要素取得(動画切替検出付き) ============
  // 新しい動画に切り替わった瞬間(loadstart)に、動画IDが変わっていれば
  // 目標速度を1xにリセットする。タブ復帰時のloadstartでは
  // 動画IDが変わらないので速度は維持される。
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

  // 縦位置から、どのジェスチャーエリアかを判定
  // 上半分(0〜50%) → speed、中央40%(50〜90%) → seek、下10% → null
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
  }

  function formatTime(sec){
    var m = parseInt(sec / 60) || 0;
    var s = (parseInt(sec) || 0) - m * 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  // ============ コントロールパネル作成 ============
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;left:0;z-index:999999;background:#222;padding:3px 6px;border-radius:8px;color:#fff;';

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;width:300px';

  // 速度ラベル(タップで1xに戻す)
  var speedLabel = document.createElement('div');
  speedLabel.textContent = v.playbackRate + 'x';
  speedLabel.style.cssText = 'cursor:pointer;flex:1;text-align:center;padding:2px 0;font-size:12px';
  speedLabel.addEventListener('click', function(){
    var cv = gv();
    if (cv) cv.playbackRate = 1;
    tgtRate = 1;
    speedLabel.textContent = '1x';
  });

  // 時間表示(タップでシークバー表示切替)
  var timeLabel = document.createElement('div');
  timeLabel.style.cssText = 'flex:2;text-align:center;padding:2px 0;font-size:11px;cursor:pointer';
  timeLabel.textContent = '0:00/0:00';

  // PiPボタン
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

  // ヘルプボタン
  var helpBtn = document.createElement('button');
  helpBtn.textContent = '?';
  helpBtn.style.cssText = 'flex:1;margin-right:4px;padding:2px 0';
  helpBtn.addEventListener('click', function(){
    alert('上50% スワイプ：速度変更\n上50% 大きく振り戻し：1xに戻す\n中40% スライド：小刻みシーク\nタップ・ダブルタップ・長押し：YouTubeネイティブ\n時間タップ：シークバー表示・非表示');
  });

  // 閉じるボタン
  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'flex:1;padding:2px 0';
  closeBtn.addEventListener('click', function(){
    clearInterval(uiTimer);
    window.removeEventListener('resize', positionOverlays);
    overlayTop.remove();
    overlayMid.remove();
    panel.remove();
    active = false;
  });

  row.appendChild(speedLabel);
  row.appendChild(timeLabel);
  row.appendChild(pipBtn);
  row.appendChild(helpBtn);
  row.appendChild(closeBtn);

  // シークバー
  // デフォルト表示。非表示にしたい場合は 'display:block' → 'display:none' に。
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

  // パネル本体のドラッグ移動
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
  // 初期状態は pointer-events: none で完全素通し。
  // タップ・ダブルタップ・長押しは全てYouTubeネイティブが処理する。
  // documentレベルのキャプチャ監視でスワイプを検知し、
  // 確定した瞬間に該当オーバーレイを auto に切り替えてイベントを乗っ取る。
  var overlayTop = document.createElement('div');
  overlayTop.style.cssText = OV_STYLE + 'z-index:999998;';

  var overlayMid = document.createElement('div');
  overlayMid.style.cssText = OV_STYLE + 'z-index:999997;';

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
  }

  // ============ documentレベル監視(スワイプ検知用) ============
  // YouTubeプレイヤーUIに干渉しないよう、全リスナーをキャプチャ段階・
  // passive: true で登録。観察のみで preventDefault は呼ばない。
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
    if (gestMode) return; // 確定後はオーバーレイ側で処理
    var dx = t.clientX - gestStartX;
    var dy = t.clientY - gestStartY;
    if (Math.abs(dx) < 10) return;
    if (Math.abs(dy) > Math.abs(dx)) return;

    var area = getArea(gestStartX, gestStartY);
    if (area === 'speed') {
      gestMode = 'speed';
      overlayTop.style.pointerEvents = 'auto';
      try { overlayTop.setPointerCapture(trackingId); } catch(er) {}
    } else if (area === 'seek') {
      gestMode = 'seek';
      overlayMid.style.pointerEvents = 'auto';
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

  // ============ 上半分オーバーレイ(speedモード時のみアクティブ) ============
  overlayTop.addEventListener('pointermove', function(t){
    if (gestMode !== 'speed' || t.pointerId !== trackingId) return;
    t.preventDefault();
    var dx = t.clientX - gestStartX;
    if (dx > maxDx) maxDx = dx;
    if (dx < minDx) minDx = dx;
    // U-turn判定: 50px以上振った後、逆方向に50px戻ったら1xリセット
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

  // ============ 中央オーバーレイ(seekモード時のみアクティブ) ============
  overlayMid.addEventListener('pointermove', function(t){
    if (gestMode !== 'seek' || t.pointerId !== trackingId) return;
    t.preventDefault();
    var cv = gv();
    if (!cv.duration || !isFinite(cv.duration)) return;
    var dx = t.clientX - gestStartX;
    var rect = cv.getBoundingClientRect();
    // 画面幅いっぱい動かして動画長の1/8、つまり細かいシーク
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
  panel.appendChild(row);
  panel.appendChild(seekBar);
  document.body.appendChild(panel);

  gv(); // 初回呼び出しでloadstartリスナー登録
  positionOverlays();
  window.addEventListener('resize', positionOverlays);

  // パネルを動画中央に配置
  setTimeout(function(){
    var rect = gv().getBoundingClientRect();
    panel.style.left = (rect.left + rect.width / 2 - panel.offsetWidth / 2) + 'px';
  }, 50);

  // ============ 1秒ごとのUI更新 ============
  // 時刻表示、シークバー位置、速度復帰チェック
  // (オーバーレイ位置の追従はresizeイベントで処理)
  var uiTimer = setInterval(function(){
    var cv = gv();
    if (!cv) return;

    // 時刻表示
    var dur = parseInt(cv.duration) || 0;
    timeLabel.textContent = formatTime(cv.currentTime) + '/' + formatTime(cv.duration);

    // シークバー位置
    if (seekBar.style.display !== 'none' && dur > 0) {
      seekBar.value = cv.currentTime / dur * 1000;
    }

    // 速度復帰: 目標速度と0.05以上ズレてたら戻す
    var pr = Math.round(cv.playbackRate * 10) / 10;
    if (Math.abs(pr - tgtRate) > 0.05) {
      try { cv.playbackRate = tgtRate; } catch(er) {}
      pr = tgtRate;
    }
    var prText = pr + 'x';
    if (speedLabel.textContent !== prText) speedLabel.textContent = prText;
  }, 1000);
})();
