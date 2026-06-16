import { sign } from 'hono/jwt'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import bcrypt from 'bcryptjs'
import { zodValidator } from '../middleware/otpVerification'
import { signUpMiddleware } from '../middleware/otpVerification'
import { Resend } from 'resend'
import { getCookie, deleteCookie } from 'hono/cookie'
import { decode } from 'hono/jwt'
import { verify } from 'hono/jwt'
import z, { email } from 'zod'


type Variables = {
  user: {
    sub: string
    email: string
  }
}

type Bindings = {
  game_db: D1Database
  JWT_SECRET: string
  RESEND: string
}

interface verified {
  name: string,
  verified: boolean
}

interface user {
  name: string;
  email: string;
  id: number;
  games: number;
  TTT_games: number;
  bingo_games: number;
  chess_games: number;
  lost: number;
  wins: number;
  chess_lost: number;
  TTT_lost: number;
  bingo_lost: number;
  bingo_win: number;
  chess_win: number;
  TTT_win: number;
  verified: number
}
interface otp {
  issuedOTP:string;
  otp_expires_at:number
}

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>()


auth.post('/sign-up', zodValidator, signUpMiddleware, async (c) => {
  try{
  return c.json({ message: 'user created successfully, check your email' })
  }catch(err){
    return c.json({error: err instanceof Error? err.message : String(err)}, 500)
  }
})


auth.post('/login', async (c) => {
  try {
    const { name, password } = await c.req.json()

    if (!name || !password) {
      return c.json({ message: 'Username or password is missing' }, 400)
    }

    if (!c.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured')
      return c.json({ error: 'Server configuration error' }, 500)
    }

    const user = await c.env.game_db.prepare(
      'SELECT * FROM users WHERE name = ?'
    ).bind(name).first<{ id: number; name: string; email: string; password: string; otp: string | null; otp_expires_at: number | null; verified: number }>()

    if (!user) {
      return c.json({ message: 'Invalid credentials' }, 401)
    }

    if (user.verified === 0) {
      return c.json({ message: "User isn't verified" }, 403)
    }

    const passMatch = await bcrypt.compare(password, user.password)

    if (!passMatch) {
      return c.json({ message: 'Invalid credentials' }, 401)
    }

    const now = Math.floor(Date.now() / 1000)

    const accessToken = await sign(
      { sub: user.name, email: user.email, id: user.id, exp: now + 60 * 15 },
      c.env.JWT_SECRET
    )

    const refreshToken = await sign(
      { sub: user.name, email: user.email, id: user.id, exp: now + 60 * 60 * 24 * 7 },
      c.env.JWT_SECRET
    )

    const isProduction = c.req.url.startsWith('https')

    setCookie(c, 'refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'None' : 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    return c.json({ token: accessToken })

  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

auth.post('/verify', async (c) => {
  try {
    const { otp, name } = await c.req.json()

    if (!otp || !name) {
      return c.json({ error: 'OTP and name are required' }, 400)
    }

    const user = await c.env.game_db.prepare(
      'SELECT * FROM users WHERE name = ?'
    ).bind(name).first<{ id: number; name: string; email: string; otp: string; otp_expires_at: number; verified: number }>()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    if (user.otp !== otp) {
      return c.json({ error: 'Invalid OTP' }, 401)
    }

    
    const now = Math.floor(Date.now() / 1000)
    if (!user.otp_expires_at || user.otp_expires_at < now) {
      return c.json({ error: 'OTP has expired' }, 410)
    }

    
    await c.env.game_db.prepare(
      'UPDATE users SET verified = 1, otp = NULL, otp_expires_at = NULL WHERE name = ?'
    ).bind(name).run()

    
    const accessToken = await sign(
      { sub: user.name, email: user.email, id: user.id, exp: now + 60 * 15 },
      c.env.JWT_SECRET
    )

    const refreshToken = await sign(
      { sub: user.name, email: user.email, id: user.id, exp: now + 60 * 60 * 24 * 7 },
      c.env.JWT_SECRET
    )

    const isProduction = c.req.url.startsWith('https')

    setCookie(c, 'refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'None' : 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })

    
    return c.json({
      message: 'Verified successfully',
      accessToken,
      user: { id: user.id, name: user.name, email: user.email },
    })

  } catch (err) {
    
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

auth.post('/otp', async (c) => {
  try {
    
    const { email } = await c.req.json()

    if (!email) {
      return c.json({ error: 'Email is required' }, 400)
    }

    const user = await c.env.game_db.prepare(
      'SELECT name, email, verified FROM users WHERE email = ?'
    ).bind(email).first<{ name: string; email: string; verified: number }>()

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }


    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const otp_expires_at = Math.floor(Date.now() / 1000) + 60 * 10

    
    await c.env.game_db.prepare(
      'UPDATE users SET otp = ?, otp_expires_at = ? WHERE email = ?'
    ).bind(otp, otp_expires_at, email).run()

    
    const resend = new Resend(c.env.RESEND)
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Verification Code',
      html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    })

    
    return c.json({ message: 'New OTP sent to your email' })

  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})



auth.post('/refresh', async (c) => {
  try {
    const refreshToken = getCookie(c, 'refreshToken')

    if (!refreshToken) {
      return c.json({ error: 'No refresh token provided' }, 401)
    }

    const decoded = decode(refreshToken)
    const id = String(decoded.payload.id)
    const exp = decoded.payload.exp as number

    const isExpired = Math.floor(Date.now() / 1000) > exp

    if (isExpired) {
      return c.json({ error: 'Refresh token expired, session deactivated' }, 401)
    }

    const decodedPayload = await verify(refreshToken, c.env.JWT_SECRET, 'HS256')

    const newAccessToken = await sign(
      { sub: decodedPayload.sub, email: decodedPayload.email, id: id, exp: Math.floor(Date.now() / 1000) + 60 * 15 },
      c.env.JWT_SECRET
    )

    return c.json({ accessToken: newAccessToken, status: 'success' }, 200)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401)
  }
})



auth.post('/logout', async (c) => {
  const isProduction = c.req.url.startsWith('https')

  deleteCookie(c, 'refreshToken', {
    path: '/',
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'None' : 'Lax'
  })

  return c.json({ status: 'success', message: 'Logged out' }, 200)
})


auth.patch('update-profile', async (c)=> {
  try{

    const body = await c.req.json()

    const { name, email, password: rawPassword } = body

    const existingPassword = await c.env.game_db.prepare(
      'select password from users where email = ?'
    ).bind(email).first<string>('password')

    if (!existingPassword) {
      return c.json({ error: 'User not found' }, 404)
    }

    const isMatched = await bcrypt.compare(rawPassword, existingPassword)

    if(isMatched){
      return c.json({ 'error':'The password already exist try different one' })
    }

    if (!isMatched) {
      const password = bcrypt.hash(rawPassword, 10)

      await c.env.game_db.prepare(
        'UPDATE users SET password=?'
      ).bind(password).run()
    }

    return c.json({ status: 'success' }, 200)
  }catch(err){
    return c.json({"error": err instanceof Error? err.message : String(err)})
  }
})

export default auth