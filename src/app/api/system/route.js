// src/app/api/system/route.js
import { exec } from 'child_process';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { type } = await req.json();

    let command = "";
    if (type === 'shutdown') {
      command = "shutdown /s /t 0"; // Perintah Windows
    } else if (type === 'restart') {
      command = "shutdown /r /t 0"; // Perintah Windows[cite: 24]
    }

    if (command) {
      // Jalankan perintah sistem
      exec(command);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: "Invalid Command" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}