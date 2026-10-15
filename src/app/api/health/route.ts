import { NextResponse } from "next/server";

/** Checagem simples de disponibilidade — útil para monitoramento do deploy. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "carreirapro-backend" });
}
