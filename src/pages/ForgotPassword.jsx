import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordReset } from '../lib/auth';
import { APP_NAME } from '../config';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message ?? 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-gray-500">Reset your password</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-md px-3 py-3">
                Check your email for a password reset link.
              </div>
              <Link to="/login" className="text-sm text-blue-600 hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@buffalo.edu"
              />

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} disabled={loading} className="w-full">
                Send reset email
              </Button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-gray-500 hover:underline">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
