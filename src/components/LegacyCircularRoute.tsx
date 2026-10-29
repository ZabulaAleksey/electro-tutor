import {useEffect,useState} from "react";
import CircularDiagram from "./CircularDiagram";
import type {Language} from "../types";
export default function LegacyCircularRoute({language}:{language:Language}){const [show,setShow]=useState(false);useEffect(()=>{setShow(Boolean(location.search));},[]);return show?<CircularDiagram language={language}/>:null;}
