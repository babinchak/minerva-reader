# Hyper Reader

Hyper Reader is a personal EPUB library with an in-browser reader and a seamless AI assistant. All questions will be fed to the AI with location-specific summaries as context, using a character-specific positioning system. Explain current page or a text selection in a single click.

## Features

- Personal library with EPUB and PDF upload
- Web reader powered by Readium/Thorium
- AI reading assistant
- Character-specific positioning system for precise location tracking
- Context retrieval from book, chapter, sub-chapter, and local passage
- Supabase-backed auth, storage, and metadata

## Use Cases

- "Explain page" or "Explain selection" in single button click
- Ask follow-up questions grounded to the exact location in the book

## Tech Stack

- Next.js
- Supabase Auth, Postgres, and Storage
- OpenAI GPT for AI assistant
- Thorium/Readium reader for EPUB
- Tailwind CSS + shadcn/ui

## Lambdas
- https://github.com/babinchak/readium-processor-lambda to generate Readium manifests from epub files using Go toolkit.
- https://github.com/babinchak/readium-summaries-lambda to generate book, chapter, sub-chapter summaries with positioning system.

## Future Development - RAG, Multi-stage pipeline, 
- Generate vector embeddings for sections throughout the book.
- Have AI query by semantic similarity scores on those vectors.
- Agentic ability determines which of the most-similar sections are relevant to the user's question.
- Allow user to click on AI's chosen reference and visit that reference in a different tab.
- Eventually multi-book RAG, where user can find references over a collection of books