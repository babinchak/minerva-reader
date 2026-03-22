-- Add last_opened_at to both books and user_books
ALTER TABLE books ADD COLUMN last_opened_at timestamptz;
ALTER TABLE user_books ADD COLUMN last_opened_at timestamptz;
