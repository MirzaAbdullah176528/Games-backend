import { verify } from 'hono/jwt'
import { Hono } from "hono"
import { createMiddleware } from 'hono/factory'

type Variables = {
  user: {
    sub: string
    email: string
  }
}

type Bindings = {
  game_db: D1Database
  JWT_SECRET: string
}


export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.split(' ')[1]

  try {
    const decodedPayload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('user', { sub: String(decodedPayload.sub), email: String(decodedPayload.email) })
    console.log();
    
    await next()
  } catch (err) {
    return c.json({ error: 'Invalid or expired access token' }, 401)
  }
})
