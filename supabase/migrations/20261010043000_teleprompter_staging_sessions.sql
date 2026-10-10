-- Isolated staging-only teleprompter pairing checkpoint and optimistic ordering.
-- The API validates authenticated Studio access before using the service client.
CREATE TABLE IF NOT EXISTS public.teleprompter_sessions (
  session_code text PRIMARY KEY CHECK (session_code ~ '^[A-Z0-9]{7,10}$'),
  state jsonb NOT NULL,
  sequence bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours')
);
CREATE INDEX IF NOT EXISTS teleprompter_sessions_expiry_idx ON public.teleprompter_sessions(expires_at);
ALTER TABLE public.teleprompter_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teleprompter_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teleprompter_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.save_teleprompter_session(
  p_session_code text,
  p_state jsonb,
  p_sequence bigint
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_session_code !~ '^[A-Z0-9]{7,10}$' OR p_sequence < 0 THEN
    RAISE EXCEPTION 'Invalid teleprompter state';
  END IF;
  INSERT INTO public.teleprompter_sessions
    (session_code, state, sequence, updated_at, expires_at)
  VALUES
    (p_session_code, p_state, p_sequence, now(), now() + interval '12 hours')
  ON CONFLICT (session_code) DO UPDATE
  SET state = EXCLUDED.state,
      sequence = EXCLUDED.sequence,
      updated_at = now(),
      expires_at = now() + interval '12 hours'
  WHERE EXCLUDED.sequence > public.teleprompter_sessions.sequence
     OR (
       EXCLUDED.sequence = public.teleprompter_sessions.sequence
       AND coalesce((EXCLUDED.state ->> 'updatedAt')::bigint, 0)
         > coalesce((public.teleprompter_sessions.state ->> 'updatedAt')::bigint, 0)
     )
     OR (
       EXCLUDED.sequence = public.teleprompter_sessions.sequence
       AND coalesce((EXCLUDED.state ->> 'updatedAt')::bigint, 0)
         = coalesce((public.teleprompter_sessions.state ->> 'updatedAt')::bigint, 0)
       AND coalesce(EXCLUDED.state ->> 'actorId', '')
         > coalesce(public.teleprompter_sessions.state ->> 'actorId', '')
     );
END;
$$;
REVOKE ALL ON FUNCTION public.save_teleprompter_session(text,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_teleprompter_session(text,jsonb,bigint) TO service_role;
COMMENT ON TABLE public.teleprompter_sessions IS 'Temporary paired teleprompter state, writable through authenticated server API only.';
