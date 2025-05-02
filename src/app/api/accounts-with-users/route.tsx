// src/app/api/accounts-with-users/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        qcode: true,
        account_name: true,
        account_type: true,
        broker: true,
        pooled_account_users: {
          select: {
            users: {
              select: {
                icode: true,
                user_name: true,
                email: true
              }
            }
          }
        },
        account_access_target: {
          select: {
            target_account: {
              select: {
                qcode: true,
                account_name: true,
                account_type: true
              }
            }
          }
        },
        account_access_source: {
          select: {
            source_account: {
              select: {
                qcode: true,
                account_name: true,
                account_type: true
              }
            }
          }
        }
      }
    });
    

    const formatted = accounts.map(acc => ({
      id: acc.id,
      qcode: acc.qcode,
      account_name: acc.account_name,
      account_type: acc.account_type,
      users: acc.pooled_account_users.map(p => p.users),
      linked_accounts: acc.account_access_target.map(link => link.target_account),
      linked_by: acc.account_access_source.map(link => link.source_account),
    }));
    
    

    return NextResponse.json(formatted);
  } catch (err) {
    console.error("Error fetching accounts:", err);
    return NextResponse.json({ message: "Failed to fetch accounts" }, { status: 500 });
  }
}
