-- Optional phrase that narrows a broad tradition passage (a whole Book or month) to the right chunks.
alter table figure_passages add column if not exists match text;
