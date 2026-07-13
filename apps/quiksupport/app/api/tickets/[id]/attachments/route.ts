import { type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { withHelpdeskAuth } from '@/lib/api/withHelpdeskAuth'
import { successResponse, errorResponse } from '@/lib/api'
import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

const MAX_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'application/zip',
]

export const GET = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, _req, { params }) => {
  const { id } = params

  const ticket = await prisma.ticket.findFirst({ where: { id, tenant_id: tenantId } })
  if (!ticket) return errorResponse('Ticket not found', 404)

  if (user.role === 'CUSTOMER' && ticket.requester_id !== user.id) {
    return errorResponse('Access denied', 403)
  }

  const attachments = await prisma.attachment.findMany({
    where: { ticket_id: id },
    include: { uploader: { select: { id: true, name: true } } },
    orderBy: { created_at: 'asc' },
  })

  return successResponse(attachments)
})

export const POST = withHelpdeskAuth<{ id: string }>(async ({ tenantId, user }, req: NextRequest, { params }) => {
  const { id } = params

  const ticket = await prisma.ticket.findFirst({ where: { id, tenant_id: tenantId } })
  if (!ticket) return errorResponse('Ticket not found', 404)

  if (user.role === 'CUSTOMER' && ticket.requester_id !== user.id) {
    return errorResponse('Access denied', 403)
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return errorResponse('No file provided', 400)
  if (file.size > MAX_SIZE) return errorResponse(`File too large (max ${process.env.MAX_FILE_SIZE_MB || 10}MB)`, 400)
  if (!ALLOWED_TYPES.includes(file.type)) return errorResponse('File type not allowed', 400)

  await fs.mkdir(UPLOAD_DIR, { recursive: true })

  const ext = path.extname(file.name)
  const fileName = `${randomUUID()}${ext}`
  const filePath = path.join(UPLOAD_DIR, fileName)
  const fileUrl = `/uploads/${fileName}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(filePath, buffer)

  const attachment = await prisma.attachment.create({
    data: {
      ticket_id: id,
      uploaded_by: user.id,
      file_name: file.name,
      file_url: fileUrl,
      file_size: file.size,
      mime_type: file.type,
    },
    include: { uploader: { select: { id: true, name: true } } },
  })

  return successResponse(attachment, 201)
})
