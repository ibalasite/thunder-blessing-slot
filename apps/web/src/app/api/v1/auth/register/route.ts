import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '../../../../../container';
import { handleError } from '../../../../../shared/errors/errorHandler';
import { AppError } from '../../../../../shared/errors/AppError';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation(parsed.error.errors[0]?.message /* istanbul ignore next */ ?? 'Invalid input');
    }

    const { email, password } = parsed.data;
    const user = await container.authProvider.register(email, password);

    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
