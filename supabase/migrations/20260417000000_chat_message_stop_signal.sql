-- Support server-side chat generation persistence and explicit stop signaling.
--
-- stop_requested_at: set by /api/chat/stop. Streaming routes poll this between
-- agent steps (or every N chunks in fast mode); when non-null they abort the
-- upstream LLM call and persist whatever content was produced.
--
-- is_complete: false while the row is still being filled in by the streaming
-- route, true once the final content + usage have been written. Lets the
-- message-load path surface "..." or a spinner for in-flight messages if a
-- user revisits a chat before generation finishes after a tab-close.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS stop_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_complete boolean NOT NULL DEFAULT true;
