import { LoginForm } from "@/components/login-form";
import { Suspense } from 'react';

async function DeletionNotice({searchParams}:{searchParams:Promise<{account?:string;logout?:string}>}) {
  const params=await searchParams;
  const message=params.account==='deleted'?'Conta excluída com sucesso.':params.logout==='success'?'Você saiu da sua conta.':null;
  return message?<p role="status" className="mb-4 rounded-lg border p-3 text-sm">{message}</p>:null;
}

export default function Page({searchParams}:{searchParams:Promise<{account?:string;logout?:string}>}) {
  return (
    <div className="flex min-h-[calc(100svh-12rem)] md:min-h-[calc(100svh-14rem)] xl:min-h-[calc(100svh-10rem)] w-full items-center justify-center p-0 sm:p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}><DeletionNotice searchParams={searchParams} /></Suspense>
        <LoginForm />
      </div>
    </div>
  );
}
