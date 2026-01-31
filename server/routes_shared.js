
import { z } from 'zod';

export const api = {
  connect: {
    method: 'GET' as const,
    path: '/api/connect',
    input: z.object({
      loginpairing: z.string().optional(),
      qrlogin: z.string().optional(),
      logout: z.string().optional(),
    }).optional(),
    responses: {
      200: z.any(), // Can return JSON or HTML depending on query param
    },
  },
  status: {
    method: 'GET' as const,
    path: '/api/status',
    responses: {
      200: z.object({
        status: z.enum(['connected', 'disconnected', 'connecting']),
        qr: z.string().optional(), // QR code data if needed
      }),
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
