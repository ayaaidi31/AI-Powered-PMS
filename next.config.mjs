/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Allow opening the dev server from another device on the same network (e.g. a
  // phone at http://10.93.84.157:3000). Without this, Server Actions fail the
  // origin/CSRF check with "Invalid Server Actions request". The IP must be
  // updated when the host machine's LAN address changes (see `ipconfig`).
  allowedDevOrigins: ["10.93.84.157", "10.93.84.*"],
  experimental: {
    serverActions: {
      // Patient-document uploads (imaging/PDF) travel through a Server Action, so
      // the request body ceiling is raised above the 1 MB default to fit a scan.
      bodySizeLimit: "16mb",
      // Origins permitted to invoke Server Actions (localhost + this machine on
      // the LAN, so a phone on the same Wi-Fi can sign in).
      allowedOrigins: ["localhost:3000", "10.93.84.157:3000", "10.93.84.*:3000"],
    },
  },
}

export default nextConfig
