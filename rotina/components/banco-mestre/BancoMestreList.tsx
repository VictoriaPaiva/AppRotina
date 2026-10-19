"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useBancoMestre } from './BancoMestreProvider';
import { activityTypeLabels, itemTypeDescriptions, filterActivities, formatDuration, importanceLabels, importanceStyles, statusLabels, type ActivityFilters } from '@/lib/banco-mestre/presentation';
import type { ReadFailure } from '@/lib/banco-mestre/data/read-model';

const initialFilters: ActivityFilters = { search: '', areaId: 'all', type: 'all', importance: 'all', status: 'all' };

export function BancoMestreList({error}:{error?:ReadFailure}) {
  const { activities: realActivities, areas } = useBancoMestre();
  const router=useRouter();
  const [filters, setFilters] = useState<ActivityFilters>(initialFilters);
  const activities = filterActivities(realActivities, filters);
  const hasFilters = Object.entries(filters).some(([key, value]) => key === 'search' ? value.trim().length > 0 : value !== 'all');

  // Configuração local da tela, não um novo componente genérico de filtros.
  const filterControls = [
    { key: 'areaId' as const, label: 'Área', options: [{ value: 'all', label: 'Todas as áreas' }, ...areas.map(area => ({ value: area.id, label: area.name }))] },
    { key: 'type' as const, label: 'Tipo', options: [{ value: 'all', label: 'Todos os tipos' }, ...Object.entries(activityTypeLabels).map(([value, label]) => ({ value, label }))] },
    { key: 'importance' as const, label: 'Importância', options: [{ value: 'all', label: 'Todas as importâncias' }, ...Object.entries(importanceLabels).map(([value, label]) => ({ value, label }))] },
    { key: 'status' as const, label: 'Status', options: [{ value: 'all', label: 'Todos os status' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))] },
  ];

  if(error) return <Card><CardContent className="space-y-3 p-5"><h2 className="text-lg font-semibold">Não foi possível carregar o Banco Mestre</h2><p role="alert" className="text-sm text-muted-foreground">{error.message}</p>{error.kind==='Unauthorized' ? <Button asChild><Link href="/auth/login">Entrar</Link></Button> : <Button type="button" variant="outline" onClick={()=>router.refresh()}>Tentar novamente</Button>}</CardContent></Card>;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground md:text-base">Biblioteca e administração dos itens reutilizáveis da rotina.</p>
        <div><Button asChild><Link href="/banco-mestre/nova">Novo item</Link></Button></div>
      </header>

      <section aria-label="Busca e filtros de atividades" className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
        <div className="space-y-2">
          <Label htmlFor="activity-search">Buscar item</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="activity-search" type="search" placeholder="Pesquisar pelo nome…" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} className="h-10 rounded-xl pl-9" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filterControls.map(control => {
            const selected = control.options.find(option => option.value === filters[control.key]);
            return (
              <div key={control.key} className="space-y-2">
                <Label htmlFor={'filter-' + control.key}>{control.label}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button id={'filter-' + control.key} type="button" variant="outline" className="h-auto min-h-10 w-full justify-between whitespace-normal rounded-xl bg-surface text-left" aria-label={control.label + ': ' + selected?.label}>
                      <span>{selected?.label}</span><span aria-hidden="true" className="ml-2 text-muted-foreground">⌄</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-[60] max-w-[calc(100vw-2rem)]" aria-label={control.label}>
                    <DropdownMenuRadioGroup value={filters[control.key]} onValueChange={value => {
                      // O menu só emite os valores das opções conhecidas deste filtro.
                      if (control.options.some(option => option.value === value)) {
                        setFilters(current => ({ ...current, [control.key]: value }) as ActivityFilters);
                      }
                    }}>
                      {control.options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
        {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(initialFilters)}>Limpar busca e filtros</Button>}
      </section>

      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
        {activities.length} {activities.length === 1 ? 'item encontrado' : 'itens encontrados'}
      </p>

      {activities.length === 0 ? (
        <Card className="rounded-2xl border-dashed shadow-none">
          <CardContent className="space-y-2 p-6 text-center">
            <h2 className="font-semibold">{realActivities.length===0?'Seu Banco Mestre está vazio':'Nenhum item encontrado'}</h2>
            <p className="text-sm text-muted-foreground">{realActivities.length===0?'Você ainda não possui itens cadastrados.':'Tente outro nome ou ajuste os filtros.'}</p>
            {hasFilters && <Button type="button" variant="outline" onClick={() => setFilters(initialFilters)}>Limpar busca e filtros</Button>}
          </CardContent>
        </Card>
      ) : (
        <ul aria-label="Atividades do Banco Mestre" className="grid gap-4 lg:grid-cols-2">
          {activities.map(activity => {
            const area = areas.find(item => item.id === activity.areaId);
            const headingId = 'activity-' + activity.id;
            return (
              <li key={activity.id} className="min-w-0">
                <article aria-labelledby={headingId} className="h-full">
                  <Card className="flex h-full flex-col rounded-2xl shadow-sm">
                    <CardHeader className="space-y-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 id={headingId} className="min-w-0 break-words text-base font-semibold">{activity.name}</h2>
                        {activity.status === 'inactive' && <Badge variant="outline" className="shrink-0 font-normal">{statusLabels[activity.status]}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{area?.name ?? 'Área não definida'}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="font-normal">{activityTypeLabels[activity.type]}</Badge>
                        <Badge variant="outline" className={importanceStyles[activity.defaultImportance]}>{importanceLabels[activity.defaultImportance]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-3 px-5 pb-5">

                      <dl className="space-y-3 text-sm">
                        <div><dt className="font-medium">Resumo</dt><dd className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{activity.description ?? itemTypeDescriptions[activity.type]}</dd></div>
                        {activity.duration.mode !== 'unknown' && activity.type !== 'checklistGoal' && <div><dt className="font-medium">Duração</dt><dd className="mt-1 text-muted-foreground">{formatDuration(activity.duration)}</dd></div>}
                      </dl>
                    </CardContent>
                    <CardFooter className="px-5 pb-5">

                      <Button asChild variant="outline" className="rounded-xl"><Link href={'/banco-mestre/' + activity.id} aria-label={'Ver detalhes de ' + activity.name}>Ver detalhes</Link></Button>
                    </CardFooter>
                  </Card>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
