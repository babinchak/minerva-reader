import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export function PricingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 max-w-lg mx-auto w-full">
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Free</CardTitle>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">$0</span>
            <span className="text-muted-foreground">/mo</span>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>Fully featured</span>
            </li>
            <li className="flex items-start gap-2 text-muted-foreground">
              <X className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Limited daily usage</span>
            </li>
            <li className="flex items-start gap-2 text-muted-foreground">
              <X className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No bulk uploads</span>
            </li>
          </ul>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full" variant="outline">
            <Link href="/auth/sign-up">Try Minerva</Link>
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-primary flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pro</CardTitle>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">$10</span>
            <span className="text-muted-foreground">/mo</span>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <p className="mb-3 text-sm font-semibold">Everything in Free, plus:</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>More monthly usage</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>Bulk uploads</span>
            </li>
          </ul>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/auth/sign-up">Get started</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
