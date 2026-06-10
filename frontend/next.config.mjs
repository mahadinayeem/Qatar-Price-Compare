/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { hostname: "rawabihypermarket.com" },
      { hostname: "family.qa" },
      { hostname: "gcc.luluhypermarket.com" },
      { hostname: "**.luluhypermarket.com" },
    ],
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["data/products.db"],
  },
};

export default nextConfig;
