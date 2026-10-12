import type { APIRoute } from 'astro';
import { auth, CLIENT_IP_HEADER } from '@/lib/server/auth';

export const prerender = false;

export const ALL: APIRoute = ({ request, clientAddress }) => {
    // Rate limiting keys on this header; overwrite any client-supplied value with the socket address.
    const headers = new Headers(request.headers);
    headers.set(CLIENT_IP_HEADER, clientAddress);
    return auth.handler(new Request(request, { headers }));
};
