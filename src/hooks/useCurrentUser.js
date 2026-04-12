import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

let cachedUser = null;
let listeners = [];

function notify() {
  listeners.forEach(fn => fn(cachedUser));
}

export function useCurrentUser() {
  const [user, setUser] = useState(cachedUser);

  useEffect(() => {
    listeners.push(setUser);
    if (!cachedUser) {
      base44.auth.me().then(u => {
        cachedUser = u ? { ...u, email: u.email?.toLowerCase() } : u;
        notify();
      }).catch(() => {});
    }
    return () => {
      listeners = listeners.filter(fn => fn !== setUser);
    };
  }, []);

  return user;
}