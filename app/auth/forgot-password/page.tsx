import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { MinervaLogo } from "@/components/minerva-logo";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 relative">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <MinervaLogo size={48} />
          <span className="text-xl font-semibold text-foreground">Minerva Reader</span>
        </Link>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
