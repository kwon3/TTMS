import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import { logout } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/types";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const nav = [
    { href: "/", label: "대시보드" },
    ...(user.role === "customer" ? [{ href: "/incidents/new", label: "장애 접수" }] : []),
    { href: "/history", label: "장애 이력·보고서" },
    ...(user.role === "admin"
      ? [
          { href: "/admin/companies", label: "고객사·담당자" },
          { href: "/admin/users", label: "계정 관리" },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="grid size-7 place-items-center rounded-lg bg-blue-600 text-sm text-white">!</span>
            <span className="hidden sm:inline">장애 접수·조치 관리</span>
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-1.5 whitespace-nowrap text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <NotificationBell />
          <Link href="/profile" className="hidden text-right text-xs leading-tight md:block">
            <span className="block font-medium text-slate-800">{user.name}</span>
            <span className="text-slate-500">
              {ROLE_LABEL[user.role]}
              {user.company_name ? ` · ${user.company_name}` : ""}
            </span>
          </Link>
          <form action={logout}>
            <button className="btn-secondary btn-sm">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
