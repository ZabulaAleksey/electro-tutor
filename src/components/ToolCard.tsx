import TechnicalThumbnail, {type TechnicalKind} from "../catalogue/TechnicalThumbnail";
import type {ReactNode} from "react";
import { ResistorGlyph, SourceGlyph, SupportGlyph } from "../engineering/symbols";
export default function ToolCard({title,category,href,description,action,children,className="",id}:{title:string;category:string;href?:string;description?:string;action:string;children?:ReactNode;className?:string;id?:string}) {
 const content = <article className={`tool-card ${className}`} data-micro={id}><span className="tool-card-category">{category}</span>{children&&<div className="tool-card-visual">{children}</div>}<h3>{title}</h3>{description&&<p>{description}</p>}<span className={href ? "tool-card-action" : "tool-card-disabled"}>{action}{href ? " →" : ""}</span></article>;
 return href ? <a className="tool-card-link" href={href} aria-label={`${title}: ${action}`}>{content}</a> : content;
}
export type ToolArtKind = "circuit"|"waves"|"phasors"|"fourier"|"science"|"beam"|"ohm"|"kirchhoff"|"mesh"|"nodes"|"thevenin"|"power"|"plot"|"rc"|"rlc"|"three-phase"|"neutral";
export function ToolArt({kind}:{kind:ToolArtKind}) {
  const grid = <g fill="none" stroke="var(--grid-minor)" strokeWidth="1"><path d="M20 30H280M20 65H280M20 100H280M60 15V115M120 15V115M180 15V115M240 15V115"/></g>;
  const art = kind === "neutral" ? <g stroke="var(--grid-major)" fill="none" strokeWidth="1.7"><rect x="62" y="16" width="176" height="98" rx="8"/><path d="M84 42H214M84 62H176M84 82H201"/><circle cx="208" cy="92" r="7"/></g> : kind === "beam" ? <g stroke="var(--ink)" fill="none"><path d="M35 70H265" strokeWidth="3"/><SupportGlyph x={35} y={70} kind="pin" scale={.6} mode="thumbnail"/><SupportGlyph x={265} y={70} kind="roller" scale={.6} mode="thumbnail"/><path d="M150 15V65M145 58L150 65L155 58" stroke="var(--blue)" strokeWidth="2"/><path d="M35 117L150 92L265 117" stroke="var(--violet)" strokeWidth="2"/></g>
    : ["ohm","kirchhoff","mesh","nodes","thevenin","power","plot","rc","rlc","three-phase"].includes(kind) ? <TechnicalThumbnail kind={kind as TechnicalKind}/>
    : kind === "circuit" ? <g stroke="var(--schematic-wire)" fill="none" strokeWidth="2"><path d="M55 50H105M155 50H245V105H55V86M55 50V60"/><ResistorGlyph x={105} y={50} terminalSpan={50} mode="thumbnail"/><SourceGlyph x={55} y={73} scale={13/22} mode="thumbnail"/></g>
    : kind === "phasors" ? <g strokeWidth="2.5"><path d="M150 65V18" stroke="var(--blue)"/><path d="M150 65L110 88" stroke="var(--orange)"/><path d="M150 65L190 88" stroke="var(--violet)"/><circle cx="150" cy="65" r="48" stroke="var(--grid-major)" fill="none" strokeDasharray="3 4"/></g>
    : kind === "fourier" ? <g fill="none"><circle cx="125" cy="65" r="38" stroke="var(--muted)"/><circle cx="163" cy="65" r="17" stroke="var(--muted)"/><path d="M125 65H163L176 54" stroke="var(--orange)" strokeWidth="2"/><path d="M176 54Q220 8 255 70" stroke="var(--blue)" strokeWidth="2"/></g>
    : <path d={kind === "science" ? "M25 105Q150 -60 275 105" : "M20 65Q50 5 80 65T140 65T200 65T260 65"} fill="none" stroke="var(--blue)" strokeWidth="2.5"/>;
  return <svg viewBox="0 0 300 130" aria-hidden="true" data-tool-art={kind} className="tool-card-art">{grid}{art}</svg>;
}
