import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** 로그인 세션(쿠키)을 다루는 클라이언트. 로그인·로그아웃·현재 사용자 확인에만 쓴다. */
export async function createAuthClient() {
  const store = await cookies();
  return createServerClient(URL, ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 담당한다.
        }
      },
    },
  });
}

/**
 * 서버 전용 관리자 클라이언트(service_role). RLS를 우회하므로
 * 권한 확인은 반드시 호출하는 서버 코드에서 한다. 브라우저로 절대 넘기지 않는다.
 */
let adminClient: SupabaseClient | undefined;
export function admin(): SupabaseClient {
  if (!adminClient) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.");
    adminClient = createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return adminClient;
}

/** 로그인 세션을 남기지 않는 일회용 클라이언트 (현재 비밀번호 확인용) */
export function createStatelessClient() {
  return createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Supabase 응답에서 오류가 있으면 예외를 던지고 데이터를 돌려준다 */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
