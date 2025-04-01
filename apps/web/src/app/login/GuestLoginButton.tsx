'use client';

import { UserCircleIcon } from '@heroicons/react/24/solid';
import cx from 'classnames'; // Add this import
import { useRouter, useSearchParams } from 'next/navigation';
import { useContext } from 'react';
import { getHost } from '~shared/env/environment';
import { signInAsGuest } from '~src/actions/signInAsGuest';
import { UserSessionContext } from '~src/contexts/UserSessionContext';

interface Props {
  title: string;
  className?: string;
}

export function GuestLoginButton(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession: overrideSession } = useContext(UserSessionContext);

  const handleOnClick = async () => {
    const target = searchParams?.get('target'); // e.g., "%2Fportal"
    const { session } = await signInAsGuest();
    if (!session) return;
    await overrideSession(session);

    // Decode the target and construct an absolute URL
    const baseUrl = getHost(); // e.g., "http://localhost:3000"
    const redirectPath = target ? decodeURIComponent(target) : '/'; // Decode to "/portal"
    const absoluteUrl = new URL(redirectPath, baseUrl).toString(); // "http://localhost:3000/portal"
    router.push(absoluteUrl);
  };

  return (
    <div className={cx('h-12 w-full max-w-64', props.className)}>
      <button className="flex h-full w-full items-center justify-center rounded border-2" onClick={handleOnClick}>
        <UserCircleIcon className="mr-4 w-6 text-black opacity-60" />
        <p className="w-7/12 text-xs text-black plus:text-sm">{props.title}</p>
      </button>
    </div>
  );
}