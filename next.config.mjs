/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Patient-document uploads (imaging/PDF) travel through a Server Action, so
    // the request body ceiling is raised above the 1 MB default to fit a scan.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
}

export default nextConfig
