import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { LogIn, LogOut, User, AlertCircle } from 'lucide-react';

export default function UserButton() {
  const { user, loading, authError, setAuthError, signInWithGoogle, logOut } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignInClick = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      // Handled in AuthContext
    } finally {
      setIsSigningIn(false);
    }
  };

  if (loading) {
    return <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--surface-sunken)' }} />;
  }

  if (user) {
    return (
      <button
        onClick={logOut}
        className="btn-secondary"
        style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
        title="Sign Out"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt={user.displayName || 'User'} style={{ width: 24, height: 24, borderRadius: '50%' }} />
        ) : (
          <User size={16} />
        )}
        <span style={{ fontSize: '14px', fontWeight: 500 }}>{user.displayName?.split(' ')[0] || 'User'}</span>
        <LogOut size={16} style={{ marginLeft: '4px' }} />
      </button>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleSignInClick}
        disabled={isSigningIn}
        className="btn-primary"
        style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', opacity: isSigningIn ? 0.7 : 1 }}
        title="Sign In with Google to sync your data"
      >
        <LogIn size={16} />
        <span>{isSigningIn ? 'Signing in...' : 'Sign In'}</span>
      </button>

      {authError && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '8px',
          backgroundColor: '#fef2f2',
          color: '#ef4444',
          border: '1px solid #ef4444',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          maxWidth: '280px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>{authError}</div>
          <button 
            onClick={() => setAuthError(null)} 
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontWeight: 'bold' }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

