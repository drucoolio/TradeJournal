/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Cache server component output in the router cache so repeat navigations
    // (e.g. Dashboard → Trade View → Dashboard) feel instant. Next.js 15
    // defaults to 0s for dynamic routes which causes a full refetch on every
    // click. 30s keeps things fresh while eliminating the "click and wait" lag.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

module.exports = nextConfig;
