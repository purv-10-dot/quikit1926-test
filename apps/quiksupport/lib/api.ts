import { ZodError } from 'zod'
import { AuthError } from './errors'

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status })
}

export function errorResponse(message: string, status = 400, details?: unknown): Response {
  return Response.json(
    { success: false, error: message, details },
    { status }
  )
}

export function handleApiError(error: unknown): Response {
  if (error instanceof AuthError) {
    return errorResponse(error.message, error.status)
  }
  if (error instanceof ZodError) {
    return errorResponse('Validation failed', 422, error.flatten())
  }
  if (error instanceof Error) {
    console.error('[API Error]', error)
    return errorResponse(
      process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      500
    )
  }
  return errorResponse('Unknown error', 500)
}

export function paginationParams(url: URL): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')))
  return { page, limit, skip: (page - 1) * limit }
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  }
}
