import { Hono } from 'hono'
import { requireAuth } from '../middleware/authMiddleware'

type Bindings = {
    game_db: D1Database
    JWT_SECRET: string
    GAME_ROOM: DurableObjectNamespace
}

type Variables = {
    user: {
        sub: string
        email: string
    }
}

const ttt = new Hono<{ Bindings: Bindings; Variables: Variables }>()

ttt.post('/rooms', requireAuth, async (c) => {
    try {
        const username = c.get('user').sub

        console.log('GAME_ROOM', c.env.GAME_ROOM)
        console.log('JWT_SECRET', !!c.env.JWT_SECRET)
        console.log('user', c.get('user'))

        const playerData = await c.env.game_db
            .prepare('SELECT id, elo FROM users WHERE name = ?')
            .bind(username)
            .first<{ id: number; elo: number }>()

        if (!playerData) return c.json({ error: 'User not found' }, 404)

        if (!c.env.GAME_ROOM) {
            return c.json({
                error: 'GAME_ROOM binding missing'
            }, 500)
        }

        const roomId = crypto.randomUUID()
        const token = crypto.randomUUID()

        const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(roomId))

        const res = await stub.fetch('http://do/internal/register-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                userId: playerData.id,
                username,
                elo: playerData.elo,
                symbol: 'X',
                roomId,
            }),
        })

        if (!res.ok) return c.json({ error: 'Failed to initialize room' }, 500)

        return c.json({ roomId, token })
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
})

ttt.post('/rooms/:id/join', requireAuth, async (c) => {
    try {
        const username = c.get('user').sub
        const roomId = c.req.param('id')

        const playerData = await c.env.game_db
            .prepare('SELECT id, elo FROM users WHERE name = ?')
            .bind(username)
            .first<{ id: number; elo: number }>()

        if (!playerData) return c.json({ error: 'User not found' }, 404)

        const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(roomId))

        const statusRes = await stub.fetch('http://do/status')
        const { gameState, players } = await statusRes.json<{
            gameState: { status: string } | null
            players: { X: unknown; O: unknown } | null
        }>()

        if (!gameState || !players) return c.json({ error: 'Room not found' }, 404)
        if (players.O !== null) return c.json({ error: 'Room is full' }, 409)
        if (gameState.status === 'finished') return c.json({ error: 'Game already finished' }, 410)

        const token = crypto.randomUUID()

        const res = await stub.fetch('http://do/internal/register-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                userId: playerData.id,
                username,
                elo: playerData.elo,
                symbol: 'O',
                roomId,
            }),
        })

        if (!res.ok) return c.json({ error: 'Failed to join room' }, 500)

        return c.json({ roomId, token })
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
})

ttt.post('/rooms/:id/reconnect', requireAuth, async (c) => {
    try {
        const username = c.get('user').sub
        const roomId = c.req.param('id')

        const playerData = await c.env.game_db
            .prepare('SELECT id FROM users WHERE name = ?')
            .bind(username)
            .first<{ id: number }>()

        if (!playerData) return c.json({ error: 'User not found' }, 404)

        const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(roomId))

        const statusRes = await stub.fetch('http://do/status')
        const { gameState, players } = await statusRes.json<{
            gameState: { status: string } | null
            players: {
                X: { userId: number; elo: number; connected: boolean } | null
                O: { userId: number; elo: number; connected: boolean } | null
            } | null
        }>()

        if (!gameState || !players) return c.json({ error: 'Room not found' }, 404)
        if (gameState.status === 'finished') return c.json({ error: 'Game already finished' }, 410)

        const symbol = players.X?.userId === playerData.id
            ? 'X'
            : players.O?.userId === playerData.id
                ? 'O'
                : null

        if (!symbol) return c.json({ error: 'You are not a player in this room' }, 403)

        const playerState = players[symbol]!

        if (playerState.connected) return c.json({ error: 'Already connected' }, 409)

        const token = crypto.randomUUID()

        const res = await stub.fetch('http://do/internal/register-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token,
                userId: playerData.id,
                username,
                elo: playerState.elo,
                symbol,
                roomId,
            }),
        })

        if (!res.ok) return c.json({ error: 'Failed to issue reconnect token' }, 500)

        return c.json({ roomId, token })
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
})

ttt.get('/rooms/:id/ws', async (c) => {
    const roomId = c.req.param('id')
    const token = c.req.query('token')

    if (!token) return c.json({ error: 'Missing token' }, 401)

    if (c.req.header('Upgrade') !== 'websocket') {
        return c.json({ error: 'Expected WebSocket upgrade' }, 426)
    }

    const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(roomId)) 

    const wsUrl = new URL(c.req.raw.url)
    wsUrl.pathname = '/ws'
    return stub.fetch(new Request(wsUrl.toString(), c.req.raw))
})

ttt.get('/leaderboard', async (c) => {
    try {
        const limit = Math.min(Number(c.req.query('limit') ?? 20), 100)
        const offset = Number(c.req.query('offset') ?? 0)

        const result = await c.env.game_db
            .prepare(
                `SELECT
          name,
          elo,
          TTT_win    AS wins,
          TTT_lost   AS losses,
          TTT_draws  AS draws,
          TTT_games  AS games,
          ROUND(CAST(TTT_win AS FLOAT) / NULLIF(TTT_games, 0) * 100, 1) AS win_rate
        FROM users
        WHERE TTT_games > 0
        ORDER BY elo DESC
        LIMIT ? OFFSET ?`
            )
            .bind(limit, offset)
            .all()

        const ranked = result.results.map((row, i) => ({
            rank: offset + i + 1,
            username: row.name,
            elo: row.elo,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
            games: row.games,
            win_rate: row.win_rate != null ? `${row.win_rate}%` : '0%',
        }))

        return c.json(ranked)
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
})

export default ttt