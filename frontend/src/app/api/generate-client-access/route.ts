// /app/api/generate-client-access/route.ts (for client.qodeinvest.com)
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();
    console.log('Received clientId:', clientId);
    
    if (!clientId) {
      return NextResponse.json({ error: 'Client ID required' }, { status: 400 });
    }

    console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
    
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not found in environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Generate JWT token - using clientId (which is icode) directly
    const token = jwt.sign({
      client_id: clientId, // This should be the icode
      role: 'internal_viewer',
      exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours
      iat: Math.floor(Date.now() / 1000),
    }, process.env.JWT_SECRET);

    console.log('Generated token for client:', clientId);

    // Create access URL - make sure this matches your portfolio app domain
    const accessUrl = `https://portfolio.qodeinvest.com/api/auth/internal-access?token=${token}`;

    return NextResponse.json({ 
      success: true, 
      accessUrl,
      expiresIn: '2 hours',
      clientId: clientId
    });

  } catch (error) {
    console.error('Token generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Alternative GET route for direct links
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID required' }, { status: 400 });
  }

  // Create a POST request to generate token
  return POST(new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ clientId: clientId }), // Keep as string since it's icode
    headers: request.headers,
  }));
}