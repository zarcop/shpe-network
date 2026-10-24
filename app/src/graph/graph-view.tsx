import ForceGraph from 'force-graph';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { colors, hubColors } from '@/ui/theme';

import type { GraphLink, GraphNode, HubNode } from './graph';

// force-graph adds layout coordinates to the node objects it is given.
type Drawn = GraphNode & { x?: number; y?: number };
type DrawnLink = { source: Drawn | string; target: Drawn | string };

const PERSON_RADIUS = 2.4;
const ME_RADIUS = 4.5;
const PERSON_COLOR = '#A3A9B1';
const LINK_COLOR = 'rgba(29, 34, 38, 0.07)';
const LINK_DIM_COLOR = 'rgba(29, 34, 38, 0.025)';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// Bigger hubs have more people; the square root keeps a 60-person college from swallowing the screen.
const hubRadius = (hub: HubNode) => 3.5 + Math.sqrt(hub.members) * 1.5;
const radius = (n: Drawn, meId: string) =>
  n.type === 'hub' ? hubRadius(n) : n.id === meId ? ME_RADIUS : PERSON_RADIUS;

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
        const { selectedId: sel } = view.current;
        if (!sel) return LINK_COLOR;
        if (!isLit(l)) return LINK_DIM_COLOR;
        const hub = [l.source, l.target].find((e): e is HubNode & Drawn => typeof e !== 'string' && e.type === 'hub');
        return hub ? `${hubColors[hub.kind]}99` : LINK_COLOR;
      })
      .nodePointerAreaPaint((n, color, ctx, scale) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        // Hit targets stay finger-sized at any zoom.
        ctx.arc(n.x!, n.y!, Math.max(radius(n, view.current.meId), 10 / scale), 0, 2 * Math.PI);
        ctx.fill();
      })
      .onNodeClick((n) => select.current(n.id))
      .onBackgroundClick(() => select.current(null))
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

    function isLit(l: DrawnLink) {
      const { selectedId: sel } = view.current;
      return !!sel && (endId(l.source) === sel || endId(l.target) === sel);
    }

    // Shapes are drawn per node; labels are only collected, then placed after every shape (below), so they sit on
    // top and can skip any spot another label already took.
    let labels: Label[] = [];
    let meNode: Drawn | null = null;

    function draw(n: Drawn, ctx: CanvasRenderingContext2D, scale: number) {
      const { selectedId: sel, highlight: lit, hoverId, meId: me } = view.current;
      const x = n.x!;
      const y = n.y!;
      const r = radius(n, me);
      const focused = n.id === sel || n.id === hoverId;
      const dim = !!sel && !lit.has(n.id);
      ctx.globalAlpha = dim ? 0.12 : 1;

      if (n.type === 'hub') {
        hubPath(ctx, n, x, y, r);
        ctx.fillStyle = hubColors[n.kind];
        ctx.fill();
        ctx.lineWidth = (focused ? 2.5 : 1.5) / scale;
        ctx.strokeStyle = focused ? colors.text : '#FFFFFF';
        ctx.stroke();
        // Hubs ask for a label once they are big enough on screen; while something is selected, only its own do.
        if (focused || (sel ? !dim : r * scale > 11)) {
          labels.push({ text: n.name, x, y: y + r * 1.25 + 2 / scale, px: 11.5, weight: 600,
                        rank: focused ? 1e6 : n.members });
        }
      } else if (n.id === me) {
        meNode = n; // drawn last, on top of everything
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = focused || (sel && !dim) ? colors.muted : PERSON_COLOR;
        ctx.fill();
        if (focused) {
          ctx.lineWidth = 2 / scale;
          ctx.strokeStyle = colors.text;
          ctx.stroke();
        }
        if (focused || (sel && !dim && scale > 1.8) || scale > 4) {
          labels.push({ text: n.name, x, y: y + r + 2.5 / scale, px: 11, weight: 500, rank: focused ? 1e6 : -1 });
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawOnTop(ctx: CanvasRenderingContext2D, scale: number) {
      const me = meNode;
      if (me) {
        const dim = !!view.current.selectedId && !view.current.highlight.has(me.id);
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
    }
  }, [selectedId, highlight]);

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return <View ref={container} onLayout={onLayout} style={{ flex: 1, overflow: 'hidden' }} />;
}
