"use client";
import { authErrorMessage } from '@/lib/auth/policy';

import { cn, hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { useRef, useState } from "react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inFlight=useRef(false);
  const router = useRouter();

  const handleForgotPassword = async (
    e: React.SubmitEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if(inFlight.current || !hasEnvVars)return;
    inFlight.current=true;
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/hoje");
      router.refresh();
    } catch (error: unknown) {
      setError(authErrorMessage(error));
    } finally {
      inFlight.current=false;
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl"><h1>Redefinir senha</h1></CardTitle>
          <CardDescription>
            Digite sua nova senha abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasEnvVars && (
            <p role="status" className="mb-4 text-sm text-muted-foreground">
              A conexão de autenticação ainda não está disponível neste ambiente.
            </p>
          )}
          <form aria-busy={isLoading} onSubmit={handleForgotPassword}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  autoComplete="new-password"
                  type="password"
                  placeholder="Nova senha"
                  required
                  value={password}
                  disabled={isLoading}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading || !hasEnvVars}>
                {isLoading ? "Salvando…" : "Salvar nova senha"}
              </Button>
            </div>
          </form>
          <Link href="/auth/login" className="mt-4 block text-sm underline">Voltar para entrar</Link>
        </CardContent>
      </Card>
    </div>
  );
}
