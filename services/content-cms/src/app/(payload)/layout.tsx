import type { Metadata } from 'next'
import type { ServerFunctionClient } from 'payload'
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts'
import config from '@payload-config'
import '@payloadcms/next/css'

import { importMap } from './admin/importMap'

export const metadata: Metadata = {
  title: 'DDG Content',
  robots: { index: false, follow: false },
}

// Must be a standalone function with its own 'use server': React refuses to
// hand a plain closure to the client RootLayout, so an inline arrow here makes
// every admin route answer 500.
const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({ ...args, config, importMap })
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return RootLayout({
    children,
    config,
    importMap,
    serverFunction,
  })
}
