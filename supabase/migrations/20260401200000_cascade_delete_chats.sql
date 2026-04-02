-- Add cascade delete: when a book is deleted, its chats are deleted automatically.
-- When a chat is deleted, its chat_messages are deleted automatically.
-- Previously chats were deliberately orphaned to preserve billing data in chat_messages,
-- but usage tracking has since been moved to usage_records.

-- chats.book_id → books(id) ON DELETE CASCADE
ALTER TABLE chats
  DROP CONSTRAINT IF EXISTS chats_book_id_fkey,
  ADD CONSTRAINT chats_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;

-- chat_messages.chat_id → chats(id) ON DELETE CASCADE
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_chat_id_fkey,
  ADD CONSTRAINT chat_messages_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE;
