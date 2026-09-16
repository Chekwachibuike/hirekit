-- Add CV markdown storage to personal_info
-- Run in: Supabase Dashboard → SQL Editor
alter table personal_info
  add column if not exists cv_markdown  text,
  add column if not exists cv_file_name text;

