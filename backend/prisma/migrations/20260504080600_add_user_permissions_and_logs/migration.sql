-- Add user auth/RBAC columns that exist in schema.prisma but were missing from
-- the committed migrations.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Invite system for user onboarding and password reset links.
CREATE TABLE IF NOT EXISTS "user_invites" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'HR_STAFF',
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "token" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_invites_email_key" ON "user_invites"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "user_invites_token_key" ON "user_invites"("token");
CREATE INDEX IF NOT EXISTS "user_invites_token_idx" ON "user_invites"("token");
CREATE INDEX IF NOT EXISTS "user_invites_email_idx" ON "user_invites"("email");

-- Append-only audit trail for sensitive platform actions.
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- Mail log used by application logs and email history views.
CREATE TABLE IF NOT EXISTS "mail_logs" (
  "id" TEXT NOT NULL,
  "sentById" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "useCase" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mail_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mail_logs_sentById_idx" ON "mail_logs"("sentById");
CREATE INDEX IF NOT EXISTS "mail_logs_sentAt_idx" ON "mail_logs"("sentAt");

-- Foreign keys are added after table creation so this migration is idempotent
-- for environments where tables were manually patched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_invites_invitedById_fkey'
  ) THEN
    ALTER TABLE "user_invites"
      ADD CONSTRAINT "user_invites_invitedById_fkey"
      FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_userId_fkey'
  ) THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mail_logs_sentById_fkey'
  ) THEN
    ALTER TABLE "mail_logs"
      ADD CONSTRAINT "mail_logs_sentById_fkey"
      FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
