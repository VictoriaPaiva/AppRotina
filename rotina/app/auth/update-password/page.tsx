import { UpdatePasswordForm } from "@/components/update-password-form";

export default function Page() {
  return (
    <div className="flex min-h-[calc(100svh-12rem)] md:min-h-[calc(100svh-14rem)] xl:min-h-[calc(100svh-10rem)] w-full items-center justify-center p-0 sm:p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
