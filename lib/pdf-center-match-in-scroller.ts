/**
 * Center a DOM node inside a scroll container's viewport (vertical + horizontal).
 * Used for PDF find so zoomed pages scroll to the actual highlight, not just the page top.
 */

function unionClientRect(el: Element): DOMRect | null {
  const rects = el.getClientRects();
  if (rects.length === 0) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return null;
    return r;
  }
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

export function centerElementInScroller(scroller: HTMLElement, target: Element) {
  const scRect = scroller.getBoundingClientRect();
  const elRect = unionClientRect(target);
  if (!elRect) return;

  const elCenterY = elRect.top + elRect.height / 2;
  const vpCenterY = scRect.top + scRect.height / 2;
  const deltaY = elCenterY - vpCenterY;
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  scroller.scrollTop = Math.min(maxTop, Math.max(0, scroller.scrollTop + deltaY));

  const elCenterX = elRect.left + elRect.width / 2;
  const vpCenterX = scRect.left + scRect.width / 2;
  const deltaX = elCenterX - vpCenterX;
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  scroller.scrollLeft = Math.min(maxLeft, Math.max(0, scroller.scrollLeft + deltaX));
}
