import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Pencil, ChevronDown, CircleHelp, Crosshair, Maximize, Redo2, RotateCw, Settings, Trash2, Undo2, X } from "lucide-react";
import type { Language } from "../types";
import { CapacitorGlyph, DiodeGlyph, InductorGlyph, ResistorGlyph, SourceGlyph } from "../engineering/symbols";
import { ZigzagResistors } from "../engineering/symbol-style";
import { formatEngineeringNumber } from "../engineering/format";
import { contactClosed, findLoad, validateNetwork, type Load, type Network } from "./network";
import { LoadCircuit, type Layout } from "./NetworkEditor";
import { compoundLoadRoutes } from "./network-load-layout";
import { contactKind, isTwoTerminal, placementTargets, type DetachedPart, type Placement, type Selection, type Tool } from "./network-edit";
import { usePointerStroke } from "../engineering/usePointerStroke";
import { boundedStroke, recognizeInk, type Ink, type Sketch, type SketchKind } from "../engineering/handwriting";
import { experimentTimeLabel } from "./network-experiment";
import { correctionKinds, correctInkTarget, type InkLink } from "./network-ink";
import { networkError } from "./network-copy";
import { leadPath, routeLeadPair, routeSymbolPaths, symbolBounds, type RoutedWire, type RoutingBox } from "./network-routing";

type Point = { x: number; y: number };
type View = Point & { zoom: number };
type Gesture = { additive?:boolean; id: number; start: Point; tool?: Tool; selection?: Selection; moved: boolean };
type Props = {
  ink: Ink[];
  inkLinks: (InkLink | null)[];
  onSketchCommit: (model: Network, selection: Selection | null, layout: Layout, detached: DetachedPart[], ink: Ink, kind: SketchKind, index?: number) => void;
  onDetach:(item:Selection,part:DetachedPart)=>void;
  model: Network;
  empty:boolean;
  onClear:()=>void;
  onDelete:(item:Selection)=>void;
  onProbe:(section:number)=>void;
  layout: Layout;
  language: Language;
  selected: Selection | null;
  onLayout: (layout: Layout) => void;
  onSelect: (selection: Selection | null) => void;
  detached: DetachedPart[];
  onDetached: (parts: DetachedPart[]) => void;
  onCommit: (model: Network, selection: Selection, previous?: Selection) => void;
  inspector: (arm: (tool: Tool) => void) => ReactNode;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  load: Load;
  time: number;
  tools: ReactNode;
  transport: ReactNode;
  timing: ReactNode;
  reference: string;
};
const axis = 84;
const lineHalfSpan = (layout: Layout, id: string) => layout["@span-"+id] > 0 ? layout["@span-"+id] : 53;
const nodeX = (index: number) => 58 + index * 170;
const offset = (kind: Placement["kind"]) => kind === "span" || kind==="branch-span" ? 85 : kind === "end" ? 62 : 0;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const parts = [["line","wire"],["r","l","c","diode"],["source","switch"]] as const;
type Part = typeof parts[number][number];
function Glyph({kind, reverse=false,closed=false}:{kind:Part|"shunt";reverse?:boolean;closed?:boolean}){
 return <g fill="none" stroke="currentColor" strokeWidth="1.7">
  {kind==="line"?<path d="M-23 0H23" strokeWidth="5"/>:
   kind==="wire"?<path d="M-23 0H23"/>:
   kind==="r"||kind==="shunt"?<ResistorGlyph x={-23} y={0} scale={.8} terminalSpan={57.5}/>:
   kind==="l"?<InductorGlyph x={-23} y={0} scale={46/54}/>:
   kind==="c"?<CapacitorGlyph x={0} y={0} orientation="horizontal" scale={.7} terminalSpan={46/.7}/>:
   kind==="diode"?<g transform={reverse?"scale(-1 1)":undefined}><path d="M-23 0H-9M14 0H23"/><DiodeGlyph x={-9} y={0}/></g>:
   kind==="switch"?<><path d={closed?"M-23 0H23":"M-23 0H-13M13 0H23M-13 0L8 -9"}/><circle cx="-13" r="2"/><circle cx="13" r="2"/></>:
   <g transform={reverse?"scale(-1 1)":undefined}><circle r="15"/><path d="M-23 0H-15M15 0H23M-9 0H9M4-4l5 4-5 4"/></g>}
 </g>;
}
const layoutKey=(item:Selection)=>item.kind==="line"||item.kind==="detached"?item.id:item.kind==="source"?"@source":
 item.kind==="shunt"?"@shunt-"+item.node:item.kind==="contact"?"@contact-"+item.id:item.kind==="load"&&item.id?"@load-"+item.id:"@load";
const rotationKey=(item:Selection)=>"@rot-"+layoutKey(item).replace(/^@/,"");
const horizontalKey=(key:string)=>key==="@load"?"@load-x":"@x-"+key.replace(/^@/,"");
function drawnLineLayout(layout: Layout,id: string,index: number,a: Point,b: Point): Layout {
  return {...layout,[id]:(a.y+b.y)/2,[horizontalKey(id)]:(a.x+b.x)/2-nodeX(index)-85,
    ["@rot-"+id]:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,["@span-"+id]:distance(a,b)/2};
}
const baseX=(key:string)=>key==="@load"?82:0;
const turned=(x:number,y:number,d:number,angle:number):Point=>{
  const radians=angle*Math.PI/180;
  return {x:x+Math.round(Math.cos(radians)*1e10)/1e10*d,y:y+Math.round(Math.sin(radians)*1e10)/1e10*d};
};
const routed=(x:number,y:number,target:Point,lane:number)=>`M${x} ${y}V${lane}H${target.x}V${target.y}`;
const wire=(x:number,y:number,tx:number,ty:number,vertical=false)=>
  vertical?`M${x} ${y}H${tx}V${ty}`:`M${x} ${y}V${ty}H${tx}`;

function loadGeometry(positions: Layout, sections: Network["sections"], source: number, labelled: boolean, wires: RoutedWire[]) {
  const baseEnd = nodeX(sections.length)+62;
  const x = baseEnd + (positions["@load-x"] ?? 82) - 82;
  const y = 148.5 + (positions["@load"] ?? 82) - 82;
  const angle = 90 + (positions["@rot-load"] ?? 0);
  const vertical = angle % 180 !== 0;
  const box = (cx: number, cy: number, halfWidth: number, halfHeight: number): RoutingBox =>
    ({left:cx-halfWidth, right:cx+halfWidth, top:cy-halfHeight, bottom:cy+halfHeight});
  const body = box(x,y,vertical ? 13 : 23,vertical ? 23 : 13);
  const label = {x:x+(vertical ? 16 : 24),y:y+(vertical ? 4 : 21)};
  const lines = sections.map((section,index) => {
    const span = lineHalfSpan(positions,section.id);
    return symbolBounds({x:nodeX(index)+85+(positions["@x-"+section.id]??0),y:positions[section.id]??axis},
      positions["@rot-"+section.id]??0,[-span-4,span+4],7);
  });
  const sourceVertical = (positions["@rot-source"] ?? 0) % 180 === 0;
  const sourceBody = box(source+(positions["@x-source"] ?? 0),164+(positions["@source"] ?? 82)-82,
    sourceVertical ? 15 : 23,sourceVertical ? 23 : 15);
  const returnRail = {left:nodeX(0)-45,right:baseEnd-1,top:212,bottom:214};
  const occupied = [...lines,sourceBody,returnRail];
  const signal = {x:nodeX(sections.length),y:axis};
  const ground = {x:baseEnd,y:213};
  const overlaps = (a: RoutingBox, b: RoutingBox) =>
    a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  if (occupied.some(other => overlaps(body,other))) return null;
  if (labelled) occupied.push({left:label.x-2,right:label.x+43,top:label.y-11,bottom:label.y+3});
  const routes = routeLeadPair([
    {node:signal,pin:turned(x,y,-23,angle),exit:turned(x,y,-35,angle)},
    {node:ground,pin:turned(x,y,23,angle),exit:turned(x,y,35,angle)},
  ],occupied,body,wires);
  return routes ? {x,y,angle,label,paths:routes.map(leadPath),wires:routes.map(points=>({points,anchors:[points[0]]}))} : null;
}

function traceLayout(positions:Layout,model:Network,load:Load,empty:boolean) {
    if(empty)return {parts:new Map<string,string[]>(),compound:undefined,load:null};
    const parts=new Map<string,string[]>();
    const dx=(key:string)=>(positions[horizontalKey(key)]??baseX(key))-baseX(key);
    const dy=(key:string)=>(positions[key]??82)-82;
    const rotationOf=(key:string)=>positions["@rot-"+key.replace(/^@/,"")]??0;
    const sections=model.sections;
    const terminal=nodeX(sections.length),baseEnd=terminal+62;
    const groundY=213;
    const contacts=[...model.series??[],...model.branches??[]];
    const before=(index:number)=>nodeX(index)-(model.series?.some(link=>link.from===index)?15:0);
    const source=before(model.source.node);
    const simpleLoad=!load.children?.length;
    const labelledLoad=["r","l","c","diode"].includes(load.kind);
    const after=(index:number)=>nodeX(index)+(model.series?.some(link=>link.from===index)?15:0);
    const compound=load.children?.length?compoundLoadRoutes(load,96,id=>({x:dx("@load-"+id),y:dy("@load-"+id)}),id=>rotationOf("@load-"+id)):undefined;
    if(compound===null)return null;
    const components:{key:string;nodes:[Point,Point];center:Point;angle:number;pins:[number,number];height:number;changed:boolean;verticalFirst:boolean}[]=[];
    const route=(key:string,nodes:[Point,Point],center:Point,angle:number,pins:[number,number],height:number,baselineY=82,verticalFirst=false)=>{
      const changed=!!(dx(key)||rotationOf(key)||(positions[key]??baselineY)!==baselineY||positions["@span-"+key]);
      components.push({key,nodes,center,angle,pins,height,changed,verticalFirst});
    };
    sections.forEach((section,i)=>{
      const span = lineHalfSpan(positions,section.id);
      route(section.id,[{x:after(i),y:axis},{x:before(i+1),y:axis}],
        {x:nodeX(i)+85+dx(section.id),y:positions[section.id]??axis},rotationOf(section.id),[-span,span],5,axis);
    });
    route("@source",[{x:source,y:groundY},{x:source,y:axis}],{x:source+dx("@source"),y:164+dy("@source")},
      -90+rotationOf("@source"),[-23,model.source.resistanceOhm>0?49:23],15,82,true);
    contacts.forEach(link=>{
      const series=model.series?.some(item=>item.id===link.id),vertical=link.to==="reference";
      const from=before(link.from);
      const to=vertical?from-23:series?after(link.from):before(link.to as number);
      const key="@contact-"+link.id;
      const scale=series?15/23:1,combined=!!link.switch&&link.resistanceOhm!==undefined;
      route(key,[{x:from,y:axis},{x:to,y:vertical?groundY:axis}],
        {x:(vertical?to:(from+to)/2)+dx(key),y:(series?axis:vertical?160:234+(model.branches?.indexOf(link)??0)*9)+dy(key)},
        (vertical?90:to<from?180:0)+rotationOf(key),[(combined?-46:-23)*scale,23*scale],12*scale,82,vertical);
    });
    model.shunts.forEach(shunt=>{
      const anchor=before(shunt.node),key="@shunt-"+shunt.node;
      route(key,[{x:anchor,y:axis},{x:anchor-33,y:groundY}],
        {x:anchor-33+dx(key),y:161+dy(key)},90+rotationOf(key),[-15,15],9,82,true);
    });
    const movedLoad=!!(dx("@load")||dy("@load")||rotationOf("@load"));
    const loadNodes:[Point,Point]=[{x:terminal,y:axis},{x:baseEnd,y:groundY}];
    const loadCenter={x:baseEnd+dx("@load"),y:148.5+dy("@load")};
    const loadAngle=compound?90:90+rotationOf("@load");
    const loadPins:[number,number]=compound?[-48,48]:[-23,23];
    const loadBody=symbolBounds(loadCenter,loadAngle,loadPins,compound?58:13);
    const wires:RoutedWire[]=[{
      points:[{x:nodeX(0)-45,y:groundY},{x:baseEnd,y:groundY}],
      anchors:[loadNodes[1],...components.flatMap(item=>item.nodes.filter(node=>node.y===groundY))],
    }];
    const addDefault=(nodes:[Point,Point],center:Point,pins:[number,number],angle:number,verticalFirst:boolean)=>{
      nodes.forEach((node,i)=>{
        const pin=turned(center.x,center.y,pins[i],angle);
        const bend=verticalFirst?{x:pin.x,y:node.y}:{x:node.x,y:pin.y};
        wires.push({points:[node,bend,pin],anchors:[node]});
      });
    };
    for(const item of components){
      if(!item.changed)addDefault(item.nodes,item.center,item.pins,item.angle,item.verticalFirst);
    }
    let terminalLoad=null;
    if(!movedLoad){
      if(simpleLoad)terminalLoad=loadGeometry(positions,sections,source,labelledLoad,[]);
      if(terminalLoad)wires.push(...terminalLoad.wires);
      else addDefault(loadNodes,loadCenter,loadPins,loadAngle,true);
    }
    const boxes=components.map(item=>symbolBounds(item.center,item.angle,item.pins,item.height));
    for(const [i,item] of components.entries()){
      if(!item.changed)continue;
      const obstacles=boxes.filter((_,j)=>j!==i);
      obstacles.push(loadBody);
      const paths=routeSymbolPaths(item.nodes,item.center,item.angle,item.pins,item.height,obstacles,wires);
      if(!paths)return null;
      parts.set(item.key,paths.map(leadPath));
      wires.push(...paths.map((points,j)=>({points,anchors:[item.nodes[j]]})));
    }
    if(movedLoad){
      if(simpleLoad){
        terminalLoad=loadGeometry(positions,sections,source,labelledLoad,wires);
        if(!terminalLoad)return null;
      }else{
        const outer=routeSymbolPaths(loadNodes,loadCenter,loadAngle,loadPins,58,boxes,wires);
        if(!outer)return null;
        parts.set("@load",outer.map(leadPath));
      }
    }
    return {parts,compound,load:terminalLoad};
  }

// The document loader uses the same routing check as the editor.
// eslint-disable-next-line react-refresh/only-export-components
export function restoreNetworkLayout(layout: Layout, model: Network, empty: boolean): Layout {
  if (Object.keys(layout).some(key=>key.startsWith("@span-")) && !traceLayout(layout,model,model.load,empty)) {
    return {};
  }
  return layout;
}

export default function NetworkWorkbench(props: Props) {
  const { model, layout, language, selected, onSelect, onCommit } = props;
  const ru = language === "ru";
  const t = (a: string, b: string) => ru ? a : b;
  const clearDialog=useRef<HTMLDialogElement>(null);
  const [tray, setTray] = useState<"parts" | "inspect" | "help" | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [ink, setInk] = useState<Ink>([]);
  const [correction, setCorrection] = useState<SketchKind | "">("");
  const [inkArchive, setInkArchive] = useState(false);
  const [editingMark, setEditingMark] = useState<number | null>(null);
  const inkConfirmTouch = useRef<{id: number; start: Point} | null>(null);
  const inkConfirmUsesTouch = useRef(false);
  const [zigzag, setZigzag] = useState(false);
  useEffect(()=>{
    try { setZigzag(localStorage.getItem("electrotutor-line-resistor-symbol")==="ansi"); } catch { /* Use the default style. */ }
  },[]);
  function changeNotation(next: boolean) {
    setZigzag(next);
    try { localStorage.setItem("electrotutor-line-resistor-symbol",next?"ansi":"iec"); } catch { /* Keep the in-memory selection. */ }
  }
  const inkPreview = useRef<SVGPolylineElement>(null);
  const [armed, setArmed] = useState<Tool | null>(null);
  const [group,setGroup]=useState<Selection[]>([]),[snap,setSnap]=useState(false),[measuring,setMeasuring]=useState(false);
  const clipboard=useRef<Pick<DetachedPart,"kind"|"rotation"|"template">|null>(null);
  const [attaching,setAttaching]=useState<string|null>(null);
  const [repeat,setRepeat]=useState(false);
  const [cursor,setCursor]=useState<Point|null>(null);
  const [geometry,setGeometry]=useState<{key:string;y:number;dx:number}|null>(null);
  const [groupPreview,setGroupPreview]=useState<Layout|null>(null);
  const [preview, setPreview] = useState<{ tool: Tool; point: Point; touch: boolean; target?: Placement } | null>(null);
  const [message, setMessage] = useState("");
  const [hovered, setHovered] = useState<Placement | null>(null);
  const [viewport, setViewport] = useState({ width: 680, height: 330 });
  const [camera, setCamera] = useState<View | null>(null);
  const [visible, setVisible] = useState({ inset: 0, height: 0 });
  const canvas = useRef<SVGSVGElement>(null);
  const timing = useRef<HTMLDetailsElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinching = useRef(false);
  const suppress = useRef(false);
  const frame = useRef(0);
  const sketchedBounds=model.sections.flatMap((section,index)=>{
    if(!layout["@span-"+section.id])return [];
    const span=lineHalfSpan(layout,section.id), center={x:nodeX(index)+85+(layout["@x-"+section.id]??0),y:layout[section.id]??axis};
    return [symbolBounds(center,layout["@rot-"+section.id]??0,[-span,span],25)];
  });
  const movedX=Object.entries(layout).filter(([key])=>key.startsWith("@x-")||key==="@load-x")
    .map(([key,x])=>key==="@load-x"?x-82:x);
  const movedY=Object.entries(layout).filter(([key])=>key!=="@ground-load"&&!key.startsWith("@span-")&&!key.startsWith("@x-")&&!key.startsWith("@rot-")&&key!=="@load-x").map(([,y])=>y);
  const left=Math.min(0,...sketchedBounds.map(box=>box.left-15),...movedX.map(x=>x-25),...props.detached.map(part=>part.x-30));
  const top=Math.min(0,...sketchedBounds.map(box=>box.top-15),...movedY.map(y=>y-55),...props.detached.map(part=>part.y-30));
  const baseWidth=nodeX(model.sections.length)+135;
  const width=baseWidth+Math.max(0,...sketchedBounds.map(box=>box.right+15-baseWidth),...movedX.map(x=>x-22),...props.detached.map(part=>part.x+30-baseWidth))-left;
  const height=Math.max(273+(model.branches?.length??0)*9,...sketchedBounds.map(box=>box.bottom+15),...movedY.map(y=>y+205),...props.detached.map(part=>part.y+30))-top;
  const fit=Math.min(1.4,viewport.width/width,Math.max(120,viewport.height-45)/height);
  const view=camera??{x:(viewport.width-width*fit)/2-left*fit,y:(viewport.height-height*fit+32)/2-top*fit,zoom:fit};
  const tool = preview?.tool ?? armed;
  const recognition = useMemo(() => recognizeInk(ink, view.zoom), [ink, view.zoom]);
  const savedLink = editingMark===null ? null : props.inkLinks[editingMark]??null;
  const recognizedKind = recognition?.kind;
  const sketchKind = correction || (editingMark===null || !savedLink || recognizedKind && correctionKinds(savedLink).includes(recognizedKind)
    ? recognizedKind : savedLink.kind);
  const sketchLabels: Partial<Record<SketchKind, string>> = {
    current: t("Источник тока", "Джерело струму"),
    ground: t("Заземление", "Заземлення"),
    junction: t("Узел", "Вузол"),
  };
  const sketchKinds: SketchKind[] = editingMark===null
    ? ["wire","r","l","c","source","current","switch","ground","junction"]
    : savedLink ? correctionKinds(savedLink) : [];
  if (editingMark===null && recognition?.kind === "line") sketchKinds.unshift("line");
  const pointerInk = usePointerStroke({
    svgRef: canvas, previewRef: inkPreview, enabled: drawing, pointLimit: 256,
    toPoint: event => {
      const point = local({x:event.clientX,y:event.clientY});
      return {x:(point.x-view.x)/view.zoom,y:(point.y-view.y)/view.zoom};
    },
    onCommit: points => {
      if (ink.length >= 6) {
        setMessage(t("Уберите штрих или выберите тип элемента.", "Приберіть штрих або оберіть тип елемента."));
        return;
      }
      setInk([...ink, boundedStroke(points)]);
      setCorrection("");
      setMessage("");
    },
  });
  const targets = useMemo(() => {
    if(!tool)return [];
    const options=placementTargets(model,tool);
    return props.empty?tool==="line"?options.filter(item=>item.kind==="end"):[]:options;
  },[model,tool,props.empty]);
  const labels = {
    line: t("Линия передачи", "Лінія передачі"),
    shunt: t("Шунтирующий резистор", "Шунтувальний резистор"),
    matched: t("Согласованная нагрузка", "Узгоджене навантаження"),
    r: t("Резистор", "Резистор"),
    switch: t("Ключ", "Ключ"),
    l: t("Индуктивность", "Індуктивність"),
    c: t("Конденсатор", "Конденсатор"),
    open: t("Разомкнутый конец", "Розімкнений кінець"),
    wire: t("Провод", "Провід"),
    source:t("Источник ЭДС","Джерело ЕРС"),
    diode:t("Диод","Діод"),
  };
  const reasons: Record<string, string> = {
    "choose-connection": t("Выберите стык, участок или шунтирующую ветвь.", "Оберіть стик, ділянку або шунтувальну гілку."),
    "occupied-joint": t("В этом стыке уже установлен элемент.", "У цьому стику вже є елемент."),
    "choose-end": t("Подключите элемент в конце цепочки.", "Під’єднайте елемент у кінці ланцюжка."),
    "free-node": t("Выберите свободный узел для шунта.", "Оберіть вільний вузол для шунта."),
    "choose-node": t("Выберите другой узел источника.", "Оберіть інший вузол джерела."),
    "choose-line": t("Выберите новую позицию участка.", "Оберіть нову позицію ділянки."),
    "section-limit": t("Достигнут предел участков расчётной модели.", "Досягнуто межі ділянок розрахункової моделі."),
    "short-section": t("Участок слишком короткий для разделения.", "Ділянка закоротка для поділу."),
  };
  const explain = (error?: string) => error === "unroutable-layout" ? t("Проводники здесь пересекаются или перекрывают элемент.","Провідники тут перетинаються або перекривають елемент.") :
    error ? reasons[error] ?? networkError(error, language) :
    t("Выберите подсвеченную точку на схеме.", "Оберіть підсвічену точку на схемі.");
  const zone = (target: Placement) => {
    switch (target.kind) {
      case "end": return t("Конец линии", "Кінець лінії");
      case "span": return tool&&isTwoTerminal(tool)||typeof tool==="object"&&tool&&("relocate" in tool||"moveLoad" in tool)
        ? t("В разрыв линии", "У розрив лінії") : t("Вдоль линии", "Уздовж лінії");
      case "joint": return t("Последовательный стык", "Послідовний стик");
      case "wire-insert": return t("В разрыв провода","У розрив проводу");
      case "branch-key": return t("Ключ в существующую ветвь","Ключ у наявну гілку");
      case "branch-span":
      case "branch": return t("Шунт к опоре", "Шунт до опори");
      default: return t("Узел соединения", "Вузол з’єднання");
    }
  };
  const name = (target: Placement) => target.kind === "end" ? zone(target) :
    zone(target) + " · " + (target.kind === "span"||target.kind==="branch-span" ? model.sections[target.index].id : target.index);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setViewport({ width, height });
    });
    observer.observe(element);
    const visual = window.visualViewport;
    const update = () => {
      if (visual) setVisible({ inset: Math.max(0, window.innerHeight - visual.height - visual.offsetTop), height: visual.height });
    };
    update();
    visual?.addEventListener("resize", update);
    visual?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      visual?.removeEventListener("resize", update);
      visual?.removeEventListener("scroll", update);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  function local(point: Point): Point {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  }
  function zoomAt(center: Point, factor: number, next = center) {
    setCamera(previous => {
      const current = previous ?? view;
      const zoom = Math.max(fit / 2, Math.min(3.5, current.zoom * factor));
      const ratio = zoom / current.zoom;
      return { x: next.x - (center.x - current.x) * ratio, y: next.y - (center.y - current.y) * ratio, zoom };
    });
  }
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if(!event.ctrlKey)return;
      event.preventDefault();
      zoomAt(local({ x: event.clientX, y: event.clientY }), Math.exp(-event.deltaY * .0015));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });

  function cancel() {
    pointerInk.cancel();
    suppress.current = !!gesture.current;
    gesture.current = null;
    touches.current.clear();
    pinching.current = false;
    cancelAnimationFrame(frame.current);
    setArmed(null);
    setAttaching(null);
    setMeasuring(false);
    setCursor(null);
    setGeometry(null);
    setGroupPreview(null);
    setHovered(null);
    setPreview(null);
    setMessage("");
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drawing) { cancelInk(); setMessage(""); }
      if (event.key === "Escape" && (armed || preview || tray || measuring || gesture.current)) {
        cancel();
        setTray(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const junctionX = (index: number) => nodeX(index)-(model.series?.some(link=>link.from===index)?15:0);
  const targetPoint = (target: Placement): Point => {
    if(target.kind==="branch-key"||target.kind==="wire-insert"){
      const branch=model.branches![target.index], from=junctionX(branch.from);
      const key="@contact-"+branch.id;
      return {x:view.x+((branch.to==="reference"?from-23:(from+junctionX(branch.to))/2)+positionX(key))*view.zoom,
        y:view.y+((branch.to==="reference"?160:234+target.index*9)+positionY(key,82)-82)*view.zoom};
    }
    return {x:view.x+((target.kind==="node"||target.kind==="branch"?junctionX(target.index):nodeX(target.index))+offset(target.kind)+(target.kind==="end"?positionX("@load"):target.kind==="span"?positionX(model.sections[target.index].id):0))*view.zoom,
      y:view.y+(target.kind==="span"?layout[model.sections[target.index].id]??axis:
        target.kind==="branch"||target.kind==="branch-span"?147:axis)*view.zoom};
  };
  function firstTerminal(point:Point,touch:boolean){
    if(!canvas.current?.contains(document.elementFromPoint(point.x,point.y)))return null;
    const p=local(point);
    for(let i=0;i<=model.sections.length;i++){
      const target={x:view.x+junctionX(i)*view.zoom,y:view.y+axis*view.zoom};
      if(distance(p,target)<(touch?15:12))return i;
    }
    return null;
  }
  function targetAt(point: Point, options: Placement[], touch: boolean) {
    const hit = document.elementFromPoint(point.x, point.y);
    if (!hit || !canvas.current?.contains(hit) && !hit.closest(".network-tray-parts")) return;
    const bounds=canvas.current!.getBoundingClientRect();
    if(point.x<bounds.left||point.x>bounds.right||point.y<bounds.top||point.y>bounds.bottom)return;
    const location = local(point);
    let best = touch ? 30 : 23;
    let nearest: Placement | undefined;
    for (const option of options) {
      const gap = distance(location, targetPoint(option));
      if (gap < best || gap === best && option.edit && !nearest?.edit) {
        best = gap;
        nearest = option;
      }
    }
    if(nearest)return nearest;
    const stroke=hit.closest('.network-transmission-stroke');
    const section=stroke?.closest('[data-line-section]')?.getAttribute('data-line-section');
    const index=section?model.sections.findIndex(line=>line.id===section):-1;
    return options.find(option=>option.kind==='span'&&option.index===index);
  }
  function place(target?: Placement, point?:Point, nextTool=armed, dragged=false) {
    if(props.empty&&nextTool==="line"&&(target?.edit||point&&canvas.current?.contains(document.elementFromPoint(point.x,point.y)))){
      onCommit(model,{kind:"line",id:model.sections[0].id},attaching ? {kind:"detached",id:attaching} : undefined);
      cancel();setTray(null);
      return true;
    }
    if(!target&&point&&!attaching&&typeof nextTool==="string"&&parts.some(group=>(group as readonly string[]).includes(nextTool))){
      const hit=document.elementFromPoint(point.x,point.y);
      const bounds=canvas.current?.getBoundingClientRect();
      const inCanvas=bounds&&point.x>=bounds.left&&point.x<=bounds.right&&point.y>=bounds.top&&point.y<=bounds.bottom;
      if(hit&&inCanvas&&(canvas.current?.contains(hit)&&!hit.closest("[role=button]")||
          dragged&&hit.closest(".network-tray-parts"))){
        const p=local(point);
        const id=freeId();
        setCamera(view);
        props.onDetached([...props.detached,{id,kind:nextTool as Part,x:(p.x-view.x)/view.zoom,y:(p.y-view.y)/view.zoom}]);
        onSelect({kind:"detached",id});
        setArmed(repeat?nextTool:null);
        setTray(repeat?null:"inspect");
        setCursor(null);
        setMessage("");
        return true;
      }
    }
    if (!target?.edit) {
      setMessage(explain(target?.error??(attaching?"choose-connection":undefined)));
      return false;
    }
    if (target.edit.selection.kind === "load" && !target.edit.selection.id) {
      const replacesBranch = !!model.load.children?.length;
      const removesEvents = target.edit.model.events.length < model.events.length;
      const warning = replacesBranch && removesEvents
        ? t("Заменить нагрузку, её вложенные элементы и записанные события?", "Замінити навантаження, його вкладені елементи й записані події?")
        : replacesBranch ? t("Заменить нагрузку вместе с её вложенными элементами?", "Замінити навантаження разом із вкладеними елементами?")
          : removesEvents ? t("События прежней нагрузки будут удалены. Продолжить?", "Події попереднього навантаження буде видалено. Продовжити?") : "";
      if (warning && !window.confirm(warning)) return false;
    }
    let previous: Selection | undefined;
    if(attaching)previous={kind:"detached",id:attaching};
    else if(nextTool&&typeof nextTool==="object"){
      if("relocate" in nextTool)previous={kind:"contact",id:nextTool.relocate};
      if("moveLoad" in nextTool)previous={kind:"load",id:nextTool.moveLoad};
    }
    onCommit(target.edit.model,target.edit.selection,previous);
    if(attaching||!repeat||typeof armed!=="string")setArmed(null);
    setAttaching(null);
    setCursor(null);
    setHovered(null);
    setTray(null);
    setMessage("");
    return true;
  }
  function arm(next: Tool, detachedId:string|null=null) {
    setAttaching(detachedId);
    setHovered(null);
    setCursor(null);
    setArmed(next);
    setTray(null);
    setMessage(typeof next === "object"
      ? "bridgeFrom" in next ? t("Выберите второй узел перемычки.", "Оберіть другий вузол перемички.")
        : "relocate" in next||"moveLoad" in next||"install" in next ? explain("choose-connection")
          : explain(next.move.kind === "line" ? "choose-line" : next.move.kind === "source" ? "choose-node" : "free-node")
      : next==="source"?explain("choose-node"): next==="shunt" ? t("Выберите узел или середину участка.", "Оберіть вузол або середину ділянки.")
        : detachedId?explain("choose-connection"):explain());
    const rect = canvas.current?.getBoundingClientRect();
    if (rect && (rect.bottom <= 0 || rect.top >= window.innerHeight - 56)) canvas.current?.scrollIntoView({ block: "center" });
    requestAnimationFrame(() => canvas.current?.querySelector<SVGElement>("[data-allowed=true]")?.focus({ preventScroll: true }));
  }
  function cancelInk() {
    inkConfirmTouch.current=null;
    pointerInk.cancel();
    setInk([]);
    setCorrection("");
    setEditingMark(null);
    setDrawing(false);
  }

  function reopenInk(index: number) {
    cancel();
    setTray(null);
    setEditingMark(index);
    setInk(props.ink[index]);
    setCorrection(props.inkLinks[index]?.kind??"");
    setDrawing(true);
  }

  function acceptInk(kind: SketchKind) {
    if (!ink.length) return;
    if (editingMark!==null && !savedLink) {
      if (ink!==props.ink[editingMark]) props.onSketchCommit(model,null,layout,props.detached,ink,kind,editingMark);
      cancelInk();
      return;
    }
    const all = ink.flat(), first = all[0], last = all.at(-1)!;
    const guess: Sketch = recognition ?? {kind,center:{x:(first.x+last.x)/2,y:(first.y+last.y)/2},
      angle:Math.atan2(last.y-first.y,last.x-first.x)*180/Math.PI};
    const rect = canvas.current!.getBoundingClientRect();
    const screen = (p: Point) => ({x:rect.left+view.x+p.x*view.zoom,y:rect.top+view.y+p.y*view.zoom});
    const finishInk = cancelInk;
    const saveInk = () => { props.onSketchCommit(model,null,layout,props.detached,ink,kind); finishInk(); };
    const unavailable = t("В этой схеме элемент нельзя подключить в этом месте.", "У цій схемі елемент не можна під’єднати в цьому місці.");
    if (editingMark!==null && savedLink) {
      if (kind===savedLink.kind && ink===props.ink[editingMark]) { finishInk(); return; }
      const corrected = correctInkTarget(model,props.detached,savedLink,kind,props.empty);
      let nextLayout = {...layout};
      if (savedLink.target.kind==="line" && ink!==props.ink[editingMark]) {
        if (recognition?.kind!=="line" || !recognition.terminals) { setMessage(unavailable); return; }
        const id=savedLink.target.id, index=model.sections.findIndex(section=>section.id===id);
        if(index<0){setMessage(unavailable);return;}
        const oldAngle=(layout["@rot-"+id]??0)*Math.PI/180;
        const oldCenter={x:nodeX(index)+85+(layout[horizontalKey(id)]??0),y:layout[id]??axis};
        const oldStart={x:oldCenter.x-Math.cos(oldAngle)*lineHalfSpan(layout,id),y:oldCenter.y-Math.sin(oldAngle)*lineHalfSpan(layout,id)};
        const [a,b]=[...recognition.terminals].sort((p,q)=>distance(p,oldStart)-distance(q,oldStart));
        nextLayout = drawnLineLayout(layout,id,index,a,b);
      }
      if(savedLink.target.kind==="load" && savedLink.target.id===model.load.id) {
        if(kind==="ground")nextLayout["@ground-load"]=1;
        else delete nextLayout["@ground-load"];
      }
      if(!corrected || !traceLayout(nextLayout,corrected.model,corrected.model.load,props.empty)){
        setMessage(unavailable);
        return;
      }
      props.onSketchCommit(corrected.model,savedLink.target,nextLayout,corrected.detached,ink,kind,editingMark);
      finishInk();
      return;
    }
    const options = (part: Tool) => placementTargets(model,part).filter(item=>item.edit);
    const install = (target: Placement, nextLayout = layout) => {
      if (!target.edit || !traceLayout(nextLayout,target.edit.model,target.edit.model.load,false)) {
        setMessage(explain("unroutable-layout"));
        return;
      }
      props.onSketchCommit(target.edit.model,target.edit.selection,nextLayout,props.detached,ink,kind);
      finishInk();
    };
    if (kind === "line") {
      if (guess.kind !== "line" || !guess.terminals) return;
      const target = props.empty
        ? {kind:"end",index:0,edit:{model,selection:{kind:"line",id:model.sections[0].id}}} as const
        : options("line").find(item=>item.kind==="end");
      if (!target?.edit || target.edit.selection.kind !== "line") { setMessage(unavailable); return; }
      const [firstEnd, secondEnd] = guess.terminals;
      const firstNode = props.empty ? null : firstTerminal(screen(firstEnd),true);
      const secondNode = props.empty ? null : firstTerminal(screen(secondEnd),true);
      if (!props.empty && !(
        firstNode === model.sections.length && secondNode === null ||
        secondNode === model.sections.length && firstNode === null
      )) {
        setMessage(t("Отметьте один конец на последнем узле линии.", "Позначте один кінець на останньому вузлі лінії."));
        return;
      }
      const reversed = props.empty ? firstEnd.x>secondEnd.x || firstEnd.x===secondEnd.x&&firstEnd.y>secondEnd.y : secondNode!==null;
      const [start,b] = reversed ? [secondEnd,firstEnd] : [firstEnd,secondEnd];
      const a = props.empty ? start : {x:junctionX(model.sections.length),y:axis};
      const index = props.empty ? 0 : model.sections.length;
      const id = props.empty ? model.sections[0].id : target.edit.selection.id;
      setCamera(view);
      install(target,drawnLineLayout(layout,id,index,a,b));
      return;
    }
    if (kind === "current" || kind === "source") {
      const node = !props.empty ? firstTerminal(screen(guess.center),true) : null;
      if (node === null) { setMessage(unavailable); return; }
      const source = { ...model.source, node, voltageV:kind==="current"?0:100,
        resistanceOhm:0, currentA:kind==="current"?1:undefined };
      const reversed = recognition?.kind===kind && Math.sin(guess.angle*Math.PI/180)<0;
      if (reversed) {
        if (source.currentA!==undefined) source.currentA=-source.currentA;
        else source.voltageV=-source.voltageV;
      }
      const candidate = {...model,source};
      if (validateNetwork(candidate).length) { setMessage(unavailable); return; }
      install({kind:"node",index:node,edit:{model:candidate,selection:{kind:"source"}}});
      return;
    }
    if (kind === "junction") {
      const node = !props.empty ? firstTerminal(screen(guess.center),true) : null;
      if (node === null) { setMessage(unavailable); return; }
      saveInk();
      arm({bridgeFrom:node,wire:true});
      return;
    }
    if (kind === "ground") {
      const node = !props.empty ? firstTerminal(screen(guess.center),true) : null;
      const target = node === model.sections.length && model.load.kind === "open" ? options("wire").find(item=>item.kind==="end") : undefined;
      if (!target) { setMessage(unavailable); return; }
      install(target,{...layout,"@ground-load":1});
      return;
    }
    // A stroke's ends are only electrical terminals when the recognizer identified them.
    const from = !props.empty&&guess.terminals ? firstTerminal(screen(guess.terminals[0]),true) : null;
    const to = !props.empty&&guess.terminals ? firstTerminal(screen(guess.terminals[1]),true) : null;
    const bridge = isTwoTerminal(kind) && from !== null && to !== null && from !== to
      ? options({bridgeFrom:from,part:kind}).find(item=>item.kind==="node"&&item.index===to) : undefined;
    if (isTwoTerminal(kind) && from!==null && to!==null && !bridge) { setMessage(unavailable); return; }
    const target = props.empty || kind==="wire" ? undefined : targetAt(screen(guess.center),options(kind),false);
    const compatibleTarget = bridge ?? (target && (target.kind !== "end" || model.load.kind === "open") ? target : undefined);
    if (compatibleTarget) {
      install(compatibleTarget);
      return;
    }
    const id = freeId();
    const rotation = ((Math.round(guess.angle/90)*90%360)+360)%360;
    setCamera(view);
    props.onSketchCommit(model,{kind:"detached",id},layout,[...props.detached,{id,kind,...guess.center,rotation}],ink,kind);
    finishInk();
  }
  function start(event: PointerEvent<Element>, next?: Tool, selection?: Selection) {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!next || selection) {
      touches.current.set(event.pointerId, point);
      if (touches.current.size > 1) {
        gesture.current = null;
        pinching.current = true;
        cancelAnimationFrame(frame.current);
        setPreview(null);
        setGeometry(null);
        setGroupPreview(null);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (gesture.current || pinching.current) return;
    suppress.current = false;
    gesture.current = { additive:event.shiftKey,id: event.pointerId, start: point, tool: next, selection, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function geometryAt(item:Selection,start:Point,point:Point){
    const key=layoutKey(item);
    const draft=item.kind==="detached"?props.detached.find(part=>part.id===item.id):undefined;
    const base=draft?.y??layout[key]??(item.kind==="line"?axis:82);
    const x=draft?.x??layout[horizontalKey(key)]??baseX(key);
    const dx=(point.x-start.x)/view.zoom,dy=(point.y-start.y)/view.zoom;
    const grid=(value:number)=>snap?Math.round(value/16)*16:value;
    return {key,y:grid(base+dy),dx:grid(x+dx)};
  }
  function groupLayout(item:Selection,start:Point,point:Point){
    const items=group.some(member=>layoutKey(member)===layoutKey(item))?group:[item];
    const next={...layout};
    for(const member of items){
      if(member.kind==="detached")continue;
      const geometry=geometryAt(member,start,point);
      next[geometry.key]=geometry.y;next[horizontalKey(geometry.key)]=geometry.dx;
    }
    return next;
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const point = { x: event.clientX, y: event.clientY };
    const prior = touches.current.get(event.pointerId);
    if (prior && pinching.current) {
      const other = [...touches.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      touches.current.set(event.pointerId, point);
      if (other) {
        const middle = (a: Point) => local({ x: (a.x + other.x) / 2, y: (a.y + other.y) / 2 });
        zoomAt(middle(prior), distance(point, other) / Math.max(1, distance(prior, other)), middle(point));
      }
      return;
    }
    if (prior) touches.current.set(event.pointerId, point);
    const current = gesture.current;
    if(!current){
      if(armed&&event.pointerType==="mouse"){
        const hit=document.elementFromPoint(point.x,point.y);
        setCursor(hit&&canvas.current?.contains(hit)?point:null);
        setHovered(targetAt(point,targets,false)??null);
      }
      return;
    }
    if(current.id !== event.pointerId || !current.moved && distance(current.start, point) < 7)return;
    const first = !current.moved;
    current.moved = true;
    if (current.tool) {
      const next = current.tool;
      const touch = event.pointerType === "touch";
      const options = props.empty?[]:tool === next ? targets : placementTargets(model, next);
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setPreview({ tool: next, point, touch, target: targetAt(point, options, touch) }));
    } else if(current.selection){
      if(first)setCamera(view);
      setGeometry(geometryAt(current.selection,current.start,point));
      if(group.length>1&&group.some(item=>layoutKey(item)===layoutKey(current.selection!)))setGroupPreview(groupLayout(current.selection,current.start,point));
    } else if (prior && !current.selection) {
      const previous = first ? current.start : prior;
      setCamera(value => ({ ...(value ?? view), x: (value ?? view).x + point.x - previous.x, y: (value ?? view).y + point.y - previous.y }));
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>, canceled = false) {
    touches.current.delete(event.pointerId);
    if (pinching.current) {
      if (!touches.current.size) pinching.current = false;
      return;
    }
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    setPreview(null);
    setGeometry(null);
    setGroupPreview(null);
    suppress.current = current.moved || canceled;
    if (canceled) return;
    if (current.moved && current.tool) {
      const options = props.empty?[]:tool === current.tool ? targets : placementTargets(model, current.tool);
      const point={x:event.clientX,y:event.clientY};
      const index=options.length&&isTwoTerminal(current.tool)?firstTerminal(point,event.pointerType==="touch"):null;
      if(index!==null&&isTwoTerminal(current.tool)&&!targetAt(point,options,event.pointerType==="touch")?.edit){arm({bridgeFrom:index,part:current.tool});return;}
      const target=targetAt(point,options,event.pointerType==="touch");
      if(place(target,{x:event.clientX,y:event.clientY},current.tool,true)&&repeat&&!attaching&&typeof current.tool==="string")arm(current.tool);
    } else if(current.moved&&current.selection){
      const bounds=canvas.current?.getBoundingClientRect();
      if(bounds&&event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom){
        const next=geometryAt(current.selection,current.start,{x:event.clientX,y:event.clientY});
        if(current.selection.kind==="detached"){
          props.onDetached(props.detached.map(part=>part.id===next.key?{...part,x:next.dx,y:next.y}:part));
        }else commitLayout(groupLayout(current.selection,current.start,{x:event.clientX,y:event.clientY}));
      }
    } else if(!current.moved&&armed){
      const point={x:event.clientX,y:event.clientY};
      const index=bridgeTool?firstTerminal(point,event.pointerType==="touch"):null;
      if(index!==null&&bridgeTool){arm({bridgeFrom:index,...bridgeTool},attaching);return;}
      place(targetAt(point,targets,event.pointerType==="touch"),point);
    } else if (!current.moved && current.selection) {
      selectObject(current.selection,current.additive);
    } else if(!current.moved&&!current.tool){
      onSelect(null);setGroup([]);setTray(null);
    }
  }
  function center() {
    if (!selected) return;
    if(selected.kind==="detached"){
      const part=props.detached.find(part=>part.id===selected.id)!;
      setCamera({...view,x:viewport.width/2-part.x*view.zoom,y:viewport.height/2-part.y*view.zoom});
      return;
    }
    const index = selected.kind === "line" ? model.sections.findIndex(s => s.id === selected.id) :
      selected.kind === "shunt" ? selected.node : selected.kind === "source" ? model.source.node :
      selected.kind === "contact" ? [...model.series??[],...model.branches??[]].find(link=>link.id===selected.id)!.from : model.sections.length;
    const x = nodeX(index) + (selected.kind === "line" ? 85 : selected.kind === "load" ? 62+(layout["@load-x"]??82)-82 : 0);
    const key=layoutKey(selected);
    const dx=selected.kind==="load"?0:positionX(key);
    const y=110+positionY(key,selected.kind==="line"?axis:82)-(selected.kind==="line"?axis:82);
    setCamera({...view,x:viewport.width/2-(x+dx)*view.zoom,y:viewport.height/2-y*view.zoom});
  }
  function toggle(next: typeof tray) {
    cancel();
    if (drawing) cancelInk();
    setTray(tray === next ? null : next);
  }
  const selectedElement=useRef<SVGGElement|null>(null);
  const [anchor,setAnchor]=useState<Point|null>(null);
  function selectObject(selection:Selection,additive=false){
    if(measuring&&selection.kind==="line"){
      props.onProbe(model.sections.findIndex(section=>section.id===selection.id));
      setMeasuring(false);
      return;
    }
    if(additive&&selection.kind!=="detached"){
      setGroup(items=>{
        const current=items.length?items:selected&&selected.kind!=="detached"?[selected]:[];
        return current.some(item=>layoutKey(item)===layoutKey(selection))?current.filter(item=>layoutKey(item)!==layoutKey(selection)):[...current,selection];
      });
    }else setGroup([]);
    onSelect(selection);
    if(timing.current)timing.current.open=false;
    setTray("inspect");
  }
  function selectedPart(){
    if(!selected)return;
    const part=selected.kind==="detached"?props.detached.find(item=>item.id===selected.id)?.kind:
      selected.kind==="line"?"line":selected.kind==="source"?"source":selected.kind==="shunt"?"r":
      selected.kind==="contact"?[...model.series??[],...model.branches??[]].find(item=>item.id===selected.id):findLoad(model.load,selected.id??model.load.id)?.kind;
    if(!part)return;
    const kind=typeof part==="object"?contactKind(part):part;
    const branch=typeof part==="object"?part:undefined;
    const draft=selected.kind==="detached"?props.detached.find(item=>item.id===selected.id):undefined;
    const load=selected.kind==="load"?findLoad(model.load,selected.id??model.load.id):undefined;
    const shunt=selected.kind==="shunt"?model.shunts.find(item=>item.node===selected.node):undefined;
    const template:DetachedPart['template']=shunt?{resistanceOhm:shunt.resistanceOhm}:branch?{resistanceOhm:branch.resistanceOhm,component:branch.component,switch:branch.switch}:draft?.template??(
      load?.kind==="r"?{resistanceOhm:load.value}:load?.kind==="l"||load?.kind==="c"?{component:{kind:load.kind,value:load.value!,initial:load.initial}}:
      load?.kind==="diode"?{component:{kind:"diode" as const,diode:load.diode!}}:undefined);
    if(parts.some(row=>(row as readonly string[]).includes(kind)))return {kind:kind as Part,rotation:rotation(selected),template};
  }
  function copy(){const part=selectedPart();if(part)clipboard.current=part;}
  function paste(){
    if(!clipboard.current)return;
    const id=freeId();
    const part=clipboard.current;
    props.onDetached([...props.detached,{id,...part,x:(viewport.width/2-view.x)/view.zoom,y:(viewport.height*.67-view.y)/view.zoom}]);
    selectObject({kind:"detached",id});
  }
  function freeId(){
    let index=1;
    while(props.detached.some(part=>part.id==="draft-"+index))index++;
    return "draft-"+index;
  }
  function rotate(){
    if(!selected)return;
    const key=rotationKey(selected);
    commitLayout({...layout,[key]:(rotation(selected)+90)%360});
  }
  useEffect(()=>{
    const element=selectedElement.current,field=canvas.current;
    if(!selected||!element||!field){setAnchor(null);return;}
    const area=field.getBoundingClientRect(),hit=element.querySelector(".network-svg-hit")?.getBoundingClientRect()??element.getBoundingClientRect();
    setAnchor({x:Math.max(50,Math.min(area.width-50,hit.left+hit.width/2-area.left)),y:Math.max(55,hit.top-area.top-44)});
  },[selected,view.x,view.y,view.zoom,layout]);
  useEffect(()=>{
    function shortcuts(event:KeyboardEvent){
      if(armed||clearDialog.current?.open||event.altKey||
        (event.target as Element|null)?.closest("input,select,textarea,[contenteditable]"))return;
      const key=event.key.toLowerCase();
      const historyShortcut=(event.ctrlKey||event.metaKey)&&(key==="z"||key==="y");
      if(drawing&&(editingMark===null||!historyShortcut))return;
      if(event.ctrlKey||event.metaKey){
        if(key==="c"&&selected){event.preventDefault();copy();}
        if(key==="v"&&clipboard.current){event.preventDefault();paste();}
        if(historyShortcut){
          event.preventDefault();
          cancel();
          cancelInk();
          if(key==="y"||event.shiftKey)props.redo();else props.undo();
        }
        return;
      }
      if(!selected)return;
      if(key==="delete"){event.preventDefault();props.onDelete(selected);}
      if(event.key.toLowerCase()==="r"){event.preventDefault();rotate();}
      if(event.key==="Escape"){onSelect(null);setGroup([]);setTray(null);}
    }
    window.addEventListener("keydown",shortcuts);
    return()=>window.removeEventListener("keydown",shortcuts);
  });
  function object(selection: Selection, label: string) {
    const active=!!selected&&layoutKey(selected)===layoutKey(selection);
    return {
      'data-group-selected':group.some(member=>layoutKey(member)===layoutKey(selection))||undefined,
      ref:active?(element:SVGGElement|null)=>{selectedElement.current=element;}:undefined,
      role: "button",
      tabIndex: tool || drawing ? -1 : 0,
      "aria-label": label,
      "aria-pressed": selected?.kind === selection.kind &&
        (selection.kind !== "line" || selected.kind === "line" && selected.id === selection.id) &&
        (selection.kind !== "shunt" || selected.kind === "shunt" && selected.node === selection.node) &&
        (selection.kind !== "contact" || selected.kind === "contact" && selected.id === selection.id) &&
        (selection.kind !== "detached" || selected.kind === "detached" && selected.id === selection.id) &&
        (selection.kind !== "load" || selected.kind === "load" && selected.id === selection.id),
      onPointerDown: (event: PointerEvent<SVGGElement>) => {
        if (armed || drawing) return;
        event.stopPropagation();
        if(event.altKey){
          const branch=selection.kind==="contact"?model.branches?.find(link=>link.id===selection.id):undefined;
          const item=selection.kind==="load"?findLoad(model.load,selection.id??model.load.id):undefined;
          const next:Tool|undefined=branch&&branch.to!=="reference"?{bridgeFrom:branch.from,id:branch.id,wire:branch.resistanceOhm===undefined}:
            selection.kind==="contact"?{relocate:selection.id}:item&&isTwoTerminal(item.kind as Tool)&&item.kind!=="switch"?{moveLoad:item.id}:
            selection.kind==="line"||selection.kind==="shunt"||selection.kind==="source"?{move:selection}:undefined;
          if(next){start(event,next,selection);return;}
        }
        start(event,undefined,selection);
      },
      onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectObject(selection,event.shiftKey);
      },
    };
  }
  const number = (value: number) => formatEngineeringNumber(value, language);
  const rotation=(item:Selection)=>layout[rotationKey(item)]??(item.kind==="detached"?props.detached.find(part=>part.id===item.id)?.rotation??0:0);
  const positionX=(key:string)=>(drawnLayout[horizontalKey(key)]??baseX(key))-baseX(key);
  const baseEnd=nodeX(model.sections.length)+62;
  const nodeAnchor = junctionX;
  const source = nodeAnchor(model.source.node);
  const load = props.load;
  const symbol=(next:Tool):Part|"shunt"=>{
    if(typeof next==="string")return next==="open"||next==="matched"?"r":next;
    if("move" in next)return next.move.kind;
    if("install" in next)return next.install.kind;
    if("bridgeFrom" in next){
      const contact=[...model.series??[],...model.branches??[]].find(link=>link.id===next.id);
      return contact?contactKind(contact):next.part??(next.wire?"wire":"r");
    }
    if("moveLoad" in next)return (findLoad(model.load,next.moveLoad)?.kind??"r") as Part;
    const contact=[...model.series??[],...model.branches??[]].find(link=>link.id===next.relocate);
    return contact?contactKind(contact):"r";
  };
  const positionY=(key:string,base:number)=>drawnLayout[key]??base;
  function commitLayout(next: Layout) {
    if (!traceLayout(next,model,model.load,props.empty)) {
      setMessage(explain("unroutable-layout"));
      return;
    }
    setMessage("");
    props.onLayout(next);
  }
  const liveLayout = groupPreview ?? (geometry ? {...layout,[geometry.key]:geometry.y,[horizontalKey(geometry.key)]:geometry.dx} : layout);
  const savedRoutes=useMemo(()=>traceLayout(layout,model,model.load,props.empty),[layout,model,props.empty]);
  const previewRoutes=liveLayout!==layout?traceLayout(liveLayout,model,model.load,props.empty):savedRoutes;
  const drawnLayout=previewRoutes?liveLayout:layout;
  const routes=previewRoutes??savedRoutes;
  const visibleLoad=routes?.load;
  const end=baseEnd+positionX("@load");
  const sourceX=source+positionX("@source");
  const sourceY=164+positionY("@source",82)-82;
  const sourceAngle=-90+rotation({kind:"source"}),sourceA=turned(sourceX,sourceY,-23,sourceAngle),sourceB=turned(sourceX,sourceY,23,sourceAngle);
  const sourceR=turned(sourceX,sourceY,49,sourceAngle);
  const loadY=148.5+positionY("@load",82)-82;
  const loadAngle=90+rotation({kind:"load"}),loadA=turned(end,loadY,-23,loadAngle),loadB=turned(end,loadY,23,loadAngle);
  const visibleX = visibleLoad?.x ?? end, visibleY = visibleLoad?.y ?? loadY;
  const visibleAngle = visibleLoad?.angle ?? loadAngle;
  const visibleA = visibleLoad ? turned(visibleX,visibleY,-23,visibleAngle) : loadA;
  const visibleB = visibleLoad ? turned(visibleX,visibleY,23,visibleAngle) : loadB;
  const detached=selected?.kind==="detached"?props.detached.find(part=>part.id===selected.id):undefined;
  const bridgeTool=!props.empty&&armed&&(isTwoTerminal(armed)?{part:armed}:typeof armed==="object"&&"relocate" in armed?{id:armed.relocate}:
   typeof armed==="object"&&"install" in armed&&isTwoTerminal(armed.install.kind)?{part:armed.install.kind,template:armed.install.template}:null);
  const active = preview ? preview.target : hovered;
  const selectedX=detached?.x??(selected?.kind==="line"?nodeX(model.sections.findIndex(line=>line.id===selected.id))+85:
    selected?.kind==="source"?source:selected?.kind==="shunt"?nodeAnchor(selected.node):
    selected?.kind==="contact"?nodeX([...model.series??[],...model.branches??[]].find(link=>link.id===selected.id)!.from):end);
  const desktopInspectorLeft=selectedX*view.zoom+view.x<viewport.width/2?undefined:8;
  const snapPoint = active?.edit ? targetPoint(active) : null;
  const canvasBounds = snapPoint ? canvas.current?.getBoundingClientRect() : null;
  const ghost = snapPoint && canvasBounds ? { x: snapPoint.x + canvasBounds.left, y: snapPoint.y + canvasBounds.top } : preview?.point??cursor;
  return <ZigzagResistors.Provider value={zigzag}><div className="network-workspace" onPointerMove={move} onPointerUp={event => finish(event)}
    onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}>
    <div className="network-canvas" data-drawing-ink={drawing||undefined}>
      <div className="network-scheme-tools" role="group" aria-label={t("Управление конструктором", "Керування конструктором")}>
        <button type="button" aria-expanded={tray==="parts"} onClick={()=>{if(drawing)cancelInk();if(tray==="parts")setTray(null);else setTray("parts");}}>{t("Элементы","Елементи")}</button>
        <button type="button" aria-label={t("Рисовать схему","Малювати схему")} title={t("Рисовать схему","Малювати схему")} aria-pressed={drawing}
          onClick={()=>{cancel();setTray(null);if(drawing)cancelInk();else setDrawing(true);}}><Pencil size={18}/></button>
        {(armed||measuring)&&<button type="button" className="network-active-tool" onClick={()=>{cancel();setTray(null);}} aria-label={t("Отменить размещение","Скасувати розміщення")}>
          {measuring?t("Щуп","Щуп"):typeof armed==="string"?labels[armed]:t("Размещение","Розміщення")} <X size={15}/>
        </button>}
        <button type="button" aria-label={t("Отменить изменение","Скасувати зміну")} disabled={!props.canUndo} onClick={()=>{cancel();cancelInk();props.undo();}}><Undo2 size={18}/></button>
        <button type="button" aria-label={t("Повторить изменение","Повторити зміну")} disabled={!props.canRedo} onClick={()=>{cancel();cancelInk();props.redo();}}><Redo2 size={18}/></button>
        <button type="button" aria-label={t("Очистить схему","Очистити схему")} title={t("Очистить схему","Очистити схему")}
          disabled={props.empty&&!props.detached.length&&!props.ink.length} onClick={()=>clearDialog.current?.showModal()}><Trash2 size={18}/></button>
        <button type="button" aria-label={t("Ещё инструменты и справка","Інші інструменти й довідка")} aria-expanded={tray==="help"} onClick={()=>toggle("help")}><CircleHelp size={18}/></button>
      </div>
      <dialog className="network-clear-dialog" ref={clearDialog} onCancel={()=>clearDialog.current?.close()}>
        <p>{t("Очистить всю схему? Все размещённые элементы и соединения будут удалены.","Очистити всю схему? Усі розміщені елементи та з’єднання буде видалено.")}</p>
        <div className="network-buttons">
          <button type="button" autoFocus onClick={()=>clearDialog.current?.close()}>{t("Отмена","Скасувати")}</button>
          <button type="button" onClick={()=>{clearDialog.current?.close();cancel();setTray(null);cancelInk();setCamera(null);props.onClear();}}>{t("Очистить","Очистити")}</button>
        </div>
      </dialog>
      {selected&&anchor&&!drawing&&!armed&&tray!=="parts"&&tray!=="help"&&<div className="network-object-actions" style={{left:anchor.x,top:anchor.y}}>
        <button type="button" aria-label={t("Повернуть","Повернути")} title={t("Повернуть на 90°","Повернути на 90°")} onClick={rotate}><RotateCw size={18}/></button>
        <button type="button" aria-label={t("Параметры","Параметри")} onClick={()=>setTray(tray==="inspect"?null:"inspect")}><Settings size={18}/></button>
      </div>}
      {drawing&&<div className="network-ink-tools" role="group" aria-label={t("Рукописный ввод","Рукописне введення")}>
        {!ink.length&&<small>{t("Для линии передачи отметьте два конца и проведите между ними штрих.", "Для лінії передачі позначте два кінці й проведіть між ними штрих.")}</small>}
        {!!ink.length&&<>
          {!!sketchKinds.length&&<select aria-label={t("Распознанный элемент","Розпізнаний елемент")} value={sketchKind??""}
            onChange={event=>setCorrection(event.target.value as SketchKind)}>
            <option value="" disabled>{t("Дорисуйте или выберите тип","Домалюйте або оберіть тип")}</option>
            {sketchKinds.map(kind=><option key={kind} value={kind}>{sketchLabels[kind]??labels[kind as Part]}</option>)}
          </select>}
          <button type="button" disabled={!sketchKind&&!(editingMark!==null&&!savedLink)}
            onPointerDown={event=>{
              if(!event.isPrimary||event.button!==0)return;
              inkConfirmUsesTouch.current=event.pointerType==="touch";
              inkConfirmTouch.current=inkConfirmUsesTouch.current
                ? {id:event.pointerId,start:{x:event.clientX,y:event.clientY}} : null;
            }}
            onPointerMove={event=>{
              const touch=inkConfirmTouch.current;
              if(touch?.id===event.pointerId&&distance(touch.start,{x:event.clientX,y:event.clientY})>12)inkConfirmTouch.current=null;
            }}
            onPointerCancel={event=>{if(inkConfirmTouch.current?.id===event.pointerId)inkConfirmTouch.current=null;}}
            onLostPointerCapture={event=>{if(inkConfirmTouch.current?.id===event.pointerId)inkConfirmTouch.current=null;}}
            onPointerUp={event=>{
              const touch=inkConfirmTouch.current;
              if(touch?.id!==event.pointerId)return;
              inkConfirmTouch.current=null;
              const point={x:event.clientX,y:event.clientY};
              if(distance(touch.start,point)>12||
                !event.currentTarget.contains(document.elementFromPoint(point.x,point.y)))return;
              // Chromium may omit the first click after a drawing gesture.
              acceptInk(sketchKind??"wire");
            }}
            onClick={event=>{
              if(inkConfirmUsesTouch.current&&event.detail>0)return;
              acceptInk(sketchKind??"wire");
            }}>{editingMark===null
            ? t("Вставить","Вставити")
            : t("Сохранить правку","Зберегти правку")}</button>
          <button type="button" onClick={()=>{setInk(ink.slice(0,-1));setCorrection("");setMessage("");}}>{t("Убрать штрих","Прибрати штрих")}</button>
        </>}
        {editingMark!==null&&<button type="button" onClick={()=>{cancelInk();setMessage("");}}>
          {t("Отменить правку штриха","Скасувати правку штриха")}
        </button>}
      </div>}
      <svg ref={canvas} className="network-schematic" data-placing={!!armed||undefined} data-network-canvas aria-label={t("Электрическая схема", "Електрична схема")}
        onPointerLeave={()=>{setCursor(null);setHovered(null);}}
        onPointerMove={event=>{if(drawing&&!pinching.current)pointerInk.onPointerMove(event);}}
        onPointerUp={event=>{if(drawing&&!pinching.current)pointerInk.onPointerUp(event);}}
        onPointerCancel={pointerInk.onPointerCancel} onLostPointerCapture={pointerInk.onLostPointerCapture}
        onPointerDown={event => {
          if (drawing) {
            if (event.pointerType === "touch") {
              touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
              if (touches.current.size > 1) {
                pointerInk.cancel();
                pinching.current=true;
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
            }
            if (!pinching.current) pointerInk.onPointerDown(event);
            return;
          }
          if ((event.target as Element).closest("[data-placement]")) {
            suppress.current = false;
            return;
          }
          start(event);
        }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`} className="network-schematic-drawing">
          {!props.empty&&<>
          <path d={`M${nodeX(0) - 45} 213H${baseEnd}`} />
          <path d="M103 29h50l-7-4m7 4l-7 4" /><text x="124" y="22">I</text>
          {model.sections.map((section, index) => {
            const anchor=nodeX(index), x=anchor+positionX(section.id), y=positionY(section.id,axis);
            const angle=rotation({kind:"line",id:section.id});
            const span=lineHalfSpan(drawnLayout,section.id);
            const a=turned(x+85,y,-span,angle),b=turned(x+85,y,span,angle);
            const left=anchor+(model.series?.some(link=>link.from===index)?15:0),right=anchor+170-(model.series?.some(link=>link.from===index+1)?15:0);
            const links=angle? `${routed(left,axis,a,y+(a.y>y?64:-64))} ${routed(right,axis,b,y+(b.y<y?-64:64))}`:
              `${wire(left,axis,a.x,a.y)} ${wire(right,axis,b.x,b.y)}`;
            return <g key={section.id} data-line-section={section.id} {...object({ kind: "line", id: section.id }, section.id + " · " + t("линия", "лінія"))}>
              <path data-component-leads={section.id} d={routes?.parts.get(section.id)?.join(" ")??links} />
              <path d={`M${x+85-span} ${y}h${2*span}`} className="network-transmission-stroke" transform={angle?`rotate(${angle} ${x+85} ${y})`:undefined}/>
              <rect className="network-svg-hit" x={x + 84 - span} y={y - 30} width={2*span+2} height="60" transform={angle?`rotate(${angle} ${x+85} ${y})`:undefined}/>
              <text x={x + 34} y={y - 18}>{section.id} · {number(section.impedanceOhm)} Ω</text>
              {view.zoom >= .4 && <text x={x + 36} y={y + 24}>{number(section.lengthM / 1000)} km</text>}
            </g>;
          })}
          {Array.from({ length: model.sections.length + 1 }, (_, index) =>
            <g key={index}><circle className="network-junction" cx={nodeX(index)-(model.series?.some(link=>link.from===index)?15:0)} cy={axis} r="3" />
              <text x={nodeX(index) - 4} y={axis - 17}>{index}</text></g>)}
          <g {...object({ kind: "source" }, t("Источник", "Джерело"))}>
            <path data-component-leads="@source" d={routes?.parts.get("@source")?.join(" ")??`${wire(source,axis,model.source.resistanceOhm>0?sourceR.x:sourceB.x,model.source.resistanceOhm>0?sourceR.y:sourceB.y,true)} ${wire(source,213,sourceA.x,sourceA.y,true)}`}/>
            {model.source.resistanceOhm>0&&<g transform={`translate(${sourceX} ${sourceY}) rotate(${sourceAngle})`}><ResistorGlyph x={23} y={0} scale={.55} terminalSpan={26/.55}/></g>}
            <g transform={`translate(${sourceX} ${sourceY}) rotate(${sourceAngle})`}>{model.source.currentA===undefined?<Glyph kind="source" reverse={model.source.voltageV<0}/>:<g transform={model.source.currentA<0?"rotate(-90)":"rotate(90)"}><path d="M0-23V-15M0 15V23"/><SourceGlyph x={0} y={0} scale={15/22} current/></g>}</g>
            <rect className="network-svg-hit" x={sourceX-22} y={sourceY-26} width="50" height="53"/>
            <text x={sourceX+19} y={sourceY+3}>{model.source.currentA===undefined?"E = "+number(Math.abs(model.source.voltageV))+" V":"I = "+number(Math.abs(model.source.currentA))+" A"}</text>
            {model.source.resistanceOhm>0&&<text x={sourceX+19} y={sourceY+19}>Rₛ = {number(model.source.resistanceOhm)} Ω</text>}
          </g>
          {load.children?.length?<g>
            <path d={routes?.parts.get("@load")?.join(" ")??`M${nodeX(model.sections.length)} ${axis}H${end}V${loadY-48} ${wire(baseEnd,213,end,loadY+48,true)}`}/>
            <LoadCircuit routes={routes?.compound} load={load} language={language} rotation={id=>rotation({kind:"load",id})} displacement={id=>{
                const key="@load-"+id;
                return {x:positionX(key),y:positionY(key,82)-82};
              }} onObject={(id,label)=>object({kind:"load",id},label) as React.SVGProps<SVGGElement>}
              region={{x:end-58,y:loadY-48,width:116,height:96}}/>
          </g>:<g {...object({ kind: "load" }, t("Нагрузка", "Навантаження"))}>
            {visibleLoad ? visibleLoad.paths.map((d,index) => <path key={index} data-load-lead={index} d={d}/>) :
              <path d={`M${nodeX(model.sections.length)} ${axis}H${loadA.x}V${loadA.y} ${wire(baseEnd,213,loadB.x,loadB.y,true)}`}/>}
            {load.kind==="open"?<><circle cx={visibleA.x} cy={visibleA.y} r="3"/><circle cx={visibleB.x} cy={visibleB.y} r="3"/></>:
              <g transform={`translate(${visibleX} ${visibleY}) rotate(${visibleAngle})`}><Glyph kind={load.kind as Part} reverse={load.diode?.reversed}/></g>}
            {load.kind==="wire"&&layout["@ground-load"]===1&&<path data-symbol="ground"
              d={`M ${baseEnd} 213v7m-12 0h24m-20 5h16m-12 5h8`}/>}
            <rect className="network-svg-hit" x={visibleX-22} y={visibleY-27} width="48" height="54"/>
            <text x={visibleLoad?.label.x??end+16} y={visibleLoad?.label.y??loadY+4}>{load.kind==="r"?number(load.value!)+" Ω":
              load.kind==="c"?number(load.value!*1e6)+" µF":load.kind==="l"?number(load.value!*1e3)+" mH":load.kind==="diode"?"VD":""}</text>
          </g>}
          {!drawing&&(bridgeTool||!armed)&&Array.from({length:model.sections.length+1},(_,index)=>
            <g key={index} role="button" tabIndex={0} aria-label={t("Начать перемычку от узла ","Почати перемичку від вузла ")+index}
              onPointerDown={event=>{if(!drawing)event.stopPropagation();}} onClick={()=>!drawing&&arm({bridgeFrom:index,...(bridgeTool??{wire:true})},attaching)}
              onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();arm({bridgeFrom:index,...(bridgeTool??{wire:true})},attaching);}}}>
              <circle className="network-svg-hit" cx={nodeAnchor(index)} cy={axis+(bridgeTool?31:0)} r={bridgeTool?22:12}/>
              {bridgeTool&&<><circle className="network-svg-hit" cx={nodeAnchor(index)} cy={axis} r="12"/>
                <circle cx={nodeAnchor(index)} cy={axis+31} r="12"/><text x={nodeAnchor(index)-6} y={axis+35}>↔</text></>}
            </g>)}
          {armed&&typeof armed==="object"&&"bridgeFrom" in armed&&<circle className="network-first-terminal" cx={nodeAnchor(armed.bridgeFrom)} cy={axis} r="10"/>}
          {([...model.series??[],...model.branches??[]]).map(link=>{
            const series=model.series?.some(item=>item.id===link.id),vertical=link.to==="reference";
            const from=series?nodeX(link.from)-15:nodeAnchor(link.from);
            const to=vertical?from-23:series?nodeX(link.from)+15:nodeAnchor(link.to as number);
            const key="@contact-"+link.id,kind=contactKind(link),index=model.branches?.indexOf(link)??0;
            const x=(vertical?to:(from+to)/2)+positionX(key);
            const y=(series?axis:vertical?160:234+index*9)+positionY(key,82)-82;
            const closed=contactClosed(link,props.time),combined=!!link.switch&&link.resistanceOhm!==undefined;
            const scale=series?15/23:1,a=(combined?-46:-23)*scale,b=23*scale;
            const rotated=rotation({kind:"contact",id:link.id}),angle=(vertical?90:to<from?180:0)+rotated;
            const left=turned(x,y,a,angle),right=turned(x,y,b,angle);
            const label=link.resistanceOhm!==undefined?number(link.resistanceOhm)+" Ω":
              link.component?.kind==="l"?number(link.component.value*1e3)+" mH":
              link.component?.kind==="c"?number(link.component.value*1e6)+" µF":"";
            return <g key={link.id}>
              {routes?.parts.has(key)?<path data-component-leads={link.id} d={routes.parts.get(key)!.join(" ")}/>:rotated?<path d={`${routed(from,axis,left,y+(left.y>y?58:-58))} ${routed(to,vertical?213:axis,right,y+(right.y<y?-58:58))}`} className={series||vertical?undefined:"network-bridge-wire"}/>:
                vertical?<path d={`${wire(from,axis,left.x,left.y,true)} ${wire(to,213,right.x,right.y,true)}`}/>:
                <path d={`${wire(from,axis,left.x,left.y)} ${wire(to,axis,right.x,right.y)}`} className={series?undefined:"network-bridge-wire"}/>}
              {!series&&<><circle className="network-junction" cx={from} cy={axis} r="3"/><circle className="network-junction" cx={to} cy={vertical?213:axis} r="3"/></>}
              <g {...object({kind:"contact",id:link.id},link.id+" · "+labels[kind])}
                data-contact={link.id} data-closed={link.switch?closed:undefined}>
              <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
                {combined?<><g transform="translate(-34.5) scale(.5)"><Glyph kind="switch" closed={closed}/></g><Glyph kind="r"/></>:
                  <Glyph kind={kind} closed={closed} reverse={link.component?.kind==="diode"&&link.component.diode.reversed}/>}
              </g>
              <rect className="network-svg-hit" x={x-29} y={y-28} width="58" height="56"/>
              <text x={vertical?x+14:x} y={vertical?y+5:y-25} textAnchor={vertical?"start":"middle"}>{link.id}{label?" · "+label:""}</text>
              </g>
            </g>;
          })}
          {model.shunts.map(shunt => {
            const anchor=nodeAnchor(shunt.node),x=anchor-33+positionX("@shunt-"+shunt.node),y=161+positionY("@shunt-"+shunt.node,82)-82;
            const angle=90+rotation({kind:"shunt",node:shunt.node});
            const a=turned(x,y,-15,angle),b=turned(x,y,15,angle);
            return <g key={shunt.node} {...object({ kind: "shunt", node: shunt.node }, labels.shunt + " · " + shunt.node)}>
              <path data-component-leads={`shunt-${shunt.node}`} d={routes?.parts.get("@shunt-"+shunt.node)?.join(" ")??`${wire(anchor,axis,a.x,a.y,true)} ${wire(anchor-33,213,b.x,b.y,true)}`}/>
              <g transform={`translate(${x} ${y}) rotate(${angle})`}><ResistorGlyph x={-15} y={0} scale={.75} terminalSpan={40}/></g>
              <rect className="network-svg-hit" x={x-21} y={y-25} width="44" height="50"/>
              <text x={x-13} y={y+31}>{number(shunt.resistanceOhm)} Ω</text>
            </g>;
          })}
          </>}
          {props.detached.map(part=>{
            const x=geometry?.key===part.id?geometry.dx:part.x,y=geometry?.key===part.id?geometry.y:part.y;
            return <g key={part.id} data-detached={part.kind} transform={`translate(${x} ${y})`}
              {...object({kind:"detached",id:part.id},labels[part.kind]+" · "+t("не подключён","не під’єднано"))}>
              <rect className="network-svg-hit" x="-26" y="-24" width="52" height="48"/>
              <g transform={`rotate(${rotation({kind:"detached",id:part.id})})`}>
                <Glyph kind={part.kind}/><circle cx="-23" r="3"/><circle cx="23" r="3"/>
              </g>
            </g>;
          })}
          <g className="network-ink" pointerEvents="none" aria-hidden="true">
            {[...(inkArchive?props.ink.filter((_,index)=>index!==editingMark).flat():[]),...ink].map((stroke,index)=>stroke.length===1
              ? <circle key={index} cx={stroke[0].x} cy={stroke[0].y} r={3/view.zoom}/>
              : <polyline key={index} points={stroke.map(({x,y})=>x+","+y).join(" ")}/>)}
            {drawing&&recognition?.kind==="line"&&recognition.terminals&&<line
              x1={recognition.terminals[0].x} y1={recognition.terminals[0].y}
              x2={recognition.terminals[1].x} y2={recognition.terminals[1].y}
              className="network-ink-line-preview"/>}
            <polyline ref={inkPreview}/>
          </g>
        </g>
        {targets.filter(target=>!(target.kind==="node" && target.error==="choose-connection")).map(target => {
          const point = targetPoint(target);
          const snapped = active?.kind === target.kind && active.index === target.index;
          return <g key={target.kind + target.index} transform={`translate(${point.x} ${point.y})`}
            data-placement={target.kind} data-position={target.index} data-allowed={!!target.edit}
            data-snapped={snapped || undefined} role="button" aria-label={name(target)}
            aria-disabled={!target.edit} tabIndex={target.edit && !preview ? 0 : -1}
            onPointerEnter={()=>{if(armed&&!preview)setHovered(target);}}
            onPointerLeave={()=>setHovered(current=>current===target?null:current)}
            onFocus={()=>{if(armed)setHovered(target);}} onBlur={()=>setHovered(null)}
            onClick={event => { if (event.detail === 0 || !suppress.current) place(target); }}
            onKeyDown={event => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              place(target);
            }}>
            <circle r="22" className="network-svg-hit" />
            {target.kind === "node" || target.kind==="joint" ? <circle r={snapped ? 9 : 6} /> :
              target.kind === "span" ? <path d="M0-8 8 0 0 8-8 0Z" /> : <rect x="-7" y="-7" width="14" height="14" rx="2" />}
            {snapped && target.edit && typeof tool==="object" && tool && "bridgeFrom" in tool &&
              <path className="network-connection-preview" d={`M0 0v${145*view.zoom}h${(junctionX(tool.bridgeFrom)-junctionX(target.index))*view.zoom}V0`}/>}
            {snapped && target.edit && (target.kind==="branch"||target.kind==="branch-span") && <path className="network-connection-preview" d={`M0 ${(axis-147)*view.zoom}V${(213-147)*view.zoom}`}/>}
            {snapped && target.edit && (target.kind==="joint"||target.kind==="span") && tool!=="shunt" && tool!=="line" &&
              <g className="network-connection-preview"><path d="M-25 0h17m16 0h17"/>
                {tool&&symbol(tool)==="switch"?<path d="M-8 0l13-8"/>:tool&&symbol(tool)==="wire"?<path d="M-8 0h16"/>:<rect x="-8" y="-4" width="16" height="8"/>}</g>}
            {snapped && target.edit && tool==="shunt" && (target.kind==="span"||target.kind==="node") &&
              <path className="network-connection-preview" d={`M0 0V${(213-axis)*view.zoom}`}/>}
            {snapped && target.edit && (target.kind==="branch"||target.kind==="branch-span"||tool==="shunt") &&
              <><circle r="4" cy={(axis-(target.kind==="branch"||target.kind==="branch-span"?147:axis))*view.zoom}/>
               <circle r="4" cy={(213-(target.kind==="branch"||target.kind==="branch-span"?147:axis))*view.zoom}/></>}
            {snapped && <text y="-16" textAnchor="middle">{zone(target)}</text>}
          </g>;
        })}
      </svg>
      {props.empty&&!drawing&&!armed&&!props.detached.length&&<p className="network-empty-note">{t("Выберите линию в палитре, чтобы начать схему.","Оберіть лінію на палітрі, щоб почати схему.")}</p>}
      <div className="network-camera">
        <button type="button" onClick={() => setCamera(null)} aria-label={t("Показать всю схему", "Показати всю схему")}><Maximize size={18} /></button>
        <button type="button" disabled={!selected} onClick={center} aria-label={t("Центрировать объект", "Центрувати об’єкт")}><Crosshair size={18} /></button>
      </div>
      <div className="network-placement-status" role="status">{active ? active.edit ? name(active) : explain(active.error) : preview ? explain() : message}</div>
    </div>
    {ghost&&(preview||armed)&&<div className="network-drag-ghost" aria-hidden="true" data-invalid={!!active&&!active.edit}
      style={{left:ghost.x,top:Math.min(ghost.y,(preview?.point??cursor??ghost).y)-(preview?.touch?36:20)}}>
       <svg viewBox="-26 -19 52 38" width="42" height="30"><Glyph kind={symbol(preview?.tool??armed!)}/></svg>
    </div>}
    {tray && <div data-dragging={!!preview || undefined} className={`network-tray network-tray-${tray}`} style={tray==="inspect" ? {
      "--inspector-left":desktopInspectorLeft!==undefined?"8px":"auto",
      "--inspector-right":desktopInspectorLeft!==undefined?"auto":"8px",
      ...(visible.inset>0?{bottom:visible.inset+78,maxHeight:Math.max(48,visible.height/2)}:{})
    } as React.CSSProperties : undefined}>
        <button type="button" className="network-tray-close" aria-label={t("Закрыть панель", "Закрити панель")} onClick={() => toggle(null)}><ChevronDown size={18} /></button>
        {tray === "help"&&<div className="network-buttons">
          <label>{t("УГО резисторов","Позначення резисторів")} <select value={zigzag?"ansi":"iec"} onChange={event=>changeNotation(event.target.value==="ansi")}>
            <option value="iec">IEC / ЕСКД</option><option value="ansi">ANSI / IEEE</option>
          </select></label>
          {!!props.ink.length&&<label><input type="checkbox" checked={inkArchive} onChange={event=>setInkArchive(event.target.checked)}/>
            {t("Исходные штрихи","Початкові штрихи")}</label>}
          {inkArchive&&props.ink.map((_,index)=><button key={index} type="button" onClick={()=>reopenInk(index)}>
            {t("Исправить штрих","Виправити штрих")} {index+1}
          </button>)}
        </div>}
        {tray === "parts" && <div className="network-palette">
          <label className="network-repeat"><input type="checkbox" checked={repeat} onChange={event=>setRepeat(event.target.checked)}/>
           {t("Добавлять несколько","Додавати кілька")}</label>
          {parts.map((group,index)=><div key={index}>
            <strong>{[t("Соединения","З’єднання"),t("Компоненты","Компоненти"),t("Возбуждение","Збудження")][index]}</strong>
            <div>{group.map(part=><button type="button" key={part} data-network-tool={part} aria-pressed={armed===part}
              onPointerDown={event=>start(event,part)}
              onClick={event=>{if(event.detail===0||!suppress.current){if(armed===part){cancel();setTray(null);}else arm(part);}}}>
              <svg aria-hidden="true" viewBox="-26 -19 52 38" width="27" height="23"><Glyph kind={part}/></svg>{labels[part]}</button>)}</div>
          </div>)}
          <button type="button" disabled={props.empty} onClick={()=>{cancel();setMeasuring(true);setTray(null);setMessage(t("Выберите линию для измерения.","Оберіть лінію для вимірювання."));}}>{t("Щуп напряжения и тока","Щуп напруги й струму")}</button>
        </div>}
        {tray === "inspect" && (detached ? <div className="network-inspector">
          <strong>{labels[detached.kind]}</strong>
          <small>{t("Не подключён к схеме","Не під’єднано до схеми")}</small>
          <div className="network-buttons">
            <button type="button" onClick={()=>arm(detached.template?{install:detached}:detached.kind,detached.id)}>{t("Подключить","Під’єднати")}</button>
            <button type="button" onClick={()=>{props.onDetached(props.detached.filter(part=>part.id!==detached.id));onSelect(null);setTray(null);}}>{t("Удалить","Видалити")}</button>
          </div>
        </div> : selected ? props.inspector(arm) : <p>{t("Выберите объект на схеме.", "Оберіть об’єкт на схемі.")}</p>)}
        {tray==="inspect"&&selected&&selected.kind!=="detached"&&selected.kind!=="source"&&selectedPart()&&
          <button type="button" onClick={()=>{
            const part=selectedPart();
            if(!part||!anchor)return;
            props.onDetach(selected,{...part,id:freeId(),x:(anchor.x-view.x)/view.zoom,y:(anchor.y+65-view.y)/view.zoom});
          }}>{t("Отсоединить","Від’єднати")}</button>}
        {tray === "help" && <div>
          <div className="network-buttons">{props.tools}</div>
          <label><input type="checkbox" checked={snap} onChange={event=>setSnap(event.target.checked)}/>{t("Привязка к сетке","Прив’язка до сітки")}</label>
          <button type="button" onClick={()=>{props.onLayout(Object.fromEntries(Object.entries(layout).filter(([key])=>key.startsWith("@rot-")||key.startsWith("@span-")||key==="@ground-load")));setCamera(null);}}>{t("Упорядочить схему","Упорядкувати схему")}</button>
          <strong>{t("Как распространяются волны", "Як поширюються хвилі")}</strong>
          <p>{t("Напряжение U = U⁺ + U⁻, ток I = (U⁺ − U⁻) / Z₀. При согласованной нагрузке R = Z₀ отражённая волна отсутствует.",
            "Напруга U = U⁺ + U⁻, струм I = (U⁺ − U⁻) / Z₀. За узгодженого навантаження R = Z₀ відбита хвиля відсутня.")}</p>
          <a href={props.reference} target="_blank" rel="noopener">{t("Открыть справку в новой вкладке", "Відкрити довідку в новій вкладці")}</a>
        </div>}
    </div>}
    <div className="network-dock" style={{ bottom: visible.inset }}>
      <details className="network-timing" ref={timing}>
        <summary>{t("Время","Час")}: {experimentTimeLabel(props.time,language)} <ChevronDown size={14} aria-hidden="true"/></summary>
        <div>{props.timing}</div>
      </details>
      <div className="network-toolbar" role="group" aria-label={t("Управление симуляцией","Керування симуляцією")}>{props.transport}</div>
    </div>
  </div></ZigzagResistors.Provider>;
}
