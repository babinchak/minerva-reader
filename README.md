# Minerva Reader

Minerva Reader is a personal EPUB and PDF library with an in-browser reader and an AI assistant. Ask questions about your books with location-specific context—the AI uses a character-specific positioning system to ground answers in the exact passage. Explain the current page or a text selection in a single click.

## Features

- **Personal library** — Upload EPUB and PDF files
- **Web reader** — Powered by Readium/Thorium
- **AI reading assistant** — Two modes:
  - **Fast mode** — Direct explain page/selection with summaries and local context
  - **Agentic mode** — LangGraph-based agent with tools: vector search, text search, and optional web search
- **RAG (Retrieval-Augmented Generation)** — Vector embeddings for semantic search within a book; falls back to keyword search when vectors aren’t available
- **Character-specific positioning** — Precise location tracking for EPUB and PDF
- **Context retrieval** — Book, chapter, sub-chapter, and local passage summaries
- **Supabase** — Auth, Postgres, Storage, and Vector Buckets

## Use Cases

- "Explain page" or "Explain selection" in a single button click
- Ask follow-up questions grounded to the exact location in the book
- Agentic mode: semantic search, keyword search, and web search for deeper research

## Tech Stack

- **Next.js** — App router
- **Supabase** — Auth, Postgres, Storage, Vector Buckets
- **OpenAI** — GPT for chat, embeddings for vector search
- **LangChain / LangGraph** — Agentic mode with tool-calling
- **Thorium/Readium** — EPUB reader
- **Tailwind CSS + shadcn/ui**
- **PWA** — Installable app with generated icons

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project
- OpenAI API key

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable/anon key |
| `OPENAI_API_KEY` | Yes | OpenAI API key for chat and embeddings |
| `OPENAI_MODEL` | No | Chat model (default: `gpt-4o-mini`) |
| `OPENAI_TITLE_MODEL` | No | Model for chat title generation (e.g. `gpt-4o-mini` if main model is poor at short outputs) |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model (default: `text-embedding-3-small`) |
| `TAVILY_API_KEY` | No | Enables web search in agentic mode |
| `VECTOR_BUCKET_NAME` | No | Supabase Vector bucket (default: `book-embeddings`) |
| `VECTOR_INDEX_NAME` | No | Vector index name (default: `sections-openai`) |
| `LANGSMITH_API_KEY` | No | LangSmith tracing for agentic mode |

### Run

```bash
npm run dev
```

## External Processing

Book processing is handled by external services that generate Readium manifests from EPUB files and book/chapter/sub-chapter summaries with the positioning system. Vector embeddings for RAG are produced by a separate pipeline and stored in Supabase Vector Buckets.

## Future Development

- Allow user to click on AI-chosen references and navigate to that location in the reader
- Multi-book RAG — semantic search across a collection of books
