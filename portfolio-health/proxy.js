import { NextResponse } from 'next/server';

// Password-protects every page and the data API with HTTP Basic Auth.
// Set DASHBOARD_PASSWORD (and optionally DASHBOARD_USER, default "powerplay") in Vercel.
export function proxy(request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const user = process.env.DASHBOARD_USER || 'powerplay';
  if (!password) {
    return new NextResponse('DASHBOARD_PASSWORD is not set. Add it in Vercel → Project → Settings → Environment Variables, then redeploy.', { status: 503 });
  }
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
