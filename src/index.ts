import { Hono } from 'hono'
import auth from './auth/auth'
import { cors } from 'hono/cors'
import ttt from './ttt/ttt_route'
export { GameRoom } from './ttt/game_room'

const app = new Hono()

app.use('*', cors({
  origin: ['http://localhost:3000', 'https://digimart-frontend.pages.dev'],
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.route('/auth', auth)
app.route('/ttt', ttt)


export default app