import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 화면이 로그인 사용자별 동적 데이터이므로 Cache Components는 사용하지 않는다.
  cacheComponents: false,
  // pdfkit은 내부 폰트 데이터 파일을 런타임에 읽으므로 번들링에서 제외한다.
  serverExternalPackages: ["pdfkit"],
  // 보고서 PDF용 한글 글꼴을 배포 파일에 포함 (Vercel)
  outputFileTracingIncludes: {
    "/api/incidents/*/report": ["./fonts/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
