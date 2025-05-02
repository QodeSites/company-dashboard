// src/app/api/users/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Already created during accounts API

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
      occupation
    } = body;

    // 1. Count how many users exist
    const totalUsers = await prisma.user.count();

    // 2. Generate new QUSxxxxx code
    const newIcode = `QUS${String(totalUsers + 1).padStart(5, '0')}`;

    // 3. Create user
    const user = await prisma.user.create({
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
        user_id: crypto.randomUUID(), // random internal ID
      }
    });

    return NextResponse.json({ message: "User created!", user });

  } catch (error) {
    console.error('POST /api/users error:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// ========== Fetch All Users ==========
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        user_id: true,
        icode:true,
        user_name: true,
      },
      orderBy: {
        user_id: "asc",
      },
    });
    return NextResponse.json(users);

  } catch (error) {
    console.error('GET /api/users error:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
