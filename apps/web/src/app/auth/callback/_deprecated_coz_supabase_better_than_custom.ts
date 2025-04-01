import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const targetPath = requestUrl.searchParams.get('target') || '/portal'; // Change default to /portal
  const finalRedirect = requestUrl.searchParams.get('final_redirect') || '/portal'; // Change default to /portal

  console.log("Callback received:", { code, state, targetPath });

  if (!code || !state) {
    console.error("Missing code or state in callback");
    return NextResponse.redirect(new URL('/login?error=missing_params', requestUrl.origin));
  }

  const supabase = createRouteHandlerClient({ cookies: () => cookies() });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('Error exchanging code for session:', error);
    return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin));
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || requestUrl.origin;
  const redirectPath = targetPath || finalRedirect;
  const absoluteUrl = new URL(redirectPath, baseUrl).toString();

  return NextResponse.redirect(absoluteUrl);
}