'use client';

import { use } from 'react';
import { PlatformCabinetDetail } from '@/components/platform/PlatformCabinetDetail';

export default function PlatformCabinetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <PlatformCabinetDetail slug={slug} />;
}
