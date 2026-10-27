// Taps on the graph, detected here rather than by force-graph, which missed about one in two right after the view
// moved: it finds the tapped node in a picture of the graph repainted at most every 0.8 s (stale spots: the wrong
// node, or empty space, which closes the card), and it drops any tap during which the view moved even a pixel
// (a wobbling finger, a trackpad click, the camera still gliding after a selection).

// How far, in screen pixels, a finger can drift between press and release and still count as a tap, not a pan.
const TAP_SLOP_PX = 8;

export function isTap(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX;
}

// Which node a tap landed on, from where the nodes are at that moment.
// A node's position (unset until the layout places it), hit radius and drawing layer (higher is drawn on top).
export type Target = { id: string; x?: number; y?: number; r: number; layer: number };

export function nodeAt<T extends Target>(nodes: T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    const dist = Math.hypot(n.x - x, n.y - y);
    if (dist > n.r) continue;
    if (!best || n.layer > best.layer || (n.layer === best.layer && dist < bestDist)) {
      best = n;
      bestDist = dist;
    }
  }
  return best;
}
