import { useEffect, useRef, useState, type ReactElement } from "react";
import {navigate} from "astro:transitions/client";
import type { Language } from "../types";
import "./useUnsavedChanges.css";

type Options = { dirty: boolean; onSave: () => boolean; language: Language };
export function useUnsavedChanges({ dirty, onSave, language }: Options): ReactElement | null {
  const ru = language === "ru";
  const [pending, setPending] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const restoreFocus=useRef<HTMLElement|null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approvedLeave=useRef(false);
  const current = useRef(onSave); current.current = onSave;
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (!dirty||approvedLeave.current) return; event.preventDefault(); event.returnValue = ""; };
    addEventListener("beforeunload", handler); return () => removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target; const link = target instanceof Element ? target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, location.href);
      if (destination.origin !== location.origin || (destination.pathname === location.pathname && destination.search === location.search)) return;
      event.preventDefault(); restoreFocus.current=document.activeElement as HTMLElement;setSaveError(false); setPending(destination.href);
    };
    document.addEventListener("click", guard, true); return () => document.removeEventListener("click", guard, true);
  }, [dirty]);
  useEffect(()=>{if(!dirty)return;const nav=(window as unknown as {navigation?:EventTarget}).navigation;if(!nav)return;const handler=(event:Event)=>{const e=event as Event & {navigationType?:string;destination?:{url:string}};if(e.navigationType!=="traverse"||!e.cancelable||approvedLeave.current||!e.destination)return;const target=new URL(e.destination.url);if(target.pathname===location.pathname&&target.search===location.search)return;e.preventDefault();restoreFocus.current=document.activeElement as HTMLElement;setPending(target.href);};nav.addEventListener("navigate",handler);return()=>nav.removeEventListener("navigate",handler);},[dirty]);
  useEffect(() => { if (pending) {dialogRef.current?.showModal();} }, [pending]);
  if (!pending) return null;
  const leave = () => {approvedLeave.current=true;void navigate(pending);};
  const saveAndLeave = () => { try { if (current.current()) leave(); else setSaveError(true); } catch { setSaveError(true); } };
  const cancel=()=>{setPending(null);restoreFocus.current?.focus();};
  return <dialog onCancel={cancel} ref={dialogRef} className="unsaved-changes-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-changes-title" aria-describedby="unsaved-changes-description" tabIndex={-1}><div><h2 id="unsaved-changes-title">{ru ? "Сохранить изменения?" : "Зберегти зміни?"}</h2><p id="unsaved-changes-description">{ru ? "На странице есть несохранённые изменения." : "На сторінці є незбережені зміни."}</p>{saveError && <p role="alert">{ru ? "Не удалось сохранить локальные данные." : "Не вдалося зберегти локальні дані."}</p>}<div><button type="button" onClick={saveAndLeave}>{ru ? "Сохранить и уйти" : "Зберегти й перейти"}</button><button type="button" onClick={leave}>{ru ? "Уйти без сохранения" : "Перейти без збереження"}</button><button autoFocus type="button" onClick={cancel}>{ru ? "Остаться" : "Залишитися"}</button></div></div></dialog>;
}
