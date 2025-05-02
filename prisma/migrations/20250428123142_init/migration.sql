/*
  Warnings:

  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AccountAccess` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PooledAccountUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AccountAccess" DROP CONSTRAINT "AccountAccess_source_account_id_fkey";

-- DropForeignKey
ALTER TABLE "AccountAccess" DROP CONSTRAINT "AccountAccess_target_account_id_fkey";

-- DropForeignKey
ALTER TABLE "PooledAccountUser" DROP CONSTRAINT "PooledAccountUser_account_id_fkey";

-- DropForeignKey
ALTER TABLE "PooledAccountUser" DROP CONSTRAINT "PooledAccountUser_user_id_fkey";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "AccountAccess";

-- DropTable
DROP TABLE "PooledAccountUser";

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "qcode" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "broker" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "email_linked" TEXT,
    "contact_number" TEXT,
    "login_id" TEXT,
    "login_password" TEXT,
    "totp_secret" TEXT,
    "api_details" JSONB,
    "nominees" TEXT,
    "aadhar" TEXT,
    "pan" TEXT,
    "remarks" TEXT DEFAULT 'NA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "icode" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact_number" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3),
    "birth_time" TEXT,
    "birth_location" TEXT,
    "mother_name" TEXT,
    "father_name" TEXT,
    "husband_name" TEXT,
    "nominees" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_number" TEXT,
    "aadhar" TEXT,
    "pan" TEXT,
    "residential_address" TEXT,
    "gender" TEXT,
    "occupation" TEXT,
    "remarks" TEXT DEFAULT 'NA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pooled_account_users" (
    "id" SERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'read',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pooled_account_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_access" (
    "id" SERIAL NOT NULL,
    "source_account_id" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'read',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_account_id_key" ON "accounts"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_qcode_key" ON "accounts"("qcode");

-- CreateIndex
CREATE UNIQUE INDEX "users_user_id_key" ON "users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_icode_key" ON "users"("icode");

-- CreateIndex
CREATE UNIQUE INDEX "pooled_account_users_account_id_user_id_key" ON "pooled_account_users"("account_id", "user_id");

-- AddForeignKey
ALTER TABLE "pooled_account_users" ADD CONSTRAINT "pooled_account_users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("qcode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pooled_account_users" ADD CONSTRAINT "pooled_account_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("icode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_access" ADD CONSTRAINT "account_access_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "accounts"("qcode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_access" ADD CONSTRAINT "account_access_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "accounts"("qcode") ON DELETE RESTRICT ON UPDATE CASCADE;
