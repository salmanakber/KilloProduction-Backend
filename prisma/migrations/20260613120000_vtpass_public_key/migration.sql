-- VTpass: separate API key, public key (GET), and secret key (POST)

ALTER TABLE "vtpass_config" ADD COLUMN IF NOT EXISTS "publicKey" TEXT;
