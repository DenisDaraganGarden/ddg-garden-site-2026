import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 otherwise writes AGENTS.md and CLAUDE.md into the repo on every
  // dev start; an auto-generated CLAUDE.md would silently feed instructions
  // to future agent sessions.
  agentRules: false,
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
}

export default withPayload(nextConfig)
