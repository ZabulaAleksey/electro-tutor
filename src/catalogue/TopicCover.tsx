import "./catalogue.css";
import {withBasePath} from "../site-path";
import {ToolArt,type ToolArtKind} from "../components/ToolCard";
import type {CataloguePanorama} from "./catalog";
export default function TopicCover({kind,panorama}:{kind:ToolArtKind;panorama?:CataloguePanorama}) {
 if(!panorama)return <div className="topic-cover topic-cover-neutral"><ToolArt kind={kind}/></div>;
 return <div className="topic-cover"><img src={withBasePath(`/panoramas/${panorama}-1280.webp`)} srcSet={[640,1280,1920].map(w=>`${withBasePath(`/panoramas/${panorama}-${w}.webp`)} ${w}w`).join(",")} sizes="(max-width:600px) 100vw,50vw" alt="" loading="lazy" decoding="async"/><span><ToolArt kind={kind}/></span></div>;
}
