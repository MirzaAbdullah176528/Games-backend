import { Hono } from 'hono'
import auth from './auth/auth'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:3000', 'https://digimart-frontend.pages.dev'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.route('/auth', auth)


export default app