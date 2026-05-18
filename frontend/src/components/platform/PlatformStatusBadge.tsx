import type { OrgStatus } from '@/lib/platform/types';

const styles: Record<OrgStatus, string> = {
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  trial: 'bg-amber-100 text-amber-800',
};

export function PlatformStatusBadge({ status }: { status: OrgStatus }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  );
}
