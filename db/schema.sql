CREATE TABLE IF NOT EXISTS public.workshop_signups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  cpf text NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  phone text NOT NULL CHECK (phone ~ '^[0-9]{10,11}$'),
  rating smallint NOT NULL CHECK (rating BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_rate_limit_windows (
  bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count smallint NOT NULL CHECK (request_count BETWEEN 1 AND 11)
);

CREATE INDEX IF NOT EXISTS api_rate_limit_windows_started_at_idx
  ON public.api_rate_limit_windows (window_started_at);
