// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Function to generate a random password
function generatePassword(length: number = 12): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// ========== Create New User ==========
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      user_name,
      email,
      contact_number,
      birth_date,
      birth_time,
      birth_location,
      mother_name,
      father_name,
      husband_name,
      nominees,
      emergency_contact_name,
      emergency_contact_number,
      aadhar,
      pan,
      residential_address,
      gender,
      occupation,
    } = body;

    // Validate required fields
    if (!user_name || !user_name.trim()) {
      return NextResponse.json({ message: "Full Name is required" }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "Invalid email format" }, { status: 400 });
    }

    // Check if email already exists
    const existingUser = await prisma.clients.findFirst({
      where: { email },
    });
    if (existingUser) {
      return NextResponse.json({ message: "Email is already in use" }, { status: 400 });
    }

    // Generate password
    const generatedPassword = generatePassword();

    // Count how many users exist
    const totalUsers = await prisma.clients.count();

    // Generate new QUSxxxxx code
    const newIcode = `QUS${String(totalUsers + 1).padStart(5, "0")}`;

    // Create user
    const user = await prisma.clients.create({
      data: {
        user_name,
        email,
        contact_number,
        birth_date: birth_date ? new Date(birth_date) : undefined,
        birth_time,
        birth_location,
        mother_name,
        father_name,
        husband_name,
        nominees,
        emergency_contact_name,
        emergency_contact_number,
        aadhar,
        pan,
        residential_address,
        gender,
        occupation,
        icode: newIcode,
        user_id: crypto.randomUUID(),
        password: generatedPassword, // Store plain-text password (see security note)
      },
    });

    return NextResponse.json({
      message: "User created!",
      user: {
        icode: user.icode,
        user_name: user.user_name,
        email: user.email,
      },
      generatedPassword,
    });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request, 
  { params }: { params: Promise<{ icode: string }> }
) {
  try {
    const { icode } = await params;

    // Start a transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // Delete related records in pooled_account_users
      await tx.pooledAccountUser.deleteMany({
        where: { icode },
      });

      // Delete related records in pooled_account_allocations
      await tx.pooled_account_allocations.deleteMany({
        where: { icode },
      });

      // Delete the user from clients table (not user table)
      const user = await tx.clients.delete({
        where: { icode },
      });

      if (!user) {
        throw new Error("User not found");
      }
    });

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error(`DELETE /api/users/[icode] error:`, error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}

// ========== Fetch All Users ==========
export async function GET() {
  try {
    const users = await prisma.clients.findMany({
      select: {
        user_id: true,
        icode: true,
        user_name: true,
        email: true,
      },
      orderBy: {
        user_id: "asc",
      },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}