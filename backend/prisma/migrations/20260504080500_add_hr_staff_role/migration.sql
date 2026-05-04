-- Add HR_STAFF as a separate migration so PostgreSQL commits the enum value
-- before later migrations use it as a column default.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HR_STAFF';
