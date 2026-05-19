ov.style.pointerEvents = 'none';
var el = document.elementFromPoint(ex, ey);
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
    // PointerEventが何らかの理由で作れない場合のフォールバック
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }
}
setTimeout(function(){ ov.style.pointerEvents = 'auto'; }, 400);
