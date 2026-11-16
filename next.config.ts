import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["bcryptjs", "ffmpeg-static"],
  outputFileTracingIncludes: {
    "/": ["./data/**/*"],
    "/library": ["./data/**/*"],
    "/private": ["./data/**/*"],
    "/media/[id]": ["./data/**/*"],
    "/api/login": ["./data/**/*"],
    "/api/logout": ["./data/**/*"],
    "/api/session": ["./data/**/*"],
    "/api/password": ["./data/**/*"],
    "/api/media": ["./data/**/*", "./node_modules/ffmpeg-static/ffmpeg"],
    "/api/media/[id]": ["./data/**/*"],
    "/api/film/part": ["./data/**/*"],
    "/api/film/finish": ["./data/**/*", "./node_modules/ffmpeg-static/ffmpeg"],
    "/api/home": ["./data/**/*"],
    "/api/music": ["./data/**/*"],
    "/api/music/part": ["./data/**/*"],
    "/api/music/finish": ["./data/**/*"],
    "/calendar": ["./data/**/*"],
    "/api/media/reorder": ["./data/**/*"],
    "/api/invites": ["./data/**/*"],
    "/api/invites/[id]": ["./data/**/*"],
    "/api/rsvp": ["./data/**/*"],
    "/guests": ["./data/**/*"],
    "/camera": ["./data/**/*"],
    "/seats": ["./data/**/*"],
    "/api/seating": ["./data/**/*"],
  },
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
    ];
    return [
      { source: "/", headers: noStore },
      { source: "/library", headers: noStore },
      { source: "/private", headers: noStore },
      { source: "/guests", headers: noStore },
      { source: "/camera", headers: noStore },
      { source: "/seats", headers: noStore },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
