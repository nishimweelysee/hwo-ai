import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_API_URL || "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow the Next dev server to be reached through ngrok (and LAN) when testing
  // the web app from another network. ngrok hostnames are random per session.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
  ],
  async rewrites() {
    return [
      // Proxy all API routes to Spring Boot backend
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
