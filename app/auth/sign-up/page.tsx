import Link from "next/link";
import { SignUpForm } from "@/components/sign-up-form";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiteFooter } from "@/components/site-footer";
import { MinervaLogo } from "@/components/minerva-logo";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 relative">
        <div className="absolute top-4 right-4">
          <ThemeSwitcher />
        </div>
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <MinervaLogo size={48} />
            <span className="text-xl font-semibold text-foreground">Minerva Reader</span>
          </Link>
          <SignUpForm />
        </div>
      </div>
      <SiteFooter className="py-6" />
    </div>
  );
}
