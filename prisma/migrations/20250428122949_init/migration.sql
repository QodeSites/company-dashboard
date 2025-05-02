-- CreateTable
CREATE TABLE "Account" (
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

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
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

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PooledAccountUser" (
    "id" SERIAL NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'read',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PooledAccountUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAccess" (
    "id" SERIAL NOT NULL,
    "source_account_id" TEXT NOT NULL,
    "target_account_id" TEXT NOT NULL,
    "access_level" TEXT NOT NULL DEFAULT 'read',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_account_id_key" ON "Account"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_qcode_key" ON "Account"("qcode");

-- CreateIndex
CREATE UNIQUE INDEX "User_user_id_key" ON "User"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_icode_key" ON "User"("icode");

-- CreateIndex
CREATE UNIQUE INDEX "PooledAccountUser_account_id_user_id_key" ON "PooledAccountUser"("account_id", "user_id");

-- AddForeignKey
ALTER TABLE "PooledAccountUser" ADD CONSTRAINT "PooledAccountUser_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("qcode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PooledAccountUser" ADD CONSTRAINT "PooledAccountUser_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("icode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAccess" ADD CONSTRAINT "AccountAccess_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "Account"("qcode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAccess" ADD CONSTRAINT "AccountAccess_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES "Account"("qcode") ON DELETE RESTRICT ON UPDATE CASCADE;
