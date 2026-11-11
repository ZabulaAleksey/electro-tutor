import { useEffect, useState } from "react";
import CircularDiagram from "./CircularDiagram";
import { CIRCULAR_DIAGRAM_DEFAULTS } from "../models/circular-diagram-state";
import { localePath } from "../site-path";
import type { Language } from "../types";

export default function LegacyCircularRoute({ language }: { language: Language }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const legacyQuery = params.has("v") || Object.keys(CIRCULAR_DIAGRAM_DEFAULTS).some(key => params.has(key));
    setShow(location.pathname === localePath(language, "/interactive/") && legacyQuery);
  }, [language]);
  return show ? <CircularDiagram language={language} route="/interactive/" /> : null;
}
