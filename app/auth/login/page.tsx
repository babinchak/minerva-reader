import { LoginForm } from "@/components/login-form";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiteFooter } from "@/components/site-footer";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 relative">
        <div className="absolute top-4 right-4">
          <ThemeSwitcher />
        </div>
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>
      <SiteFooter className="py-6" />
    </div>
  );
}
