/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // standalone output lets the Docker image copy only the needed runtime files
  output: "standalone",
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3007"],
    },
  },
};

module.exports = nextConfig;
