CREATE TABLE IF NOT EXISTS user_persona_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  persona_id text NOT NULL,
  sgi_annual integer DEFAULT 0,
  full_time_gross integer DEFAULT 0,
  work_params jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_email, persona_id)
);

ALTER TABLE user_persona_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read persona settings"
  ON user_persona_settings FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert persona settings"
  ON user_persona_settings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update persona settings"
  ON user_persona_settings FOR UPDATE TO anon USING (true) WITH CHECK (true);
