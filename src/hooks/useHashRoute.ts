import { useEffect, useState } from 'react';

/** Parses location.hash into a route object. */
function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [head, tail] = hash.split('/');
  if (head === 'world' && tail) {
    const worldId = Number.parseInt(tail, 10);
    if (Number.isFinite(worldId)) return { screen: 'world', worldId };
  }
  if (head === 'lesson' && tail) {
    return { screen: 'lesson', lessonId: decodeURIComponent(tail) };
  }
  if (head === 'practice') {
    return { screen: 'practice' };
  }
  return { screen: 'home' };
}

export type Route =
  | { screen: 'home' }
  | { screen: 'world'; worldId: number }
  | { screen: 'lesson'; lessonId: string }
  | { screen: 'practice' };

/** Tiny hash router with browser back/forward support. */
export function useHashRoute(): [Route, (to: string) => void] {
  const [route, setRoute] = useState<Route>(() => {
    try {
      return parseHash();
    } catch {
      return { screen: 'home' };
    }
  });

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (to: string) => {
    const next = to.startsWith('#') ? to : `#${to}`;
    if (window.location.hash === next) return;
    window.location.hash = next;
  };

  return [route, navigate];
}
