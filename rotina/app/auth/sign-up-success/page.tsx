import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from 'next/link';

export default function Page() {
  return (
    <div className="flex min-h-[calc(100svh-12rem)] md:min-h-[calc(100svh-14rem)] xl:min-h-[calc(100svh-10rem)] w-full items-center justify-center p-0 sm:p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl"><h1>
                Conta criada!
              </h1></CardTitle>
              <CardDescription>Confira seu e-mail para confirmar o cadastro.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para seu e-mail. Confirme sua conta antes de entrar.
              </p>
              <Link className="mt-4 block text-sm underline" href="/auth/login">Voltar para entrar</Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
