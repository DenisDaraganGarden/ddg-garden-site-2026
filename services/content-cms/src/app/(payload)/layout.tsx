import type { Metadata } from 'next'
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts'
import config from '@payload-config'
import '@payloadcms/next/css'

import { importMap } from './admin/importMap'

export const metadata: Metadata = {
  title: 'DDG Content',
  robots: { index: false, follow: false },
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return RootLayout({
    children,
    config,
    importMap,
    serverFunction: (args) => handleServerFunctions({ ...args, config, importMap }),
  })
}
