import { useEffect, useState } from "react";
import CircularDiagram from "./CircularDiagram";
import type { Language } from "../types";

export default function LegacyCircularRoute({ language }: { language: Language }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.delete("learningStage");
    setShow(params.size > 0);
  }, []);
  return show ? <CircularDiagram language={language} /> : null;
}
