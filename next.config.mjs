/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  // Tailscale MagicDNS hostnames the dashboard is reached from. Next 16 blocks
  // cross-origin HMR requests by default, which hangs the client until allowed.
  allowedDevOrigins: ['burrow.tailefc270.ts.net', '100.99.141.72'],
};

export default nextConfig;
