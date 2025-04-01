import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getHost } from '~shared/env/environment';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetPath = url.searchParams.get('target') || '/portal';

  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', getHost());
    loginUrl.searchParams.set('target', targetPath);
    return NextResponse.redirect(loginUrl);
  }

  const decodedTargetPath = decodeURIComponent(targetPath);
  const redirectUrl = new URL(decodedTargetPath, getHost());
  return NextResponse.redirect(redirectUrl);
}
