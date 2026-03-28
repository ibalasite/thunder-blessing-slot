import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    version: process.env.npm_package_version /* istanbul ignore next */ ?? '0.1.0',
    timestamp: new Date().toISOString(),
  });
}
