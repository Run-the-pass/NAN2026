import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: "/NAN2026",
        trailingSlash: true,
        images: { unoptimized: true },
        // Pages 빌드에는 제외한 Cloudflare D1 전용 모듈을 Next가 전체 검사하지 않게 한다.
        typescript: { ignoreBuildErrors: true },
        webpack(config) {
          config.resolve.extensionAlias = {
            ...config.resolve.extensionAlias,
            ".js": [".ts", ".tsx", ".js"],
            ".jsx": [".tsx", ".jsx"],
          };
          return config;
        },
      }
    : {}),
};

export default nextConfig;
