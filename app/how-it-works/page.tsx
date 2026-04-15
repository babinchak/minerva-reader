import { ServerSiteNav } from "@/components/server-site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AuthButton } from "@/components/auth-button";
import { ReferenceDemo } from "@/components/marketing/reference-demo";
import { Suspense } from "react";
import {
  Layers,
  Database,
  Zap,
  Brain,
  Search,
  TextSearch,
  FileText,
  Globe,
  Library,
  ArrowRight,
  MousePointerClick,
} from "lucide-react";

export const metadata = {
  title: "How It Works",
  description:
    "A technical overview of how Minerva Reader processes books, generates summaries, and powers its AI reading assistant.",
};

/* ------------------------------------------------------------------ */
/*  Small reusable pieces                                              */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
      {children}
    </p>
  );
}

function PipelineStep({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-4 sm:gap-5">
      {/* icon bubble */}
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {/* text */}
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  badge,
  children,
  features,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string;
  children: React.ReactNode;
  features?: { icon: React.ElementType; label: string }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-card flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {badge && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {badge}
            </span>
          )}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      {features && features.length > 0 && (
        <div className="mt-1 grid grid-cols-2 gap-2">
          {features.map(({ icon: FIcon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground"
            >
              <FIcon className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Combined processing diagram                                        */
/* ------------------------------------------------------------------ */

function ProcessingDiagram() {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Labels row */}
      <div className="w-full flex items-center gap-2">
        <p className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-primary text-center">
          Hierarchical Summaries
        </p>
        <p className="text-[11px] font-medium text-muted-foreground px-2">
          Your Book
        </p>
        <p className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-primary text-center">
          Vector Embeddings
        </p>
      </div>

      {/* Diagram row */}
      <div className="w-full flex items-stretch gap-0" style={{ height: 180 }}>
        {/* Left: Summaries — three columns zooming in */}
        <div className="flex-1 flex flex-col gap-1 pr-2">
          {/* Column labels — hidden on mobile where the shapes speak for themselves */}
          <div className="hidden sm:flex gap-1">
            <span className="flex-1 text-[9px] font-medium text-muted-foreground text-center">Book</span>
            <span className="flex-1 text-[9px] font-medium text-muted-foreground text-center">Sections</span>
            <span className="flex-1 text-[9px] font-medium text-muted-foreground text-center">Sub-sections</span>
          </div>
          {/* Bars */}
          <div className="flex-1 flex gap-1">
            {/* Book level: 1 bar */}
            <div className="flex flex-col flex-1">
              <div className="flex-1 rounded-md border border-primary/30 bg-primary/5" />
            </div>
            {/* Section level: 3 bars */}
            <div className="flex flex-col gap-0.5 flex-1">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className="flex-1 rounded-md border border-border bg-card shadow-sm"
                />
              ))}
            </div>
            {/* Sub-section level: 7 bars */}
            <div className="flex flex-col gap-0.5 flex-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm border border-border/60 bg-muted/50"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Center: book spine with start/end and reader position */}
        <div className="flex flex-col items-center mx-2 sm:mx-3 relative">
          <span className="text-[9px] text-muted-foreground mb-1">Start</span>
          <div className="flex-1 w-px bg-border" />
          <span className="text-[9px] text-muted-foreground mt-1">End</span>
        </div>

        {/* Right: Vector chunks — uniform slices */}
        <div className="flex-1 flex flex-col pl-2">
          {/* Spacer to align with column labels on the left (desktop only) */}
          <div className="hidden sm:block text-[9px] mb-1">&nbsp;</div>
          <div className="flex-1 flex flex-col gap-1">
            {[
              "[0.021, -0.037, ..., 0.009]",
              "[-0.008, 0.042, ..., -0.031]",
              "[0.033, -0.011, ..., 0.018]",
              "[-0.025, 0.006, ..., -0.044]",
              "[0.017, -0.029, ..., 0.036]",
              "[-0.013, 0.038, ..., -0.022]",
              "[0.044, -0.022, ..., 0.015]",
            ].map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-md border border-primary/20 bg-primary/5 flex items-center justify-center px-2 overflow-hidden"
              >
                <span className="text-[9px] text-muted-foreground font-mono whitespace-nowrap hidden sm:inline">
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Context stack diagram (for quick mode)                             */
/* ------------------------------------------------------------------ */

function ContextStack() {
  const summaryLayers = [
    {
      label: "Book Summary",
      desc: "High-level overview",
      width: "w-full",
      bg: "bg-primary/5 border-primary/20",
    },
    {
      label: "Section Summary",
      desc: "Wider context",
      width: "w-[85%]",
      bg: "bg-primary/8 border-primary/25",
    },
    {
      label: "Sub-section Summary",
      desc: "Narrow context",
      width: "w-[70%]",
      bg: "bg-primary/12 border-primary/30",
    },
  ];

  return (
    <div className="flex flex-col items-center gap-1.5">
      {summaryLayers.map(({ label, desc, width, bg }) => (
        <div
          key={label}
          className={`${width} rounded-lg border ${bg} px-4 py-2.5 text-center`}
        >
          <div className="text-xs font-semibold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      ))}
      {/* Local text - separate from summaries */}
      <div className="w-[70%] flex items-center gap-2 mt-2">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[9px] text-muted-foreground">+</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>
      <div className="w-[70%] rounded-lg border border-foreground/15 bg-foreground/5 px-4 py-2.5 text-center">
        <div className="text-xs font-semibold text-foreground">Local Text</div>
        <div className="text-xs text-muted-foreground">Verbatim text near your position</div>
      </div>
      <ArrowRight className="h-4 w-4 text-primary rotate-90 mt-1" />
      <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
        Assistant Response
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col items-center">
        <ServerSiteNav
          rightSlot={
            <Suspense>
              <AuthButton />
            </Suspense>
          }
        />

        <div className="w-full max-w-2xl px-6 py-12 sm:py-20 space-y-20">
          {/* ── Hero ────────────────────────────────────── */}
          <header className="text-center space-y-4">
            <h1 className="text-3xl font-bold text-foreground sm:text-4xl tracking-tight">
              How It Works
            </h1>
            <p className="text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
              A peek under the hood for the curious. Here&apos;s what happens
              when you upload a book and ask questions about it.
            </p>
          </header>

          {/* ── Book Processing Pipeline ────────────────── */}
          <section className="space-y-8">
            <div className="space-y-2">
              <SectionLabel>Book Processing</SectionLabel>
              <h2 className="text-2xl font-bold text-foreground">
                When You Upload a Book
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your book is prepared for the assistant.
              </p>
            </div>

            <div className="ml-1 space-y-8">
              <PipelineStep icon={Layers} title="Hierarchical Summaries">
                The book is broken into sections and sub-sections,
                preferring chapter boundaries where possible. Each level
                gets its own AI-generated summary: one for the whole book,
                one per section, and one per sub-section. This means no matter where you are in the book, the
                assistant has context at multiple levels of specificity.
              </PipelineStep>
              <PipelineStep icon={Database} title="Vector Embeddings">
                The full text is chunked into small passages. Each
                passage is run through an AI model that converts it into
                a vector embedding, a numerical representation of its
                meaning. This is the foundation of{" "}
                <a
                  href="https://en.wikipedia.org/wiki/Retrieval-augmented_generation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  retrieval-augmented generation (RAG)
                </a>
                : the assistant can find relevant passages by meaning, not
                just keywords.
              </PipelineStep>
            </div>

            {/* Combined processing visual */}
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-card">
              <ProcessingDiagram />
            </div>
          </section>

          {/* ── AI Modes ───────────────────────────────── */}
          <section className="space-y-8">
            <div className="space-y-2">
              <SectionLabel>AI Modes</SectionLabel>
              <h2 className="text-2xl font-bold text-foreground">
                When You Ask a Question
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The assistant draws from this processed data to build context for its response.
              </p>
            </div>

            {/* Quick Mode */}
            <div className="space-y-5">
              <ModeCard icon={Zap} title="Quick Mode" badge="Fastest">
                Uses your current position in the book to pull together
                the actual text on and around the page you&apos;re reading,
                plus three layers of summaries (book, section, and
                sub-section) and feeds them directly to the assistant.
                No searching, just instant awareness of where you are and
                what&apos;s happening around you. Best for quick clarifications
                and &ldquo;what just happened?&rdquo; questions.
              </ModeCard>

              {/* Context stack visual */}
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center mb-4">
                  Context Fed to Assistant
                </p>
                <ContextStack />
              </div>
            </div>

            {/* Deep Mode */}
            <div className="rounded-xl border border-border bg-card shadow-card flex flex-col">
              {/* Header */}
              <div className="p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Brain className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">Deep Mode</h3>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      Agent
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Everything from Quick Mode, plus the assistant becomes an
                  agent with tools it can call to actively search your book.
                  It decides which tools to use, refines its searches
                  iteratively, and builds up evidence before responding.
                </p>
              </div>

              {/* Agent tools */}
              <div className="border-t border-dashed border-border bg-muted/20 rounded-b-xl p-5 sm:p-6 space-y-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center">
                  Agent Tools
                </p>

                {/* Semantic Search */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Search className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Semantic Search</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The assistant writes a natural-language query, converts it to
                    a vector, and finds the passages with the shortest distance.
                  </p>

                  {/* Query */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Query
                    </p>
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground font-mono">
                      &ldquo;free will four great errors willing responsibility moral blame choice necessity&rdquo;
                    </div>
                  </div>

                  {/* Results */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Top Results
                    </p>
                    <div className="space-y-2">
                      {[
                        { score: 0.62, text: "The Error of Free-Will. At present we no longer have any mercy upon the concept \u201Cfree-will\u201D: we know only too well what it is\u2026" },
                        { score: 0.50, text: "THE FOUR GREAT ERRORS \u2014 The error of the confusion of cause and effect. There is no more dangerous error than to confound the effect with the cause\u2026" },
                        { score: 0.49, text: "Everything valuable is instinct\u2014and consequently easy, necessary, free. Exertion is an objection\u2026" },
                        { score: 0.47, text: "No one gives man his qualities, neither God, society, his parents, his ancestors, nor himself\u2026" },
                      ].map(({ score, text }, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                          <span className="shrink-0 text-xs font-semibold text-primary tabular-nums pt-0.5">{score.toFixed(2)}</span>
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Text Search */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <TextSearch className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Text Search</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A keyword search for when the assistant needs an exact
                    phrase or specific term. Supports multiple terms.
                  </p>
                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground font-mono">
                    free will|free-will|non-free will
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Passage Retrieval */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Passage Retrieval</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    When a search result looks promising but cuts off at a
                    chunk boundary, the assistant can pull the surrounding
                    passages to get the full argument or find a better quote.
                  </p>
                </div>

                <div className="h-px bg-border" />

                {/* Web Search */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Web Search</h4>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Also available if the assistant needs outside context,
                    though it rarely needs to leave the book itself.
                  </p>
                </div>
              </div>
            </div>

            {/* Library Mode */}
            <ModeCard
              icon={Library}
              title="Ask Across Library"
              badge="Multi-book"
            >
              Same agent capabilities as Deep Mode, but scoped across your
              entire library or a specific collection. Search multiple books
              simultaneously with results attributed back to each source.
              Great for cross-referencing ideas across authors or asking
              &ldquo;which of my books discusses X?&rdquo;
            </ModeCard>

            {/* Navigable References */}
            <div className="rounded-xl border border-border bg-card shadow-card flex flex-col">
              <div className="p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MousePointerClick className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Navigable References</h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  From the passages it retrieves, the assistant can quote
                  specific lines and turn them into clickable links. Clicking
                  one takes you straight to that spot in the reader, so you
                  can read the surrounding context and explore the idea further.
                </p>
              </div>
              <div className="border-t border-dashed border-border bg-muted/20 rounded-b-xl p-5 sm:p-6 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
                  Example Response Snippet
                </p>
                <ReferenceDemo />
              </div>
            </div>
          </section>
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
