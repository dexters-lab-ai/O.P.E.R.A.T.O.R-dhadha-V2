import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getHost } from '~shared/env/environment';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const targetPath = url.searchParams.get('target') || '/portal';

  const supabase = createRouteHandlerClient({ cookies: () => cookies() });

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  const decodedTargetPath = decodeURIComponent(targetPath);
  const redirectUrl = new URL(decodedTargetPath, getHost());
  return NextResponse.redirect(redirectUrl);
}