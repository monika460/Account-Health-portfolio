import { NextResponse } from 'next/server';

// Optional password. If DASHBOARD_PASSWORD is set in Vercel, every page and the data API ask for it
// (username DASHBOARD_USER, default "powerplay"). If it is not set, the dashboard is open to anyone with the link.
export function proxy(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }
  const user = process.env.DASHBOARD_USER || 'powerplay';
  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(':');
      if (u === user && rest.join(':') === password) return NextResponse.next();
    } catch (e) { /* malformed header: fall through */ }
  }
  return new NextResponse('Sign in required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Portfolio health", charset="UTF-8"' }
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
