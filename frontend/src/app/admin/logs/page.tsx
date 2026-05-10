import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Logs | Ada Papers',
};

export default function LogsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Logs</h1>
      <p className="text-gray-500 mt-2">Fonctionnalité en cours de développement.</p>
    </div>
  );
}
