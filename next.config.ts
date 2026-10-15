import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 화면이 로그인 사용자별 동적 데이터이므로 Cache Components는 사용하지 않는다.
  cacheComponents: false,
  // pdfkit은 내부 폰트 데이터 파일을 런타임에 읽으므로 번들링에서 제외한다.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      // 첨부파일(파일당 최대 10MB, 여러 개) 업로드를 허용
      bodySizeLimit: "30mb",
    },
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
