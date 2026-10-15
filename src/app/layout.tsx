import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "장애 접수·조치 관리",
  description: "고객 장애 접수부터 조치, 처리완료 보고서까지 관리하는 시스템",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
