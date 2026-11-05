'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { installAuthFetch } from '@/lib/authFetch';

// Install at module-evaluation time (browser only) so that it is in place before any child
// component effect fires its first API request. installAuthFetch is idempotent.
installAuthFetch(API_BASE_URL);

export default function AuthFetchInstaller() {
  useEffect(() => {
    installAuthFetch(API_BASE_URL);
  }, []);
  return null;
}
