const WebSocket = require('ws')
const PORT = process.env.PORT || 3000
const wss = new WebSocket.Server({ port: PORT })

let waitingPlayer = null

console.log(`Server running on port ${PORT}`)

wss.on('connection', (ws) => {
    console.log('Player connected')
    ws.isAlive = true

    if (waitingPlayer && waitingPlayer.readyState === WebSocket.OPEN) {
        // Tem alguém esperando: emparelha os dois
        const host = waitingPlayer
        waitingPlayer = null

        host.opponent = ws
        ws.opponent = host

        host.send(JSON.stringify({ type: 'role', role: 'host' }))
        ws.send(JSON.stringify({ type: 'role', role: 'client' }))

        console.log('Match found!')

        // Relay: tudo que um manda, o outro recebe
        host.on('message', (msg) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(msg)
        })
        ws.on('message', (msg) => {
            if (host.readyState === WebSocket.OPEN) host.send(msg)
        })

        host.on('close', () => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'opponent_disconnected' })) })
        ws.on('close', () => { if (host.readyState === WebSocket.OPEN) host.send(JSON.stringify({ type: 'opponent_disconnected' })) })

    } else {
        // Ninguém esperando: vira host e fica na fila
        waitingPlayer = ws
        ws.send(JSON.stringify({ type: 'role', role: 'waiting' }))
        console.log('Player waiting for opponent...')

        ws.on('close', () => {
            if (waitingPlayer === ws) waitingPlayer = null
        })
    }
})
