import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Reserve unknown service paths, including /_ itself, without doc fallback. */
const unknownService: RequestHandler = () => json({ message: 'Unknown service route' }, { status: 404 });

export const GET = unknownService;
export const POST = unknownService;
export const PUT = unknownService;
export const PATCH = unknownService;
export const DELETE = unknownService;
