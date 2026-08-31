/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Cult API is reached only through our own /api/cult proxy (see
  // src/app/api/cult/[...path]/route.ts). No rewrites/proxies configured here so
  // that the allowlist in the route handler is the single choke point.
};

export default nextConfig;
