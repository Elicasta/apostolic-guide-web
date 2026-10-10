-- Teleprompter: private editable documents with optimistic revisions.
-- All access goes through authenticated Studio APIs using the server-side service client.
CREATE TABLE IF NOT EXISTS public.teleprompter_documents (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 160),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (octet_length(content) <= 200000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS teleprompter_documents_updated_idx
  ON public.teleprompter_documents (updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.teleprompter_document_revisions (
  document_id text NOT NULL REFERENCES public.teleprompter_documents(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, revision)
);

CREATE OR REPLACE FUNCTION public.archive_teleprompter_document_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (NEW.title, NEW.content, NEW.deleted_at) IS DISTINCT FROM
     (OLD.title, OLD.content, OLD.deleted_at) THEN
    INSERT INTO public.teleprompter_document_revisions(document_id, revision, title, content, created_at)
    VALUES (OLD.id, OLD.revision, OLD.title, OLD.content, OLD.updated_at)
    ON CONFLICT DO NOTHING;
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := now();
  ELSE
    NEW.revision := OLD.revision;
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS teleprompter_documents_revision_trigger ON public.teleprompter_documents;
CREATE TRIGGER teleprompter_documents_revision_trigger
BEFORE UPDATE ON public.teleprompter_documents
FOR EACH ROW EXECUTE FUNCTION public.archive_teleprompter_document_revision();

ALTER TABLE public.teleprompter_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teleprompter_document_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teleprompter_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teleprompter_document_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_teleprompter_document_revision() FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teleprompter_documents TO service_role;
GRANT SELECT, INSERT ON public.teleprompter_document_revisions TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_teleprompter_document_revision() TO service_role;

COMMENT ON TABLE public.teleprompter_documents IS 'Server-side Studio teleprompter scripts. Never exposed through the client Data API.';
COMMENT ON TABLE public.teleprompter_document_revisions IS 'Immutable previous script revisions for recovery and editorial history.';
