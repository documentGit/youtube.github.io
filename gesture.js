(function(){
  // ============================================================
  // 初期チェック
  // ============================================================
  var v = document.querySelector('video');
  if (!v) return;

  // ============================================================
  // 状態管理
  // ============================================================

  // 再生速度の目標値。ユーザーが速度を変更したらここも更新。
  // タイマーで監視し、YouTubeが勝手に1xに戻したら戻す。
  var tgtRate = v.playbackRate;
  var lastVid = new URLSearchParams(location.search).get('v');
  var active = true;

  // ジェスチャー状態
  var gestMode = null;       // null / 'speed' / 'seek'
  var trackingId = null;     // 追跡中のpointerId
  var gestStartX = 0, gestStartY = 0;
  var gestStartRate = 1, gestStartTime = 0;
  var maxDx = 0, minDx = 0, uturnDone = false;

  // ガイド矢印アニメーション
  var slideDir = null;       // null / 'left' / 'right'
  var arrowToggle = false;   // false: 短い矢印 / true: 二重矢印
  var arrowTimer = null;

  // パネルドラッグ状態
  var panOrigLeft = 0, panOrigTop = 0;
  var panStartX = 0, panStartY = 0;
  var panPointerId = null;

  // ============================================================
  // 共通CSS定数
  // ============================================================
  var NO_SELECT = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;';
  var OV_STYLE = 'position:fixed;background:transparent;pointer-events:none;touch-action:pan-y;' + NO_SELECT;
  var GUIDE_STYLE = 'position:fixed;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;padding:2px 8px;border-radius:4px;pointer-events:none;z-index:999998;display:none;white-space:nowrap;';
  var ARROW_STYLE = 'display:inline-block;width:22px;text-align:center;';

  // ============================================================
  // ヘルパー関数(純粋関数・状態を持たない)
  // ============================================================

  function formatTime(sec){
    var m = parseInt(sec / 60) || 0;
    var s = (parseInt(sec) || 0) - m * 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function inVideoArea(cx, cy){
    var cv = getVideo();
    if (!cv) return false;
    var rect = cv.getBoundingClientRect();
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  }

  // 縦位置からジェスチャーエリアを判定
  // 上半分(0〜50%) → speed、中央40%(50〜90%) → seek、下10% → null
  function getArea(cx, cy){
    var cv = getVideo();
    if (!cv) return null;
    var rect = cv.getBoundingClientRect();
    var ry = (cy - rect.top) / rect.height;
    if (ry < 0.5) return 'speed';
    if (ry < 0.9) return 'seek';
    return null;
  }

  // ============================================================
  // video要素取得(動画切替検出付き)
  // ============================================================
  // 新しい動画に切り替わった瞬間(loadstart)に、URLのv=パラメータが
  // 実際に変わっていれば目標速度を1xにリセットする。タブ復帰時の
  // loadstartではIDが変わらないので速度は維持される。
  function getVideo(){
    var nv = document.querySelector('video');
    if (nv && (nv !== v || !nv._bmHook)) {
      v = nv;
      try {
        nv.addEventListener('loadstart', function(){
          var curVid = new URLSearchParams(location.search).get('v');
          if (curVid !== lastVid) {
            lastVid = curVid;
            tgtRate = 1;
            speedDisp.textContent = '1x';
          }
        });
        // メタデータ確定の瞬間にUIを更新(初期表示の遅延解消)
        nv.addEventListener('durationchange', updateUI);
        nv.addEventListener('loadedmetadata', updateUI);
        nv._bmHook = 1;
      } catch(er) {}
    }
    return v;
  }

  // ============================================================
  // DOM要素: コントロールパネル
  // ============================================================
  // パネル: 速度表示、時間表示、PiP、ヘルプ、閉じるボタン、シークバー
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;left:0;z-index:999999;background:#222;padding:3px 6px;border-radius:8px;color:#fff;';

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;width:300px';

  // 速度表示(タップで1xに戻す)
  var speedDisp = document.createElement('div');
  speedDisp.textContent = v.playbackRate + 'x';
  speedDisp.style.cssText = 'cursor:pointer;flex:1;text-align:center;padding:2px 0;font-size:12px';

  // 時間表示(タップでシークバー表示切替)
  var timeDisp = document.createElement('div');
  timeDisp.style.cssText = 'flex:2;text-align:center;padding:2px 0;font-size:11px;cursor:pointer';
  timeDisp.textContent = '0:00/0:00';

  var pipBtn = document.createElement('button');
  pipBtn.textContent = 'PiP';
  pipBtn.style.cssText = 'flex:1;margin:0 4px;padding:2px 0';

  var helpBtn = document.createElement('button');
  helpBtn.textContent = '?';
  helpBtn.style.cssText = 'flex:1;margin-right:4px;padding:2px 0';

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'flex:1;padding:2px 0';

  row.appendChild(speedDisp);
  row.appendChild(timeDisp);
  row.appendChild(pipBtn);
  row.appendChild(helpBtn);
  row.appendChild(closeBtn);

  // シークバー
  // デフォルトで表示。非表示にしたい場合は 'display:block' → 'display:none' に。
  var seekBar = document.createElement('input');
  seekBar.type = 'range';
  seekBar.min = 0;
  seekBar.max = 1000;
  seekBar.step = 1;
  seekBar.value = 0;
  seekBar.style.cssText = 'width:300px;display:block;margin-top:4px';

  panel.appendChild(row);
  panel.appendChild(seekBar);

  // ============================================================
  // DOM要素: オーバーレイとガイド
  // ============================================================
  // オーバーレイは初期 pointer-events: none で完全素通し。
  // スワイプ確定時に該当オーバーレイのみ auto に切り替えて乗っ取る。
  var overlayTop = document.createElement('div');
  overlayTop.style.cssText = OV_STYLE + 'z-index:999998;';

  var overlayMid = document.createElement('div');
  overlayMid.style.cssText = OV_STYLE + 'z-index:999997;';

  // ガイド境界線(中央50%幅の白い水平線)
  var divider = document.createElement('div');
  divider.style.cssText = 'position:fixed;background:rgba(255,255,255,0.7);height:2px;pointer-events:none;z-index:999998;display:none;box-shadow:0 0 4px rgba(0,0,0,0.5);';

  // ガイドラベル(矢印固定幅構造)
  // 構造: [左矢印span][本文span][右矢印span]
  // 矢印spanは固定幅で確保、空でも幅は維持され、本文位置は不動。
  function buildGuide(text){
    var el = document.createElement('div');
    el.style.cssText = GUIDE_STYLE;
    var left = document.createElement('span');
    left.style.cssText = ARROW_STYLE;
    var body = document.createElement('span');
    body.textContent = text;
    var right = document.createElement('span');
    right.style.cssText = ARROW_STYLE;
    el.appendChild(left);
    el.appendChild(body);
    el.appendChild(right);
    return { el: el, left: left, right: right };
  }

  var gSpd = buildGuide('速度変更');
  var gSk = buildGuide('再生位置');

  // ============================================================
  // UI制御関数: ガイド表示・矢印アニメ
  // ============================================================

  // 指定ガイドの矢印を方向とトグル状態に応じて設定。
  // アクティブモードでなければ両矢印とも空。
  function setArrows(guide, isActive){
    if (!isActive || !slideDir) {
      guide.left.textContent = '';
      guide.right.textContent = '';
      return;
    }
    if (slideDir === 'right') {
      guide.left.textContent = '';
      guide.right.textContent = arrowToggle ? '>>' : '>';
    } else {
      guide.left.textContent = arrowToggle ? '<<' : '<';
      guide.right.textContent = '';
    }
  }

  function updateGuideArrows(){
    setArrows(gSpd, gestMode === 'speed');
    setArrows(gSk, gestMode === 'seek');
  }

  function startArrowAnim(){
    if (arrowTimer) return;
    arrowTimer = setInterval(function(){
      arrowToggle = !arrowToggle;
      updateGuideArrows();
    }, 500);
  }

  function stopArrowAnim(){
    if (arrowTimer) {
      clearInterval(arrowTimer);
      arrowTimer = null;
    }
    slideDir = null;
    arrowToggle = false;
    updateGuideArrows();
  }

  // 進行方向が変わったらアニメ更新
  function updateSlideDir(dx){
    var newDir = null;
    if (dx > 5) newDir = 'right';
    else if (dx < -5) newDir = 'left';
    if (newDir && newDir !== slideDir) {
      slideDir = newDir;
      arrowToggle = false;
      updateGuideArrows();
      startArrowAnim();
    }
  }

  function showGuide(){
    divider.style.display = 'block';
    gSpd.el.style.display = 'block';
    gSk.el.style.display = 'block';
    updateGuideArrows();
    // ラベル幅は固定幅spanで安定するが、初回表示時に中央寄せを確定
    var rect = getVideo().getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    gSpd.el.style.left = (centerX - gSpd.el.offsetWidth / 2) + 'px';
    gSk.el.style.left = (centerX - gSk.el.offsetWidth / 2) + 'px';
  }

  function hideGuide(){
    divider.style.display = 'none';
    gSpd.el.style.display = 'none';
    gSk.el.style.display = 'none';
  }

  function resetGesture(){
    gestMode = null;
    trackingId = null;
    maxDx = 0;
    minDx = 0;
    uturnDone = false;
    overlayTop.style.pointerEvents = 'none';
    overlayMid.style.pointerEvents = 'none';
    stopArrowAnim();
    hideGuide();
  }

  // ============================================================
  // UI制御関数: オーバーレイ位置・パネル定期更新
  // ============================================================

  // 動画サイズに合わせてオーバーレイ・境界線・ガイドの位置を更新
  function positionOverlays(){
    var rect = getVideo().getBoundingClientRect();

    overlayTop.style.left = rect.left + 'px';
    overlayTop.style.top = rect.top + 'px';
    overlayTop.style.width = rect.width + 'px';
    overlayTop.style.height = (rect.height * 0.5) + 'px';

    overlayMid.style.left = rect.left + 'px';
    overlayMid.style.top = (rect.top + rect.height * 0.5) + 'px';
    overlayMid.style.width = rect.width + 'px';
    overlayMid.style.height = (rect.height * 0.4) + 'px';

    var midY = rect.top + rect.height * 0.5;
    var centerX = rect.left + rect.width / 2;

    // 境界線: 動画幅の中央50%のみ表示
    var dividerWidth = rect.width * 0.5;
    divider.style.left = (centerX - dividerWidth / 2) + 'px';
    divider.style.top = (midY - 1) + 'px';
    divider.style.width = dividerWidth + 'px';

    // ガイドラベル
    gSpd.el.style.left = centerX + 'px';
    gSpd.el.style.top = (midY - 28) + 'px';
    gSk.el.style.left = centerX + 'px';
    gSk.el.style.top = (midY + 6) + 'px';
  }

  // 1回分のUI更新: 時刻、シークバー、速度復帰チェック
  function updateUI(){
    var cv = getVideo();
    if (!cv) return;

    var dur = parseInt(cv.duration) || 0;
    timeDisp.textContent = formatTime(cv.currentTime) + '/' + formatTime(cv.duration);

    if (seekBar.style.display !== 'none' && dur > 0) {
      seekBar.value = cv.currentTime / dur * 1000;
    }

    var pr = Math.round(cv.playbackRate * 10) / 10;
    if (Math.abs(pr - tgtRate) > 0.05) {
      try { cv.playbackRate = tgtRate; } catch(er) {}
      pr = tgtRate;
    }
    var prText = pr + 'x';
    if (speedDisp.textContent !== prText) speedDisp.textContent = prText;
  }

  // ============================================================
  // パネル: ボタンとドラッグのイベント
  // ============================================================

  speedDisp.addEventListener('click', function(){
    var cv = getVideo();
    if (cv) cv.playbackRate = 1;
    tgtRate = 1;
    speedDisp.textContent = '1x';
  });

  pipBtn.addEventListener('click', function(){
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      var cv = getVideo();
      if (cv) cv.requestPictureInPicture();
    }
  });

  helpBtn.addEventListener('click', function(){
    alert('上50% スワイプ：速度変更\n上50% 大きく振り戻し：1xに戻す\n中40% スライド：再生位置\n時間タップ：シークバー表示・非表示');
  });

  closeBtn.addEventListener('click', function(){
    clearInterval(uiTimer);
    stopArrowAnim();
    window.removeEventListener('resize', positionOverlays);
    overlayTop.remove();
    overlayMid.remove();
    divider.remove();
    gSpd.el.remove();
    gSk.el.remove();
    panel.remove();
    active = false;
  });

  seekBar.addEventListener('input', function(){
    var cv = getVideo();
    if (cv && cv.duration && isFinite(cv.duration)) {
      cv.currentTime = cv.duration * seekBar.value / 1000;
    }
  });

  timeDisp.addEventListener('click', function(){
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

  // ============================================================
  // documentレベル監視: スワイプ検知用
  // ============================================================
  // YouTubeプレイヤーUIに干渉しないよう、すべてキャプチャ段階・
  // passive: true で登録。観察のみで preventDefault は呼ばない。
  // スワイプ確定の瞬間にオーバーレイを auto に切り替えて乗っ取る。
  var docOpts = { capture: true, passive: true };

  document.addEventListener('pointerdown', function(t){
    if (!active) return;
    if (t.button && t.button !== 0) return;
    if (trackingId !== null) return;
    if (!inVideoArea(t.clientX, t.clientY)) return;
    trackingId = t.pointerId;
    gestStartX = t.clientX;
    gestStartY = t.clientY;
    var cv = getVideo();
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
      showGuide();
      try { overlayTop.setPointerCapture(trackingId); } catch(er) {}
    } else if (area === 'seek') {
      gestMode = 'seek';
      overlayMid.style.pointerEvents = 'auto';
      showGuide();
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

  // ============================================================
  // オーバーレイ: ジェスチャー実行(乗っ取りモード)
  // ============================================================

  // 上半分: 速度変更
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
    var cv = getVideo();
    if (uturnDone) {
      cv.playbackRate = 1;
      tgtRate = 1;
      speedDisp.textContent = '1x';
    } else {
      // 上限10倍。dx/120 で約1080px動かして0→10x(画面端〜端で十分届く感度)。
      // 感度を変えたい場合は分母120を調整(小さいほど敏感)。
      var nr = Math.max(0, Math.min(10, gestStartRate + dx / 120));
      nr = Math.round(nr * 10) / 10;
      cv.playbackRate = nr;
      tgtRate = nr;
      speedDisp.textContent = nr + 'x';
    }
    updateSlideDir(dx);
  });

  overlayTop.addEventListener('pointerup', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });
  overlayTop.addEventListener('pointercancel', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });

  // 中央: 再生位置
  overlayMid.addEventListener('pointermove', function(t){
    if (gestMode !== 'seek' || t.pointerId !== trackingId) return;
    t.preventDefault();
    var cv = getVideo();
    if (!cv.duration || !isFinite(cv.duration)) return;
    var dx = t.clientX - gestStartX;
    var rect = cv.getBoundingClientRect();
    // 画面幅いっぱい動かして動画長の1/8、つまり細かいシーク
    var nt = gestStartTime + dx / rect.width * cv.duration / 8;
    cv.currentTime = Math.max(0, Math.min(cv.duration, nt));
    updateSlideDir(dx);
  });

  overlayMid.addEventListener('pointerup', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });
  overlayMid.addEventListener('pointercancel', function(t){
    if (t.pointerId === trackingId) resetGesture();
  });

  // ============================================================
  // 初期化
  // ============================================================
  var uiTimer = null;

  function init(){
    document.body.appendChild(overlayTop);
    document.body.appendChild(overlayMid);
    document.body.appendChild(divider);
    document.body.appendChild(gSpd.el);
    document.body.appendChild(gSk.el);
    document.body.appendChild(panel);

    getVideo(); // loadstart/durationchangeリスナーを仕込む
    positionOverlays();
    window.addEventListener('resize', positionOverlays);

    // パネルを動画中央に配置
    setTimeout(function(){
      var rect = getVideo().getBoundingClientRect();
      panel.style.left = (rect.left + rect.width / 2 - panel.offsetWidth / 2) + 'px';
    }, 50);

    // 起動直後に1回更新して初期表示を確定、その後は500msごとに更新
    updateUI();
    uiTimer = setInterval(updateUI, 500);
  }

  init();
})();
