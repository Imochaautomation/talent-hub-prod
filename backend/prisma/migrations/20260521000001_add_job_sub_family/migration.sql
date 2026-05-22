CREATE TABLE "job_sub_families" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobFamilyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "job_sub_families_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "job_sub_families" ADD CONSTRAINT "job_sub_families_jobFamilyId_fkey"
    FOREIGN KEY ("jobFamilyId") REFERENCES "job_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_sub_families" ADD CONSTRAINT "job_sub_families_name_jobFamilyId_key"
    UNIQUE ("name", "jobFamilyId");

ALTER TABLE "job_codes" ADD COLUMN "jobSubFamilyId" TEXT;

ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_jobSubFamilyId_fkey"
    FOREIGN KEY ("jobSubFamilyId") REFERENCES "job_sub_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
