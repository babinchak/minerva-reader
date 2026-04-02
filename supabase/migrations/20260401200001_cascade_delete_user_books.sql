-- When a book is deleted, automatically remove all user_books entries for it.
ALTER TABLE user_books
  DROP CONSTRAINT user_books_book_id_fkey,
  ADD CONSTRAINT user_books_book_id_fkey
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE;
