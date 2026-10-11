import { Suspense } from 'react';
import { ActivityForm } from '@/components/banco-mestre/ActivityForm';
import { creationCategoryLabels, type CreationCategory } from '@/lib/banco-mestre/editor';

type SearchParams = Promise<{ category?: string | string[] }>;

async function NewActivityForm({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const value = typeof params.category === 'string' ? params.category : '';
  const category: CreationCategory = Object.hasOwn(creationCategoryLabels, value) ? value as CreationCategory : 'routine';
  return <ActivityForm key={category} category={category} />;
}

export default function NewActivityPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">Preparando formulário…</p>}><NewActivityForm searchParams={searchParams} /></Suspense>;
}
