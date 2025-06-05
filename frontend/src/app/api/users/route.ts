// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body) {
      return new NextResponse("Request body is missing", { status: 400 });
    }

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
      password
    } = body;

    // Generate unique icode with retry logic
    let newIcode: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      const totalUsers = await prisma.clients.count();
      newIcode = `QUS${String(totalUsers + 1 + attempts).padStart(5, '0')}`;
      
      const existingUser = await prisma.clients.findUnique({
        where: { icode: newIcode }
      });
      
      if (!existingUser) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error("Failed to generate unique icode after multiple attempts");
    }

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
        password
      }
    });

    return NextResponse.json({ 
      message: "User created!", 
      user: {
        icode: user.icode,
        email: user.email,
        password: user.password
      }
    });

  } catch (error) {
    console.error('POST /api/users error:', error);
    if (error instanceof Error && error.message.includes('Unique constraint failed')) {
      return new NextResponse("Failed to create user: Duplicate icode", { status: 409 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const icode = searchParams.get('icode');

  if (icode) {
    try {
      const user = await prisma.clients.findUnique({
        where: { icode },
        select: {
          icode: true,
          user_name: true,
          email: true,
          password: true,
          contact_number: true,
          created_at: true,
          birth_date: true,
          birth_time: true,
          birth_location: true,
          mother_name: true,
          father_name: true,
          husband_name: true,
          nominees: true,
          emergency_contact_name: true,
          emergency_contact_number: true,
          aadhar: true,
          pan: true,
          residential_address: true,
          gender: true,
          occupation: true,
        }
      });

      if (!user) {
        return new NextResponse("User not found", { status: 404 });
      }

      return NextResponse.json(user);
    } catch (error) {
      console.error(`GET /api/users?icode=${icode} error:`, error);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }

  try {
    const users = await prisma.clients.findMany({
      select: {
        user_id: true,
        icode: true,
        user_name: true,
        email: true
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

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const icode = searchParams.get('icode');
    
    if (!icode) {
      return new NextResponse("ICode is required", { status: 400 });
    }

    const body = await req.json();
    if (!body) {
      return new NextResponse("Request body is missing", { status: 400 });
    }

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
      password
    } = body;

    if (!user_name || !email || !password) {
      return new NextResponse("Name, email, and password are required", { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new NextResponse("Invalid email format", { status: 400 });
    }

    const updatedUser = await prisma.clients.update({
      where: { icode },
      data: {
        user_name,
        email,
        contact_number,
        birth_date: birth_date ? new Date(birth_date) : null,
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
        password
      },
      select: {
        icode: true,
        user_name: true,
        email: true,
        password: true,
        contact_number: true,
        created_at: true,
        birth_date: true,
        birth_time: true,
        birth_location: true,
        mother_name: true,
        father_name: true,
        husband_name: true,
        nominees: true,
        emergency_contact_name: true,
        emergency_contact_number: true,
        aadhar: true,
        pan: true,
        residential_address: true,
        gender: true,
        occupation: true,
      }
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('PUT /api/users error:', error);
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return new NextResponse("User not found", { status: 404 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}