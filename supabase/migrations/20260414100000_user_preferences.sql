-- Per-auth-user UI preferences (locale, theme). Synced from the app when logged in.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  locale text,
  theme text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_locale_check CHECK (locale IS NULL OR locale IN ('en', 'de', 'fi')),
  CONSTRAINT user_preferences_theme_check CHECK (theme IS NULL OR theme IN ('light', 'dark'))
);

COMMENT ON TABLE public.user_preferences IS 'Language and theme; one row per auth user.';

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own user_preferences"
  ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users insert own user_preferences"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users update own user_preferences"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
