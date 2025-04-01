import { Session, SupabaseClient, User } from '@supabase/supabase-js';

export class MockSupabaseUser {
  public static email = 'mock-user@aident.ai';
  public static password = 'SecurePassword123!';

  public static async genLoginMockUser(supabase: SupabaseClient): Promise<{ user: User; session: Session }> {
    // First, try to sign in
    const { data, error } = await supabase.auth.signInWithPassword({ email: this.email, password: this.password });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        // Sign up if user doesn't exist
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: this.email,
          password: this.password,
        });
        if (signUpError) throw signUpError;
        if (!signUpData.user || !signUpData.session) throw new Error('User or session is null after signup');

        // Sign in after signup
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email: this.email,
          password: this.password,
        });
        if (loginError) throw loginError;
        if (!loginData.user || !loginData.session) throw new Error('User or session is null after login');
        return { user: loginData.user, session: loginData.session };
      }
      throw error;
    }

    if (!data.user || !data.session) throw new Error('User or session is null after successful login');
    return { user: data.user, session: data.session };
  }
}