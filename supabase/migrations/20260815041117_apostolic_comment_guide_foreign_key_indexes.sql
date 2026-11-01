create index if not exists social_comment_guide_jobs_person_id_idx
  on public.social_comment_guide_jobs (person_id);

create index if not exists social_comment_guide_jobs_automation_id_idx
  on public.social_comment_guide_jobs (automation_id);
