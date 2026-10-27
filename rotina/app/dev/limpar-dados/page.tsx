import { notFound } from 'next/navigation';
import { CleanupPanel } from '@/components/dev/CleanupPanel';
export default function DevCleanupPage() {
  if (process.env.NODE_ENV!=='development' || process.env.DEV_DATA_CLEANUP_ENABLED!=='true') notFound();
  return <CleanupPanel />;
}
