import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { RULES } from "../shared/rules.ts";
import type { Action, ChatMessage } from "../shared/types.ts";

/** Live chat shared by everyone in the lobby (lobby and auction screens). */
export function ChatPanel({ chat, act }: { chat: ChatMessage[]; act: (a: Action) => Promise<string | null> }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("ga-chat-hidden") === "1";
    } catch {
      return false;
    }
  });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const last = chat[chat.length - 1]?.id;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last, hidden]);

  const toggle = () => {
    setHidden((h) => {
      try {
        localStorage.setItem("ga-chat-hidden", h ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !h;
    });
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const err = await act({ type: "chat", text });
    setError(err);
    if (!err) setText("");
  };

  return (
    <section className="fa-box fa-chat" aria-label="Live chat" data-testid="chat">
      <header className="fa-chat__head">
        <h2>Live chat</h2>
        <button type="button" className="fa-btn fa-btn--dark fa-btn--sm" onClick={toggle} aria-expanded={!hidden}>
          {hidden ? "Show chat" : "Hide chat"}
        </button>
      </header>
      {!hidden && (
        <>
          <ol className="fa-chat__log" ref={listRef} aria-live="polite">
            {chat.map((c) => (
              <li key={c.id} className={c.system ? "is-system" : undefined}>
                {c.system ? (
                  <span>{c.text}</span>
                ) : (
                  <>
                    <strong style={{ color: c.color }}>{c.name}</strong> <span>{c.text}</span>
                  </>
                )}
              </li>
            ))}
          </ol>
          <form className="fa-chat__form" onSubmit={send}>
            <input aria-label="Chat message" placeholder="Send a message..." maxLength={RULES.chatMax} value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="fa-btn fa-btn--orange" disabled={!text.trim()}>
              Send
            </button>
          </form>
          {error && <p className="ferr small" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
