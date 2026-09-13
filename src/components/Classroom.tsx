import { useEffect, useRef, useState } from "react";
import "./Classroom.css";
import type { Language } from "../types";
import { getLocale } from "../i18n";
import { createMeetingProvider } from "../classroom/create-meeting-provider";
import {
  canonicalMeetingUrl,
  disposeMeetingSession,
  hasWhiteboard as sessionHasWhiteboard,
  MEETING_DISPLAY_NAME_MAX_LENGTH,
  MeetingError,
  MeetingJoinGate,
  normalizeMeetingDisplayName,
  type MeetingSession,
} from "../classroom/meeting";

function safeRoom(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
}

function newRoom() {
  return `lesson-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export default function Classroom({ language }: { language: Language }) {
  const t = getLocale(language).classroom;
  const host = useRef<HTMLDivElement>(null);
  const provider = useRef<ReturnType<typeof createMeetingProvider> | null>(null);
  const session = useRef<MeetingSession | null>(null);
  const joinGate = useRef<MeetingJoinGate | null>(null);
  joinGate.current ??= new MeetingJoinGate();
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [hasWhiteboard, setHasWhiteboard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialRoom = safeRoom(params.get("room") || "") || newRoom();
    setRoom(initialRoom);
    try {
      setName(normalizeMeetingDisplayName(localStorage.getItem("potential-classroom-name") || ""));
    } catch {
      setName("");
    }
    const canonicalUrl = canonicalMeetingUrl(location.href, initialRoom);
    history.replaceState(null, "", `${canonicalUrl.pathname}${canonicalUrl.search}`);
    return () => {
      joinGate.current?.invalidate();
      if (session.current) disposeMeetingSession(session.current);
    };
  }, []);

  const roomUrl = () => {
    return canonicalMeetingUrl(location.href, room).toString();
  };

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(roomUrl());
      setNotice(t.copied);
      setTimeout(() => setNotice(""), 2200);
    } catch {
      prompt(t.invite, roomUrl());
    }
  }

  async function join() {
    if (!host.current || !room || loading) return;
    const generation = joinGate.current!.begin();
    setLoading(true);
    setNotice("");
    try {
      const displayName = normalizeMeetingDisplayName(name);
      localStorage.setItem("potential-classroom-name", displayName);
      setName(displayName);
      const canonicalUrl = canonicalMeetingUrl(location.href, room);
      history.replaceState(null, "", `${canonicalUrl.pathname}${canonicalUrl.search}`);
      if (session.current && !disposeMeetingSession(session.current)) {
        throw new MeetingError("dispose-failed");
      }
      session.current = null;
      provider.current ??= createMeetingProvider();
      const joinedSession = await provider.current.join({
        room,
        displayName,
        host: host.current,
      });
      if (!joinGate.current!.accept(generation, joinedSession)) return;
      session.current = joinedSession;
      setHasWhiteboard(sessionHasWhiteboard(joinedSession));
      setJoined(true);
    } catch {
      if (joinGate.current!.isCurrent(generation)) setNotice(t.error);
    } finally {
      if (joinGate.current!.isCurrent(generation)) setLoading(false);
    }
  }

  function leave() {
    joinGate.current!.invalidate();
    if (session.current && !disposeMeetingSession(session.current)) {
      setNotice(t.error);
      return;
    }
    session.current = null;
    setHasWhiteboard(false);
    setJoined(false);
    setLoading(false);
  }

  function openWhiteboard() {
    try {
      session.current?.openWhiteboard();
    } catch {
      setNotice(t.error);
    }
  }

  return (
    <section className="classroom-page">
      <div className="classroom-heading">
        <span className="eyebrow">{t.eyebrow}</span>
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </div>
      <div className="classroom-panel">
        <div className="classroom-controls">
          <label><span>{t.name}</span><input value={name} maxLength={MEETING_DISPLAY_NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value.slice(0, MEETING_DISPLAY_NAME_MAX_LENGTH))} placeholder={t.namePlaceholder} /></label>
          <label><span>{t.room}</span><input value={room} onChange={(e) => setRoom(safeRoom(e.target.value))} /></label>
          {!joined ? (
            <button className="button primary" type="button" onClick={join} disabled={!room || loading}>{loading ? t.loading : t.start}</button>
          ) : (
            <>
              {hasWhiteboard && <button className="button primary" type="button" onClick={openWhiteboard}>✎ {t.board}</button>}
              <button className="button ghost" type="button" onClick={leave}>{t.leave}</button>
            </>
          )}
          <button className="button ghost" type="button" onClick={copyInvite}>⧉ {t.invite}</button>
        </div>
        <p className="classroom-hint">{notice || t.hint}</p>
        <div className={`meeting-frame ${joined ? "is-active" : ""}`} ref={host}>
          {!joined && <div className="meeting-placeholder"><span>∿</span><strong>{t.title}</strong></div>}
        </div>
      </div>
    </section>
  );
}
