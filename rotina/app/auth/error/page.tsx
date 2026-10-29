import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function Page() {
  return <div className="flex min-h-[calc(100svh-12rem)] md:min-h-[calc(100svh-14rem)] xl:min-h-[calc(100svh-10rem)] w-full items-center justify-center p-0 sm:p-6 md:p-10"><div className="w-full max-w-sm"><Card>
    <CardHeader><CardTitle className="text-2xl"><h1>Não foi possível confirmar o acesso</h1></CardTitle></CardHeader>
    <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">O link pode ter expirado. Tente entrar novamente ou solicite um novo link de recuperação.</p>
      <Link href="/auth/login" className="text-sm underline underline-offset-4">Voltar para entrar</Link>
      <Link href="/auth/forgot-password" className="block text-sm underline underline-offset-4">Solicitar novo link de recuperação</Link>
    </CardContent>
  </Card></div></div>;
}
