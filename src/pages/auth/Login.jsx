import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const { login, loginWithGoogle, resetPassword, user, tenant, isVendor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || '/';
      if (isVendor) {
        navigate('/sell/dashboard', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  }, [user, isVendor, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login successful!');

      // The useEffect above will handle the redirect
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      toast.success('Logged in with Google!');
    } catch (error) {
      console.error('Google login error:', error);
      if (error.code === 'auth/account-exists-with-different-credential') {
        toast.error('This email already uses a password. Log in with email and password instead.');
      } else {
        toast.error(error.message || 'Google login failed');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (resetLoading) return;
    if (!email) {
      toast.error('Enter your email first.');
      return;
    }
    setResetLoading(true);
    try {
      await resetPassword(email);
      toast.success('Password reset email sent. Check your inbox (and spam).');
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white shadow rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Login</h1>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {googleLoading ? (
            'Connecting...'
          ) : (
            <>
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 48 48"
                className="shrink-0"
              >
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.23 9.24 3.24l6.9-6.9C35.98 2.2 30.33 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.02 6.23C12.4 13 17.7 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.21-.42-4.73H24v9.46h12.68c-.55 2.97-2.2 5.49-4.67 7.18l7.19 5.58C43.53 37.95 46.5 31.66 46.5 24.5z"/>
                <path fill="#FBBC05" d="M10.58 28.45a14.96 14.96 0 0 1-.8-4.45c0-1.54.28-3.03.8-4.45l-8.02-6.23A23.95 23.95 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l8.02-6.33z"/>
                <path fill="#34A853" d="M24 48c6.33 0 11.65-2.09 15.53-5.68l-7.19-5.58c-2.01 1.36-4.58 2.16-8.34 2.16-6.3 0-11.6-3.5-13.42-8.18l-8.02 6.33C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div className="my-4 text-center text-xs text-gray-400">or</div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your password"
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetLoading}
              className="text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50"
            >
              {resetLoading ? 'Sending...' : 'Forgot password?'}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:text-blue-500">
              Register here
            </Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link to="/sell/apply" className="text-green-600 hover:text-green-500 text-sm">
            Want to sell on Mzansi Shop? Apply here
          </Link>
        </div>
      </div>
    </div>
  );
}
