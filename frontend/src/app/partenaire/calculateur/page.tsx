'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PartenaireCalculateurPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/calculateur');
  }, [router]);

  return null;
}


