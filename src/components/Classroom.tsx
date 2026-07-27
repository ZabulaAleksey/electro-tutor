import { useEffect, useRef, useState } from "react";
import "./Classroom.css";
import type { Language } from "../types";

type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  dispose: () => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

const copy = {
  ru: {
    eyebrow: "ОНЛАЙН-ЗАНЯТИЕ", title: "Кабинет занятия",
    lead: "Общая доска, видео, голос, чат и демонстрация экрана — в одной комнате.",
    name: "Ваше имя", namePlaceholder: "Например, Алексей", room: "Код комнаты",
    start: "Войти в кабинет", invite: "Скопировать приглашение", copied: "Ссылка скопирована",
    board: "Открыть доску", leave: "Выйти",
    hint: "Отправьте ученику ссылку-приглашение. Камера и микрофон включаются только после входа.",
    loading: "Подключаем кабинет…",
    error: "Не удалось загрузить видеокабинет. Проверьте интернет и блокировщик рекламы.",
  },
  uk: {
    eyebrow: "ОНЛАЙН-ЗАНЯТТЯ", title: "Кабінет заняття",
    lead: "Спільна дошка, відео, голос, чат і демонстрація екрана — в одній кімнаті.",
    name: "Ваше ім’я", namePlaceholder: "Наприклад, Олексій", room: "Код кімнати",
    start: "Увійти до кабінету", invite: "Скопіювати запрошення", copied: "Посилання скопійовано",
    board: "Відкрити дошку", leave: "Вийти",
    hint: "Надішліть учневі посилання-запрошення. Камера й мікрофон вмикаються лише після входу.",
    loading: "Підключаємо кабінет…",
    error: "Не вдалося завантажити відеокабінет. Перевірте інтернет і блокувальник реклами.",
  },
};

function safeRoom(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
}

function newRoom() {
  return `lesson-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function loadJitsi() {
  return new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();
    const previous = document.querySelector<HTMLScriptElement>("script[data-jitsi-api]");
    if (previous) {
      previous.addEventListener("load", () => resolve(), { once: true });
      previous.addEventListener("error", () => reject(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.jitsiApi = "true";
    script.onload = () => resolve();
    script.onerror = () => reject();
    document.head.append(script);
  });
}

export default function Classroom({ language }: { language: Language }) {
  const t = copy[language];
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<JitsiApi | null>(null);
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialRoom = safeRoom(params.get("room") || "") || newRoom();
    setRoom(initialRoom);
    setName(localStorage.getItem("potential-classroom-name") || "");
    if (!params.get("room")) {
      params.set("room", initialRoom);
      history.replaceState(null, "", `${location.pathname}?${params}`);
    }
    return () => api.current?.dispose();
  }, []);

  const roomUrl = () => {
    const url = new URL(location.href);
    url.searchParams.set("room", room);
    return url.toString();
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
    setLoading(true);
    setNotice("");
    localStorage.setItem("potential-classroom-name", name);
    const params = new URLSearchParams(location.search);
    params.set("room", room);
    history.replaceState(null, "", `${location.pathname}?${params}`);
    try {
      await loadJitsi();
      if (!window.JitsiMeetExternalAPI) throw new Error("Jitsi API unavailable");
      api.current?.dispose();
      api.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: `potential-${room}`,
        parentNode: host.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName: name.trim() || undefined },
        configOverwrite: {
          prejoinPageEnabled: true,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
        },
      });
      setJoined(true);
    } catch {
      setNotice(t.error);
    } finally {
      setLoading(false);
    }
  }

  function leave() {
    api.current?.dispose();
    api.current = null;
    setJoined(false);
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
          <label><span>{t.name}</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} /></label>
          <label><span>{t.room}</span><input value={room} onChange={(e) => setRoom(safeRoom(e.target.value))} /></label>
          {!joined ? (
            <button className="button primary" type="button" onClick={join} disabled={!room || loading}>{loading ? t.loading : t.start}</button>
          ) : (
            <>
              <button className="button primary" type="button" onClick={() => api.current?.executeCommand("toggleWhiteboard")}>✎ {t.board}</button>
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
