import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/sign-up-form";
import { MinervaLogo } from "@/components/minerva-logo";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <MinervaLogo size={48} />
          <span className="text-xl font-semibold text-foreground">Minerva Reader</span>
        </Link>
        <SignUpForm />
      </div>
    </div>
  );
}
