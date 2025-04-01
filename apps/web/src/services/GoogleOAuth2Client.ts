import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

export const getGoogleOAuth2Client = (callback?: string): OAuth2Client =>
  new google.auth.OAuth2({
    clientId: process.env.1084136474410-ee0m4g2jplc6bgdd4vemkspno6u074gs.apps.googleusercontent.com,
    clientSecret: process.env.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,
    redirectUri: callback || `${process.env.NEXT_PUBLIC_ORIGIN}/plugin/oauth/callback`,
  });
