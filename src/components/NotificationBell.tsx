"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { kst } from "@/lib/time";
import type { Notification } from "@/lib/types";

type Toast = { id: number; message: string; incidentId: number | null };

export default function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items: Notification[]; unread: number };
    setItems(data.items);
    setUnread(data.unread);
  }, []);

  // 실시간 수신: notifications 테이블에 내 알림이 추가되면 Supabase Realtime이 바로 알려준다.
  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    const channel = supabase.channel(`notifications:${userId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => {
        const n = payload.new as { id: number; incident_id: number | null; message: string };
        const toast = { id: n.id, incidentId: n.incident_id, message: n.message };
        setToasts((t) => [...t, toast]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 6000);
        load();
        router.refresh(); // 보고 있는 화면(목록·상세)을 최신 상태로
      },
    );
    // 로그인 토큰으로 실시간 연결을 인증한 뒤 구독 (RLS: 자기 알림만 수신)
    supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe((status) => status === "SUBSCRIBED" && load());
    });
    // 다른 탭에서 읽음 처리했을 수 있으므로 화면으로 돌아오면 다시 불러온다
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, load, router]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const openItem = async (n: { id: number; incidentId?: number | null; incident_id?: number | null }) => {
    await fetch("/api/notifications", { method: "POST", body: JSON.stringify({ id: n.id }) });
    setOpen(false);
    setToasts((t) => t.filter((x) => x.id !== n.id));
    load();
    const incidentId = n.incidentId ?? n.incident_id;
    if (incidentId) router.push(`/incidents/${incidentId}`);
  };

  const readAll = async () => {
    await fetch("/api/notifications", { method: "POST", body: "{}" });
    load();
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
        aria-label={`알림 ${unread}건`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">알림</span>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs text-blue-600 hover:underline">
                모두 읽음
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">알림이 없습니다.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openItem(n)}
                  className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${n.read_at ? "" : "bg-blue-50/60"}`}
                >
                  <p className={`text-sm ${n.read_at ? "text-slate-500" : "font-medium text-slate-800"}`}>{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{kst(n.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 실시간 팝업 */}
      <div className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => openItem(t)}
            className="animate-[slidein_.25s_ease-out] rounded-xl border border-blue-200 bg-white p-4 text-left shadow-lg hover:bg-blue-50"
          >
            <p className="text-xs font-semibold text-blue-600">새 알림</p>
            <p className="mt-1 text-sm text-slate-700">{t.message}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
