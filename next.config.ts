import type { NextConfig } from "next";

const config: NextConfig = {
  // The panel is an internal tool behind a login; it renders nothing publicly
  // and needs no image optimisation pipeline.
  reactStrictMode: true,
};

export default config;
