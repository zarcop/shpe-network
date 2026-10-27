import ForceGraph from 'force-graph';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { colors, hubColors } from '@/ui/theme';

import type { GraphLink, GraphNode, HubNode } from './graph';
import { isTap, nodeAt } from './hit-test';
import { hubImageUrl } from './hub-images';

// force-graph adds layout coordinates to the node objects it is given.
type Drawn = GraphNode & { x?: number; y?: number };
type DrawnLink = { source: Drawn | string; target: Drawn | string };

const PERSON_RADIUS = 2.4;
const ME_RADIUS = 4.5;
const PERSON_COLOR = '#A3A9B1';
const LINK_COLOR = 'rgba(29, 34, 38, 0.07)';
const LINK_DIM_COLOR = 'rgba(29, 34, 38, 0.025)';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
// Public by design, like the Supabase publishable key. Unset: no logos, flags and major icons still show.
const LOGO_KEY = process.env.EXPO_PUBLIC_LOGO_DEV_KEY;
// Below this on-screen radius a logo is unreadable, so the hub stays a plain colored shape.
const MIN_IMAGE_RADIUS_PX = 7;

// Bigger hubs have more people; the square root keeps a 60-person college from swallowing the screen.
const hubRadius = (hub: HubNode) => 3.5 + Math.sqrt(hub.members) * 1.5;
const radius = (n: Drawn, meId: string) =>
  n.type === 'hub' ? hubRadius(n) : n.id === meId ? ME_RADIUS : PERSON_RADIUS;
// Hit targets stay finger-sized at any zoom.
const hitRadius = (n: Drawn, meId: string, scale: number) => Math.max(radius(n, meId), 10 / scale);

function hubPath(ctx: CanvasRenderingContext2D, hub: HubNode, x: number, y: number, r: number) {
  ctx.beginPath();
  if (hub.kind === 'school') {
    ctx.arc(x, y, r, 0, 2 * Math.PI);
  } else if (hub.kind === 'company') {
    const s = r * 0.9;
    ctx.roundRect(x - s, y - s, 2 * s, 2 * s, r * 0.3);
  } else if (hub.kind === 'major') {
    const s = r * 1.2;
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  } else {
    const s = r * 1.15;
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.95, y + s * 0.65);
    ctx.lineTo(x - s * 0.95, y + s * 0.65);
    ctx.closePath();
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, scale: number, weight: number) {
  ctx.font = `${weight} ${px / scale}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 / scale;
  ctx.strokeStyle = 'rgba(252, 252, 251, 0.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colors.text;
  ctx.fillText(text, x, y);
}

type Label = { text: string; x: number; y: number; px: number; weight: number; rank: number };

const endId = (end: Drawn | string) => (typeof end === 'string' ? end : end.id);

// The force-directed drawing (web only: force-graph draws on a DOM canvas). Tapping a node selects it; the
// selection and its neighbors stay bright and everything else fades. Labels appear as you zoom in and never
// overlap, so the overview stays calm.
export function GraphView({
  nodes,
  links,
  meId,
  selectedId,
  highlight,
  onSelect,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  meId: string;
  selectedId: string | null;
  highlight: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
}) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const graph = useRef<ForceGraph<Drawn, DrawnLink> | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Read by the draw functions on every frame, so changing them only needs a redraw, not a new layout.
  const view = useRef({ selectedId, highlight, hoverId: null as string | null, meId });
  view.current = { ...view.current, selectedId, highlight, meId };
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const element = container.current as unknown as HTMLElement;
    let fitted = false;
    const fg = new ForceGraph<Drawn, DrawnLink>(element)
      .backgroundColor('#FCFCFB')
      .nodeLabel(() => '')
      .linkWidth((l) => (isLit(l) ? 1.2 : 0.6))
      .linkColor((l) => {
        if (!view.current.highlight.size) return LINK_COLOR;
        if (!isLit(l)) return LINK_DIM_COLOR;
        const hub = [l.source, l.target].find((e): e is HubNode & Drawn => typeof e !== 'string' && e.type === 'hub');
        return hub ? `${hubColors[hub.kind]}99` : LINK_COLOR;
      })
      .nodePointerAreaPaint((n, color, ctx, scale) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, hitRadius(n, view.current.meId, scale), 0, 2 * Math.PI);
        ctx.fill();
      })
      .onNodeHover((n) => {
        element.style.cursor = n ? 'pointer' : 'grab';
        view.current.hoverId = n?.id ?? null;
        redraw();
      })
      .enableNodeDrag(false)
      .minZoom(0.3)
      .maxZoom(12)
      .d3VelocityDecay(0.35)
      .warmupTicks(60)
      .cooldownTicks(150)
      .onEngineStop(() => {
        if (!fitted) fg.zoomToFit(400, 48);
        fitted = true;
      });

    // Hubs push apart in proportion to their size; people barely repel, so they cluster around their hubs.
    fg.d3Force('charge')?.strength((n: Drawn) => (n.type === 'hub' ? -40 - n.members * 6 : -10));
    fg.d3Force('link')?.distance(26);

    // Taps are ours, not force-graph's onNodeClick (see hit-test.ts). A second finger means a pinch, not a tap.
    let pressed: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      pressed = ev.isPrimary ? { x: ev.clientX, y: ev.clientY } : null;
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.isPrimary && pressed && isTap(pressed, { x: ev.clientX, y: ev.clientY })) tap(ev);
      pressed = null;
    };
    const onCancel = () => {
      pressed = null;
    };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onCancel);

    function tap(ev: PointerEvent) {
      const box = element.getBoundingClientRect();
      const at = fg.screen2GraphCoords(ev.clientX - box.left, ev.clientY - box.top);
      const { meId: me } = view.current;
      const scale = fg.zoom();
      // Same stacking as the drawing: you on top, then hubs, then people.
      const targets = fg.graphData().nodes.map((n) => ({
        id: n.id, x: n.x, y: n.y, r: hitRadius(n, me, scale), layer: n.id === me ? 2 : n.type === 'hub' ? 1 : 0,
      }));
      select.current(nodeAt(targets, at.x, at.y)?.id ?? null);
    }

    // Lit while something is selected or searched for: both ends are in the highlight.
    function isLit(l: DrawnLink) {
      const { highlight: lit } = view.current;
      return lit.has(endId(l.source)) && lit.has(endId(l.target));
    }

    // Shapes are drawn per node; labels are only collected, then placed after every shape (below), so they sit on
    // top and can skip any spot another label already took.
    let labels: Label[] = [];
    let meNode: Drawn | null = null;

    // Each picture loads once; until it arrives (or if it never does) the hub keeps its shape.
    const images = new Map<string, HTMLImageElement | null>();
    function imageFor(hub: HubNode): HTMLImageElement | null {
      const url = hubImageUrl(hub, LOGO_KEY);
      if (!url) return null;
      if (!images.has(url)) {
        images.set(url, null);
        const img = new Image();
        img.onload = () => {
          images.set(url, img);
          redraw();
        };
        img.src = url;
      }
      return images.get(url)!;
    }

    function drawBadge(ctx: CanvasRenderingContext2D, hub: HubNode, img: HTMLImageElement, x: number, y: number,
                       r: number, scale: number, focused: boolean) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Flags fill the circle; logos and major icons get breathing room and keep their own proportions.
      const box = hub.kind === 'country' ? 2 * r : 1.3 * r;
      const fit = Math.min(box / img.naturalWidth, box / img.naturalHeight);
      const w = hub.kind === 'country' ? box : img.naturalWidth * fit;
      const h = hub.kind === 'country' ? box : img.naturalHeight * fit;
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      ctx.restore();
      // The ring keeps the kind's color, so you can still tell a college from a company at a glance.
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.lineWidth = (focused ? 2.5 : 2) / scale;
      ctx.strokeStyle = focused ? colors.text : hubColors[hub.kind];
      ctx.stroke();
    }

    function draw(n: Drawn, ctx: CanvasRenderingContext2D, scale: number) {
      const { selectedId: sel, highlight: lit, hoverId, meId: me } = view.current;
      const x = n.x!;
      const y = n.y!;
      const r = radius(n, me);
      const focused = n.id === sel || n.id === hoverId;
      const lighting = lit.size > 0;
      const dim = lighting && !lit.has(n.id);
      ctx.globalAlpha = dim ? 0.12 : 1;

      if (n.type === 'hub') {
        const img = r * scale >= MIN_IMAGE_RADIUS_PX ? imageFor(n) : null;
        if (img) {
          drawBadge(ctx, n, img, x, y, r, scale, focused);
        } else {
          hubPath(ctx, n, x, y, r);
          ctx.fillStyle = hubColors[n.kind];
          ctx.fill();
          ctx.lineWidth = (focused ? 2.5 : 1.5) / scale;
          ctx.strokeStyle = focused ? colors.text : '#FFFFFF';
          ctx.stroke();
        }
        // Hubs ask for a label once they are big enough on screen; while something is selected or searched for, only lit ones do.
        if (focused || (lighting ? !dim : r * scale > 11)) {
          labels.push({ text: n.name, x, y: y + r * 1.25 + 2 / scale, px: 11.5, weight: 600,
                        rank: focused ? 1e6 : n.members });
        }
      } else if (n.id === me) {
        meNode = n; // drawn last, on top of everything
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = focused || (lighting && !dim) ? colors.muted : PERSON_COLOR;
        ctx.fill();
        if (focused) {
          ctx.lineWidth = 2 / scale;
          ctx.strokeStyle = colors.text;
          ctx.stroke();
        }
        // While something is lit, only lit people get names: zoomed in, faded names are just clutter.
        if (focused || (lighting ? !dim && scale > 1.8 : scale > 4)) {
          labels.push({ text: n.name, x, y: y + r + 2.5 / scale, px: 11, weight: 500, rank: focused ? 1e6 : -1 });
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawOnTop(ctx: CanvasRenderingContext2D, scale: number) {
      const me = meNode;
      if (me) {
        const { highlight: lit } = view.current;
        const dim = lit.size > 0 && !lit.has(me.id);
        ctx.globalAlpha = dim ? 0.35 : 1;
        ctx.beginPath();
        ctx.arc(me.x!, me.y!, ME_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = colors.navy;
        ctx.fill();
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeStyle = colors.orange;
        ctx.stroke();
        ctx.globalAlpha = 1;
        labels.push({ text: 'You', x: me.x!, y: me.y! + ME_RADIUS + 3 / scale, px: 12, weight: 700, rank: 2e6 });
      }

      // Most important first; a label that would overlap one already placed is skipped this frame.
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const pad = 3 / scale;
      for (const l of labels.sort((a, b) => b.rank - a.rank)) {
        ctx.font = `${l.weight} ${l.px / scale}px ${FONT}`;
        const half = ctx.measureText(l.text).width / 2;
        const box = { x0: l.x - half - pad, y0: l.y - pad, x1: l.x + half + pad, y1: l.y + l.px / scale + pad };
        if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
        placed.push(box);
        label(ctx, l.text, l.x, l.y, l.px, scale, l.weight);
      }
    }

    function redraw() {
      fg.nodeCanvasObject(draw);
    }

    fg.nodeCanvasObject(draw)
      .onRenderFramePre(() => {
        labels = [];
        meNode = null;
      })
      .onRenderFramePost(drawOnTop);
    graph.current = fg;
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      fg._destructor();
      graph.current = null;
    };
  }, []);

  useEffect(() => {
    // People first so hubs paint on top of them.
    const ordered = [...nodes].sort((a, b) => (a.type === b.type ? 0 : a.type === 'person' ? -1 : 1));
    graph.current?.graphData({ nodes: ordered, links });
  }, [nodes, links]);

  useEffect(() => {
    if (size.width) graph.current?.width(size.width).height(size.height);
  }, [size]);

  useEffect(() => {
    const fg = graph.current;
    if (!fg) return;
    fg.linkColor(fg.linkColor()); // repaint with the new selection
    const node = selectedId ? (fg.graphData().nodes.find((n) => n.id === selectedId) as Drawn | undefined) : null;
    if (node?.x !== undefined) {
      // Center it in the upper part of the screen: the detail card covers the bottom.
      const zoom = Math.max(fg.zoom(), 2.2);
      fg.centerAt(node.x, node.y! + (fg.height() * 0.2) / zoom, 500);
      fg.zoom(zoom, 500);
    } else if (highlight.size) {
      // Search results: frame everyone found in the space between the search bar and the results card.
      const lit = fg.graphData().nodes.filter((n) => highlight.has(n.id) && n.x !== undefined) as Drawn[];
      if (!lit.length) return;
      const xs = lit.map((n) => n.x!);
      const ys = lit.map((n) => n.y!);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const free = { top: 150, bottom: 260, side: 40 };
      const w = fg.width() - 2 * free.side;
      const h = Math.max(fg.height() - free.top - free.bottom, 120);
      const zoom = Math.min(Math.max(Math.min(w / (x1 - x0 + 40), h / (y1 - y0 + 40)), 0.5), 3);
      const shift = (fg.height() / 2 - (free.top + h / 2)) / zoom;
      fg.centerAt((x0 + x1) / 2, (y0 + y1) / 2 + shift, 500);
      fg.zoom(zoom, 500);
    }
  }, [selectedId, highlight]);

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return <View ref={container} onLayout={onLayout} style={{ flex: 1, overflow: 'hidden' }} />;
}
