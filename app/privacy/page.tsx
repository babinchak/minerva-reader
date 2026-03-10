import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Suspense } from "react";

export const metadata = {
  title: "Privacy Policy",
  description: "Minerva Reader privacy policy. How we collect, use, and protect your data.",
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Last updated: March 2025
          </p>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
            <p>
              Minerva Reader (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates a personal EPUB and PDF library with an AI reading assistant. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our service.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
            <p>We collect the following categories of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account information:</strong> Email address and password (hashed) when you create an account.</li>
              <li><strong>Uploaded content:</strong> EPUB and PDF files you upload, including metadata (title, author) extracted from the files.</li>
              <li><strong>Chat and AI usage:</strong> Prompts you send, selected passages, AI responses, and related context used to generate answers.</li>
              <li><strong>Reading data:</strong> Reading position, bookmarks, and library preferences.</li>
              <li><strong>Payment information:</strong> Managed by Stripe; we do not store card details. We store subscription status and billing history.</li>
              <li><strong>Technical data:</strong> IP address, browser type, device information, and usage logs (e.g., via Vercel Analytics).</li>
            </ul>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and improve the reading and AI assistant features.</li>
              <li>Store and serve your books, chat history, and reading positions.</li>
              <li>Process payments and manage subscriptions.</li>
              <li>Send transactional emails (e.g., password reset, account confirmation).</li>
              <li>Analyze usage to improve our service (aggregated analytics).</li>
              <li>Comply with legal obligations and enforce our terms.</li>
            </ul>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">4. Service Providers</h2>
            <p>We use the following third parties to operate our service:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Supabase:</strong> Authentication, database, file storage, and vector search. Data is stored in their infrastructure.</li>
              <li><strong>OpenAI:</strong> AI chat and embeddings. Your prompts and book excerpts may be sent to OpenAI to generate responses. OpenAI&apos;s data usage policies apply.</li>
              <li><strong>Vercel:</strong> Hosting and analytics.</li>
              <li><strong>Stripe:</strong> Payment processing. Card details are held by Stripe, not by us.</li>
              <li><strong>Tavily:</strong> Web search in Deep mode.</li>
            </ul>
            <p>
              These providers act as data processors. We encourage you to review their privacy policies.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">5. Cookies</h2>
            <p>We use the following cookies:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Session and authentication:</strong> Required to keep you logged in. Set by Supabase.</li>
              <li><strong>Preferences:</strong> Such as theme (light/dark mode) and layout preferences, stored in your browser.</li>
              <li><strong>Analytics:</strong> Vercel Analytics may set cookies or similar technology to measure usage (e.g., page views) in aggregate. This helps us improve the service.</li>
            </ul>
            <p>
              You can disable or block cookies in your browser settings. Some features (such as staying logged in) may not work if you disable essential cookies.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">6. AI and Model Training</h2>
            <p>
              We send your prompts and selected book content to AI providers (e.g., OpenAI) to generate responses. As of this policy, we do not use your content to train AI models. Please refer to the relevant provider&apos;s policies for their data retention and usage practices.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">7. Data Retention</h2>
            <p>
              We retain your data for as long as your account exists. You may delete your account and associated data at any time. Deleted books, chats, and usage records are removed from our systems according to our retention procedures.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">8. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access, correct, or delete your personal data.</li>
              <li>Request a copy of your data in a portable format.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Withdraw consent where processing is based on consent.</li>
              <li>Lodge a complaint with a supervisory authority.</li>
            </ul>
            <p>
              To exercise these rights, contact us (see contact details below).
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">9. California Privacy Rights (CCPA/CPRA)</h2>
            <p>
              California residents may have additional rights under the CCPA/CPRA, including the right to know what personal information is collected, to opt out of the &quot;sale&quot; or &quot;sharing&quot; of personal information, and to non-discrimination. We do not sell or share your personal information for cross-context behavioral advertising.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">10. International Transfers</h2>
            <p>
              Your data may be processed in countries outside your residence, including the United States and the European Union. We rely on appropriate safeguards (e.g., Standard Contractual Clauses) where required by law.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">11. Children</h2>
            <p>
              Our service is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us and we will delete it.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">12. Security</h2>
            <p>
              We use industry-standard measures to protect your data, including encryption in transit and at rest, access controls, and secure authentication. No system is completely secure; we encourage you to use strong passwords and protect your account.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">13. Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="space-y-4 mt-8">
            <h2 className="text-lg font-semibold text-foreground">14. Contact</h2>
            <p>
              For privacy-related questions or to exercise your rights, contact us at the email or address provided in your account settings or on our website.
            </p>
          </section>

          <p className="mt-12 text-sm text-muted-foreground">
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
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
