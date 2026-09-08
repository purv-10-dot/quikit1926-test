-- =============================================================================
-- Standalone migration: registers ONLY the "quikinsight" App + OAuthClient
-- rows. Raw-SQL equivalent of migrate-quikinsight-oauth.ts, for running
-- directly via psql/a DB client against UAT without Node/Prisma installed.
--
-- Scope: every statement below is keyed on slug/"clientId" = 'quikinsight'.
-- No other app's App or OAuthClient row is read or written.
--
-- ⚠️ BEFORE RUNNING — YOU MUST EDIT THE THREE PLACEHOLDERS BELOW:
--   1. :'base_url'        — QuikInsight's real UAT base URL (no trailing slash)
--   2. :'deployed_url'    — optional extra origin; leave NULL if not needed
--   3. :'client_secret_hash' — a REAL bcrypt hash (cost 12) of the real
--      secret. The placeholder hash below is bcrypt('REPLACE_WITH_REAL_SECRET
--      _BEFORE_RUNNING', 12) — it is NOT a usable secret, only a
--      correctly-shaped example. A .sql file cannot hash a secret at
--      runtime the way the TS script does (it hashes with bcryptjs when it
--      runs) — you must generate the real hash yourself, e.g.:
--        node -e "console.log(require('bcryptjs').hashSync('<real secret>', 12))"
--      then paste the result in place of the placeholder hash below.
--      Get the real secret from ~/Desktop/QuikIT-Secrets/ (vault) — never
--      commit it, and never leave the placeholder hash in a database anyone
--      other than a throwaway/local dev DB can reach.
-- =============================================================================

DO $$
DECLARE
  v_slug           text := 'quikinsight';
  v_client_id      text := 'quikinsight';

  -- ── 1. EDIT ME: QuikInsight's real base URL for the environment you're
  --    running this against (UAT, prod, etc.) — no trailing slash.
  v_base_url       text := 'https://REPLACE_WITH_REAL_QUIKINSIGHT_URL';

  -- ── 2. EDIT ME (optional): an extra deployed origin registered ALONGSIDE
  --    v_base_url, not instead of it (mirrors QUIKINSIGHT_DEPLOYED_URL in
  --    both the .ts script and seed-oauth.ts). Set to NULL to omit.
  v_deployed_url   text := NULL;

  -- Central launcher origin, used only to build the app-icon URL (same
  -- convention seed-oauth.ts uses for every app whose icon lives on quikit).
  v_quikit_base    text := 'https://REPLACE_WITH_REAL_QUIKIT_URL';

  -- ── 3. EDIT ME: replace with a REAL bcrypt hash (cost 12) of the real
  --    QUIKINSIGHT_OAUTH_CLIENT_SECRET value — see the header comment above
  --    for how to generate it. This placeholder is NOT usable as-is.
  v_client_secret_hash text := '$2a$12$D6v1tY4s8oj99OU2zHGSluImmBMoL12NiN8Nag02shwGOuhxtrH.K'; -- PLACEHOLDER — replace before running

  v_app_id         text;
  v_redirect_uris  text[];
  v_app_existed    boolean;
  v_client_existed boolean;
BEGIN
  IF v_base_url = 'https://REPLACE_WITH_REAL_QUIKINSIGHT_URL' THEN
    RAISE EXCEPTION 'migrate-quikinsight-oauth.sql: v_base_url is still the placeholder. Edit the DECLARE block before running.';
  END IF;
  IF v_client_secret_hash = '$2a$12$D6v1tY4s8oj99OU2zHGSluImmBMoL12NiN8Nag02shwGOuhxtrH.K' THEN
    RAISE EXCEPTION 'migrate-quikinsight-oauth.sql: v_client_secret_hash is still the placeholder bcrypt hash. Generate a real one and edit the DECLARE block before running.';
  END IF;

  v_redirect_uris := ARRAY[
    v_base_url || '/api/oauth/meta/callback',
    v_base_url || '/api/auth/callback/quikit'
  ];
  IF v_deployed_url IS NOT NULL THEN
    v_redirect_uris := v_redirect_uris ||
      ARRAY[v_deployed_url || '/api/oauth/meta/callback', v_deployed_url || '/api/auth/callback/quikit'];
  END IF;

  -- ── App registry row (required: OAuthClient.appId is a required FK into
  --    App.id, and the app launcher tile reads App.baseUrl/iconUrl/status) ──
  SELECT id INTO v_app_id FROM quikit."App" WHERE slug = v_slug;
  v_app_existed := v_app_id IS NOT NULL;

  IF v_app_existed THEN
    UPDATE quikit."App"
    SET name = 'QuikInsight',
        description = 'Marketing analytics — unifies analytics, ads, social, and CRM into one live dashboard.',
        "baseUrl" = v_base_url,
        status = 'active',
        "updatedAt" = now()
    WHERE slug = v_slug;
  ELSE
    v_app_id := 'quikinsight_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO quikit."App" (id, name, slug, description, "iconUrl", "baseUrl", status, "createdAt", "updatedAt", "requiresOrgAdmin")
    VALUES (
      v_app_id,
      'QuikInsight',
      v_slug,
      'Marketing analytics — unifies analytics, ads, social, and CRM into one live dashboard.',
      v_quikit_base || '/app-icons/quikinsight.svg',
      v_base_url,
      'active',
      now(),
      now(),
      false
    );
  END IF;

  -- ── OAuthClient row ─────────────────────────────────────────────────────
  SELECT EXISTS(SELECT 1 FROM quikit."OAuthClient" WHERE "clientId" = v_client_id) INTO v_client_existed;

  IF v_client_existed THEN
    UPDATE quikit."OAuthClient"
    SET "clientSecret" = v_client_secret_hash,
        "redirectUris" = v_redirect_uris,
        scopes = ARRAY['openid', 'profile', 'email', 'tenant'],
        "updatedAt" = now()
    WHERE "clientId" = v_client_id;
  ELSE
    INSERT INTO quikit."OAuthClient" (id, "appId", purpose, "clientName", "clientId", "clientSecret", "redirectUris", scopes, "grantTypes", "createdAt", "updatedAt")
    VALUES (
      'quikinsight_oauth_' || replace(gen_random_uuid()::text, '-', ''),
      v_app_id,
      'first_party',
      NULL,
      v_client_id,
      v_client_secret_hash,
      v_redirect_uris,
      ARRAY['openid', 'profile', 'email', 'tenant'],
      ARRAY['authorization_code', 'refresh_token'],
      now(),
      now()
    );
  END IF;

  -- ── Confirmation output ─────────────────────────────────────────────────
  RAISE NOTICE 'App %: % (slug=%) -> baseUrl=%', CASE WHEN v_app_existed THEN 'updated' ELSE 'created' END, 'QuikInsight', v_slug, v_base_url;
  RAISE NOTICE 'OAuthClient %: clientId=%', CASE WHEN v_client_existed THEN 'updated' ELSE 'created' END, v_client_id;
  RAISE NOTICE 'Redirect URIs: %', array_to_string(v_redirect_uris, ', ');
  RAISE NOTICE 'Scope check: only slug/clientId = ''quikinsight'' rows were read or written.';
END $$;

-- ── Post-run verification (run these separately to confirm) ─────────────────
-- SELECT id, name, slug, "baseUrl", status, "updatedAt" FROM quikit."App" WHERE slug = 'quikinsight';
-- SELECT id, "appId", "clientId", "redirectUris", scopes, "updatedAt" FROM quikit."OAuthClient" WHERE "clientId" = 'quikinsight';
