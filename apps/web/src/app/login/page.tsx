'use client';

import cx from 'classnames';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import AidentLogo from '~assets/aident-logo-white.svg';
import { isStringConfigOn, getHost } from '~shared/env/environment';
import { EmailLoginButton } from '~src/app/login/EmailLoginButton';
import { GuestLoginButton } from '~src/app/login/GuestLoginButton';
import GoogleLoginButton from '~src/components/GoogleLoginButton';
import NavigationButton from '~src/components/NavigationButton';
import '~src/components/styles/mesh-bg.scss';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Props {
  params?: Record<string, string>;
  searchParams?: Record<string, string>;
}

export default function LoginPage({ params, searchParams }: Props) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const enableLoginGuest = isStringConfigOn(process.env.NEXT_PUBLIC_ENABLE_LOGIN_GUEST);
  const enableLoginEmail = isStringConfigOn(process.env.NEXT_PUBLIC_ENABLE_LOGIN_EMAIL);
  const enableLoginGoogle = isStringConfigOn(process.env.NEXT_PUBLIC_ENABLE_LOGIN_GOOGLE);

  // Extract error and target from searchParams
  const error = searchParams?.error;
  const targetPath = searchParams?.target || '/portal';

  // Check for an existing session and redirect if authenticated
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const decodedTarget = decodeURIComponent(targetPath);
        const absoluteUrl = new URL(decodedTarget, getHost()).toString();
        router.push(absoluteUrl);
      }
    };
    checkSession();
  }, [router, targetPath]);

  // Handle error messages on mount
  useEffect(() => {
    if (error) {
      console.error("Login error:", error);
      switch (error) {
        case 'auth_failed':
          setErrorMessage('Authentication failed. Please try again.');
          break;
        case 'server_error':
          setErrorMessage('Server error occurred. Please try again later.');
          break;
        default:
          setErrorMessage('An unexpected error occurred. Please try again.');
      }
    }
  }, [error]);

  return (
    <main className={cx('flex h-screen w-screen', 'mesh-bg')}>
      <NavigationButton />

      <div className="m-auto flex flex-col items-center justify-center rounded-xl p-2">
        <div className="flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black">
            <Image className="h-9 w-9" src={AidentLogo} alt="Aident Logo" />
          </div>
          <h1 className="ml-4 text-2xl font-extralight text-black">OPERATOR AI</h1>
        </div>

        <div className="mt-8 flex w-full flex-col items-center justify-center rounded-xl bg-white px-4 py-8 shadow-2xl shadow-neutral-600 plus:w-72 plus:px-6 tablet:w-96 tablet:px-12 tablet:py-12">
          <div className="flex w-full flex-col items-center">
            <h1 className="text-center text-lg font-medium text-black plus:text-xl tablet:text-2xl">Get Started Now</h1>
            <p className="tablet:text-md mt-4 max-w-sm text-center text-xs font-light text-black opacity-30 plus:text-sm">
              Unleash the power of AI
              <br />
              Discover the future of your software
            </p>
            {errorMessage && (
              <p className="mt-4 text-center text-sm text-red-500">{errorMessage}</p>
            )}
          </div>
          <div className="mb-4 mt-8 h-px w-full bg-black opacity-5 tablet:mb-6 tablet:mt-10" />

          {enableLoginGuest && (
            <GuestLoginButton
              title="Continue as Guest"
              className="mb-2 w-full rounded-md bg-gray-200 py-2 text-center text-black hover:bg-gray-300"
            />
          )}
          {enableLoginEmail && (
            <EmailLoginButton
              title="Continue with Email"
              className="mb-2 w-full rounded-md bg-blue-200 py-2 text-center text-black hover:bg-blue-300"
            />
          )}
          {enableLoginGoogle && (
            <GoogleLoginButton
              oauth={isStringConfigOn(searchParams?.oAuth || 'false')}
              targetPath={targetPath}
              className="w-full rounded-md bg-red-200 py-2 text-center text-black hover:bg-red-300"
            />
          )}
        </div>
      </div>
    </main>
  );
}