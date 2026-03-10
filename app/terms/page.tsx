import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Suspense } from "react";

export const metadata = {
  title: "Terms of Service",
  description: "Minerva Reader terms of service. Rules for using our reading and AI assistant.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-4 items-center">
        <SiteNav
          rightSlot={
            <>
              <Suspense>
                <AuthButton />
              </Suspense>
              <ThemeSwitcher />
            </>
          }
        />

        <article className="w-full max-w-3xl px-6 py-8 sm:py-12 prose prose-neutral dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground max-w-none">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl mb-2">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: March 2025
          </p>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">1. Acceptance</h2>
            <p>
              By creating an account or using Minerva Reader, you agree to these Terms of Service and our{" "}
              <Link href="/privacy" className="underline underline-offset-4 text-primary">
                Privacy Policy
              </Link>
              . If you do not agree, do not use the service.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">2. Description of Service</h2>
            <p>
              Minerva Reader provides a personal EPUB and PDF library with an in-browser reader and an AI reading assistant. You can upload books, read them, and ask questions about the content. The AI uses your book content and optional web search to generate responses.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">3. Copyright and Content You Upload</h2>
            <p>You represent and warrant that:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You own the rights to any content you upload, or you have the necessary license or permission to use and upload it.</li>
              <li>You will not upload content that infringes the copyright, trademark, or other intellectual property rights of any third party.</li>
            </ul>
            <p>
              By uploading content, you grant us a limited, non-exclusive license to store, process, and display that content solely to provide the service to you (e.g., hosting the book, generating summaries and embeddings, and powering the AI assistant).
            </p>
            <p>
              We may remove content that we reasonably believe infringes third-party rights or violates these terms. If you believe content on our service infringes your copyright, please contact us with the information required under the DMCA (title, author, your contact information, description of the infringed work, and the location of the infringing material). We will respond to valid notices in accordance with applicable law.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the service for any illegal purpose or in violation of any laws.</li>
              <li>Upload malware, abusive content, or material that harms others.</li>
              <li>Attempt to probe, scan, or compromise our infrastructure or other users&apos; accounts.</li>
              <li>Abuse the AI features to generate harmful, misleading, or illegal content.</li>
              <li>Resell, redistribute, or commercially exploit the service beyond personal use without our permission.</li>
            </ul>
            <p>We may suspend or terminate accounts that violate these terms.</p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">5. AI-Generated Content</h2>
            <p>
              The AI assistant generates responses based on your books and optional web search. These responses are for informational and reading-assistance purposes only. They may be inaccurate, incomplete, or out of context. Do not rely on them as legal, medical, financial, or other professional advice. We disclaim all liability for decisions made based on AI-generated content.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">6. Subscriptions and Billing</h2>
            <p>
              Paid subscriptions are billed through Stripe. By subscribing, you agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Recurring charges:</strong> Subscriptions automatically renew at the end of each billing period unless you cancel.</li>
              <li><strong>Cancellation:</strong> You may cancel at any time from your account settings or Stripe customer portal. Access continues until the end of the current billing period.</li>
              <li><strong>Refunds:</strong> Refunds are handled in accordance with our refund policy and applicable law. Contact us for refund requests.</li>
              <li><strong>Price changes:</strong> We may change subscription prices with reasonable notice. Continued use after a price change constitutes acceptance.</li>
            </ul>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">7. Service Availability</h2>
            <p>
              We strive to keep the service available but do not guarantee uptime. We may perform maintenance, updates, or discontinue features with reasonable notice where feasible.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Minerva Reader and its operators are not liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, data loss, or service interruptions. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">9. Disclaimers</h2>
            <p>
              The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied. We do not warrant that the service will be error-free, secure, or uninterrupted.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">10. Termination</h2>
            <p>
              You may close your account at any time. We may suspend or terminate your access if you breach these terms or for other legitimate reasons. Upon termination, your right to use the service ends. We may retain certain data as required by law or for legitimate business purposes.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">11. Changes</h2>
            <p>
              We may update these terms from time to time. Material changes will be communicated by posting the updated terms here and updating the &quot;Last updated&quot; date. Continued use after changes constitutes acceptance. If you do not agree, you must stop using the service.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">12. Contact</h2>
            <p>
              For questions about these terms, contact us at the email or address provided on our website.
            </p>
          </section>

          <p className="mt-12 text-sm text-muted-foreground">
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
            {" · "}
            <Link href="/" className="underline underline-offset-4 hover:text-foreground">
              Back to Minerva Reader
            </Link>
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
