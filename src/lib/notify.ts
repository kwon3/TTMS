import "server-only";
import { EventEmitter } from "node:events";
import { db } from "./db";

// 실시간 알림용 이벤트 버스. 서버 액션과 SSE 라우트가 서로 다른 번들이어도
// 같은 인스턴스를 쓰도록 globalThis에 보관한다.
const g = globalThis as unknown as { __notifyBus?: EventEmitter };
export const bus: EventEmitter =
  g.__notifyBus ??
  (g.__notifyBus = (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0);
    return e;
  })());

export type NotifyPayload = { id: number; incidentId: number | null; message: string };

/** 사용자들에게 알림을 저장하고 접속 중이면 즉시 전달 */
export function notify(userIds: Iterable<number | null | undefined>, incidentId: number | null, message: string) {
  const sent = new Set<number>();
  const insert = db.prepare("INSERT INTO notifications (user_id, incident_id, message) VALUES (?, ?, ?)");
  for (const uid of userIds) {
    if (!uid || sent.has(uid)) continue;
    sent.add(uid);
    const id = Number(insert.run(uid, incidentId, message).lastInsertRowid);
    bus.emit(`user:${uid}`, { id, incidentId, message } satisfies NotifyPayload);
  }
}

export function adminIds(): number[] {
  return (db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all() as { id: number }[]).map(
    (r) => r.id,
  );
}
