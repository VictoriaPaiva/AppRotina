import { Suspense } from 'react';
import { CalendarBoard } from '@/components/calendar/CalendarBoard';
import { readCalendarPage } from '@/lib/planning/calendar-server';

async function Content({searchParams}: {searchParams: Promise<{date?: string | string[]}>}) {
  const params = await searchParams;
  return <CalendarBoard data={await readCalendarPage(params.date)} />;
}
export default function CalendarioPage(props: {searchParams: Promise<{date?: string | string[]}>}) {
  return <Suspense fallback={<p role="status">Carregando calendário…</p>}><Content {...props} /></Suspense>;
}
