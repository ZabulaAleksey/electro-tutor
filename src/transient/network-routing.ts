export type RoutingPoint = { x: number; y: number };
export type RoutingBox = { left: number; top: number; right: number; bottom: number };
export type RoutedWire = { points: RoutingPoint[]; anchors: RoutingPoint[] };
type WireSegment = RoutingBox & { anchors: RoutingPoint[] };
const samePoint = (a: RoutingPoint, b: RoutingPoint) => a.x === b.x && a.y === b.y;

type Lead = { node: RoutingPoint; pin: RoutingPoint; exit: RoutingPoint };
type LeadPair = [Lead, Lead];
type Routes = [RoutingPoint[], RoutingPoint[]];

function hits(a: RoutingPoint, b: RoutingPoint, box: RoutingBox) {
  return Math.min(a.x, b.x) <= box.right && Math.max(a.x, b.x) >= box.left &&
    Math.min(a.y, b.y) <= box.bottom && Math.max(a.y, b.y) >= box.top;
}

function segmentBox(a: RoutingPoint, b: RoutingPoint): RoutingBox {
  return { left: Math.min(a.x,b.x), right: Math.max(a.x,b.x),
    top: Math.min(a.y,b.y), bottom: Math.max(a.y,b.y) };
}

function wireSegments(wires: RoutedWire[]): WireSegment[] {
  return wires.flatMap(({points,anchors}) => points.slice(1).flatMap((point,i) =>
    samePoint(points[i],point) ? [] : [{...segmentBox(points[i],point),anchors}]));
}

function wireBlocked(a: RoutingPoint, b: RoutingPoint, node: RoutingPoint, wires: WireSegment[]) {
  const edge=segmentBox(a,b);
  return wires.some(wire => {
    const left=Math.max(edge.left,wire.left), right=Math.min(edge.right,wire.right);
    const top=Math.max(edge.top,wire.top), bottom=Math.min(edge.bottom,wire.bottom);
    if(left>right||top>bottom)return false;
    const atNode=left===right&&top===bottom&&left===node.x&&top===node.y;
    return !atNode || !wire.anchors.some(anchor=>samePoint(anchor,node));
  });
}

/** Route geometry only. Pin escape segments remain aligned with the symbol terminals. */
export function routeLeadPair(leads: LeadPair, obstacles: RoutingBox[], body: RoutingBox, wires: RoutedWire[] = []): Routes | null {
  const segments=wireSegments(wires);
  const escapes = leads.map(({ pin, exit }) => segmentBox(pin, exit));
  if (leads.some(({ node, pin, exit }) => !samePoint(node,pin) &&
    (obstacles.some(box => hits(pin, exit, box)) || wireBlocked(pin,exit,pin,segments)))) return null;
  const boxes = [...obstacles, body];
  const coordinates = (axis: "x" | "y") => {
    const edges = [...boxes,...segments].flatMap(box => axis === "x" ? [box.left - 8, box.right + 8] : [box.top - 8, box.bottom + 8]);
    const ports = leads.flatMap(({ node, exit }) => [node[axis], exit[axis]]);
    return [...new Set([...ports, ...edges])].sort((a,b) => a-b);
  };
  const xs = coordinates("x"), ys = coordinates("y");
  const columns = xs.length;
  const points = ys.flatMap(y => xs.map(x => ({x,y})));
  const index = (p: RoutingPoint) => ys.indexOf(p.y)*columns + xs.indexOf(p.x);
  const edges = points.map((point, i) => {
    const candidates = [i-columns,i+columns];
    if (i%columns > 0) candidates.push(i-1);
    if (i%columns < columns-1) candidates.push(i+1);
    return candidates.filter(j => points[j] && !boxes.some(box => hits(point, points[j], box)));
  });
  function path(lead: Lead, forbidden: RoutingBox[]) {
    if (samePoint(lead.node,lead.pin)) return [lead.pin];
    const start = index(lead.node), goal = index(lead.exit);
    const costs = new Map([[start*3,0]]);
    const parents = new Map<number,number>();
    const open = new Set([start*3]);
    while (open.size) {
      let state = -1, best = Infinity;
      for (const candidate of open) {
        const p = points[Math.floor(candidate/3)];
        const score = costs.get(candidate)! + Math.abs(p.x-lead.exit.x) + Math.abs(p.y-lead.exit.y);
        if (score < best) { best = score; state = candidate; }
      }
      const i = Math.floor(state/3), direction = state%3;
      if (i === goal) {
        const route = [lead.pin];
        for (let cursor: number | undefined = state; cursor !== undefined; cursor = parents.get(cursor)) {
          route.push(points[Math.floor(cursor/3)]);
        }
        return route.reverse().filter((point,i,list)=>{
          const previous=list[i-1], next=list[i+1];
          return !previous || !next || !((previous.x===point.x&&next.x===point.x)||
            (previous.y===point.y&&next.y===point.y));
        });
      }
      open.delete(state);
      for (const next of edges[i]) {
        const a = points[i], b = points[next];
        if (forbidden.some(box => hits(a,b,box)) || wireBlocked(a,b,lead.node,segments)) continue;
        if (next === goal && (a.x-b.x)*(lead.pin.x-b.x)+(a.y-b.y)*(lead.pin.y-b.y) > 0) continue;
        const heading = a.x === b.x ? 1 : 2;
        const key = next*3+heading;
        const cost = costs.get(state)! + Math.abs(a.x-b.x) + Math.abs(a.y-b.y) +
          (direction && direction !== heading ? 14 : 0);
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key,cost);
        parents.set(key,state);
        open.add(key);
      }
    }
    return null;
  }

  for (const first of [0,1] as const) {
    const second = 1-first;
    const otherNode = leads[second].node;
    const a = path(leads[first],[escapes[second],segmentBox(otherNode,otherNode)]);
    if (!a) continue;
    const b = path(leads[second],a.slice(1).map((point,i) => segmentBox(a[i],point)));
    if (b) return first === 0 ? [a,b] : [b,a];
  }
  return null;
}

export function leadPath(points: RoutingPoint[]) {
  return points.map(({x,y},i) => (i === 0 ? "M" : "L") + x + " " + y).join("");
}

export function symbolBounds(center: RoutingPoint, angle: number, pins: [number, number], halfHeight: number): RoutingBox {
  const radians = angle*Math.PI/180;
  const dx = Math.round(Math.cos(radians)*1e10)/1e10, dy = Math.round(Math.sin(radians)*1e10)/1e10;
  const corners = pins.flatMap(distance => [-halfHeight,halfHeight].map(offset => ({
    x: center.x+distance*dx-dy*offset, y: center.y+distance*dy+dx*offset,
  })));
  return {left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),
    top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};
}

export function routeSymbolPaths(nodes: [RoutingPoint, RoutingPoint], center: RoutingPoint,
  angle: number, pins: [number, number], halfHeight: number, obstacles: RoutingBox[] = [], wires: RoutedWire[] = []) {
  const radians = angle*Math.PI/180;
  const dx = Math.round(Math.cos(radians)*1e10)/1e10, dy = Math.round(Math.sin(radians)*1e10)/1e10;
  const at = (distance: number) => ({x:center.x+distance*dx,y:center.y+distance*dy});
  const body = symbolBounds(center,angle,pins,halfHeight);
  if (obstacles.some(box => hits({x:body.left,y:body.top},{x:body.right,y:body.bottom},box))) return null;
  const touchesBody = (wire: WireSegment) => {
    const from={x:wire.left-center.x,y:wire.top-center.y};
    const delta={x:wire.right-wire.left,y:wire.bottom-wire.top};
    const coordinates = [
      {start:from.x*dx+from.y*dy,change:delta.x*dx+delta.y*dy,min:pins[0],max:pins[1]},
      {start:-from.x*dy+from.y*dx,change:-delta.x*dy+delta.y*dx,min:-halfHeight,max:halfHeight},
    ];
    let lo=0,hi=1;
    const tolerance=1e-6;
    for(const {start,change,min,max} of coordinates){
      if(Math.abs(change)<tolerance){
        if(start<min-tolerance||start>max+tolerance)return false;
      }else{
        const a=(min-start)/change,b=(max-start)/change;
        lo=Math.max(lo,Math.min(a,b));
        hi=Math.min(hi,Math.max(a,b));
        if(lo-hi>tolerance)return false;
      }
    }
    if(hi-lo>tolerance)return true;
    const intersection={x:wire.left+delta.x*lo,y:wire.top+delta.y*lo};
    return !nodes.some(node=>wire.anchors.some(anchor=>samePoint(anchor,node))&&
      Math.hypot(node.x-intersection.x,node.y-intersection.y)<tolerance);
  };
  if (wireSegments(wires).some(touchesBody)) return null;
  const escape = (pin: RoutingPoint, side: number) => Math.abs(dx) >= Math.abs(dy)
    ? { x: pin.x + side * Math.sign(dx) * 10, y: pin.y }
    : { x: pin.x, y: pin.y + side * Math.sign(dy) * 10 };
  const pinAt = (index: 0 | 1) => {
    const pin = at(pins[index]), node = nodes[index];
    return Math.hypot(pin.x-node.x,pin.y-node.y) < 1e-6 ? node : pin;
  };
  const a = pinAt(0), b = pinAt(1);
  return routeLeadPair([
    {node:nodes[0],pin:a,exit:escape(a,-1)},
    {node:nodes[1],pin:b,exit:escape(b,1)},
  ],obstacles,body,wires);
}
