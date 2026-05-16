(function () {
  'use strict';

  var map = {};

  function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.videoId && o.publishedTimeText) {
      var t = o.publishedTimeText.simpleText ||
              (o.publishedTimeText.runs && o.publishedTimeText.runs[0] && o.publishedTimeText.runs[0].text);
      if (t && !map[o.videoId]) map[o.videoId] = t;
    }
    if (Array.isArray(o)) {
      o.forEach(walk);
    } else {
      for (var k in o) {
        try { walk(o[k]); } catch (e) {}
      }
    }
  }

  if (window.ytInitialData) walk(window.ytInitialData);
  if (window.ytInitialPlayerResponse) walk(window.ytInitialPlayerResponse);

  var rxJ = /(\d+)\s*(秒|分|時間|日|週間|か月|ヶ月|年)前/;
  var rxE = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i;

  function labelToAge(s) {
    if (!s) return null;
    var m = s.match(rxJ) || s.match(rxE);
    return m ? m[0] : null;
  }

  document.querySelectorAll('a[href*="/watch?v="]').forEach(function (a) {
    var m = a.href.match(/[?&]v=([^&]+)/);
    if (!m) return;

    var c = a.closest(
      'ytm-compact-video-renderer,' +
      'ytm-video-with-context-renderer,' +
      'ytm-rich-item-renderer,' +
      'ytm-compact-autoplay-renderer,' +
      'li,div'
    );
    if (!c || c.querySelector('.bm-age')) return;

    var t = map[m[1]];
    if (!t) {
      t = labelToAge(a.getAttribute('aria-label')) ||
          labelToAge(c.getAttribute('aria-label')) ||
          labelToAge(c.textContent);
    }
    if (!t) return;

    var span = document.createElement('div');
    span.className = 'bm-age';
    span.textContent = t;
    span.style.cssText = 'color:#aaa;font-size:12px;margin:2px 0';

    var meta = c.querySelector('[class*="metadata"],[class*="byline"]') || a.parentNode;
    meta.appendChild(span);
  });
})();
