/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.rohlik.cz" },
      { protocol: "https", hostname: "www.rohlik.cz" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};
export default nextConfig;
