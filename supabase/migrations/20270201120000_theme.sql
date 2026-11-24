-- Appearance (Settings): light, dark, or system (follow the device). For now
-- only the HSK Book and Flashcards use it; every other page stays light.
-- The browser keeps a copy in localStorage for the first paint; this column
-- carries the choice across devices.

alter table public.profiles
  add column if not exists theme text not null default 'system';

alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check check (theme in ('light', 'dark', 'system'));
