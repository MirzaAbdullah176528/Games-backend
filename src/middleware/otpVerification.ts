import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'

type Bindings = {
  game_db: D1Database
  JWT_SECRET: string
  RESEND: string
}

type Variables = {
  name: string
  email: string
  password: string
}

const signUpSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

export const zodValidator = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  try {
    const body = await c.req.json()
    const result = signUpSchema.safeParse(body)

    if (!result.success) {
        return c.json({ message: result.error.flatten() }, 400)  
    }

    c.set('name', result.data.name)
    c.set('email', result.data.email)
    c.set('password', result.data.password)
    
    await next()

  } catch(err) {
    return c.json({ error: err instanceof Error? err.message: String(err) }, 400)
  }  
})



export const signUpMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const name = c.var.name
  const email = c.var.email
  const password = c.var.password

  let hashed: string
  try {
    hashed = await bcrypt.hash(password, 10)
  } catch {
    return c.json({ error: 'Password hashing failed' }, 500)
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const otp_expires_at = Math.floor(Date.now() / 1000) + 60 * 10

  try {
    await c.env.game_db.prepare(
      'INSERT INTO users (name, email, password, otp, otp_expires_at, verified) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(name, email, hashed, otp, otp_expires_at).run()
  } catch (err: any) {
    
    const errMsg = String(err?.message ?? err?.cause?.message ?? err ?? '')

    if (errMsg.includes('UNIQUE')) {
      return c.json({ error: 'Email already registered' }, 409)
    }

    console.error('DB insert error:', err)
    return c.json({ error: 'Database error' }, 500)
  }

  try {
    const resend = new Resend(c.env.RESEND)
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Verification Code',
      html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    })
  } catch (err) {
    console.error('Email send failed:', err)
  }

  await next()
})