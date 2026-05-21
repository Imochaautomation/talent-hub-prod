-- Make employee email nullable so employees imported without an email address show a blank field
ALTER TABLE "employees" ALTER COLUMN "email" DROP NOT NULL;
