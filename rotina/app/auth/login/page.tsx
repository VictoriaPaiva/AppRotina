import { LoginForm } from "@/components/login-form";
import { Suspense } from 'react';

async function DeletionNotice({searchParams}:{searchParams:Promise<{account?:string}>}) {
  const params=await searchParams;
  return params.account==='deleted'?<p role="status" className="mb-4 rounded-lg border p-3 text-sm">Conta excluída com sucesso.</p>:null;
}

export default function Page({searchParams}:{searchParams:Promise<{account?:string}>}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={null}><DeletionNotice searchParams={searchParams} /></Suspense>
        <LoginForm />
      </div>
    </div>
  );
}
