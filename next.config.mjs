import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve this file's directory so Turbopack stops walking up the tree
 * looking for a workspace root. There are stray pnpm-lock.yaml / package.json
 * files in the parent `Repositories/` folder (other experimental projects),
 * which would otherwise confuse Turbopack's auto-detection and break env
 * loading + module resolution.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
