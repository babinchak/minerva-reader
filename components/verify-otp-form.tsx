"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";

export function VerifyOtpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submittingRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  // `next` is forwarded by the sign-up form when the user came in via an
  // anon-chat handoff (or any other redirect-after-auth flow). Falls back
  // to /browse so fresh signups land on the curated collections view rather
  // than an empty library.
  const next = searchParams.get("next");

  const submitCode = useCallback(async (token: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "signup",
      });
      if (error) throw error;
      const target = next ? next : "/browse";
      const sep = target.includes("?") ? "&" : "?";
      router.push(`${target}${sep}new_signup=true`);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  }, [email, router, next]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    if (value.length > 1) {
      const digits = value.slice(0, 6).split("");
      digits.forEach((digit, i) => {
        if (index + i < 6) newCode[index + i] = digit;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      if (newCode.every((d) => d !== "")) submitCode(newCode.join(""));
    } else {
      newCode[index] = value;
      setCode(newCode);
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
      if (newCode.every((d) => d !== "")) submitCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      if (code[index]) {
        const newCode = [...code];
        newCode[index] = "";
        setCode(newCode);
        if (index > 0) inputRefs.current[index - 1]?.focus();
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      const newCode = [...code];
      pasted.split("").forEach((digit, i) => {
        newCode[i] = digit;
      });
      setCode(newCode);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
      if (newCode.every((d) => d !== "")) submitCode(newCode.join(""));
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) throw error;
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to resend code");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 w-full", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription>
            We sent a 6-digit code to{" "}
            <span className="font-medium text-foreground">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-12 text-center text-lg font-mono caret-transparent selection:bg-transparent"
                    autoFocus={index === 0}
                    disabled={isLoading}
                  />
                ))}
              </div>
              {isLoading && <p className="text-sm text-muted-foreground text-center">Verifying...</p>}
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <p className="text-sm text-center text-muted-foreground">
                Didn&apos;t receive a code?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending || resent}
                  className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  {resent ? "Code sent!" : isResending ? "Sending..." : "Resend"}
                </button>
              </p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
