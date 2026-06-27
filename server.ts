// server.ts
const handler = (req: Request): Response => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Chess Forge Server Online!", { status: 200 });
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);
  ws.onopen = () => onConnect(ws);
  return response;
};

// Fila de jogadores esperando (agora um array)
const waitingPlayers: WebSocket[] = [];

// ID único para logs
let nextId = 1;

// Mapa de pares para limpeza
const pairs = new Map<WebSocket, WebSocket>();

function heartbeat(ws: WebSocket) {
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    } else {
      clearInterval(interval);
    }
  }, 30000);
  ws.onclose = () => clearInterval(interval);
}

function onConnect(ws: WebSocket) {
  const id = nextId++;
  console.log(`[${new Date().toISOString()}] Player connected (${id})`);

  heartbeat(ws);
  waitingPlayers.push(ws);

  // Emparelha enquanto houver pelo menos 2 na fila
  while (waitingPlayers.length >= 2) {
    const host = waitingPlayers.shift()!;
    const client = waitingPlayers.shift()!;

    // Descarta sockets já fechados
    if (host.readyState !== WebSocket.OPEN) {
      if (client.readyState === WebSocket.OPEN) waitingPlayers.unshift(client);
      continue;
    }
    if (client.readyState !== WebSocket.OPEN) {
      if (host.readyState === WebSocket.OPEN) waitingPlayers.unshift(host);
      continue;
    }

    console.log(`Match found: ${id} vs ${id + 1}`);

    // Atribui papéis
    host.send(JSON.stringify({ type: "role", role: "host" }));
    client.send(JSON.stringify({ type: "role", role: "client" }));

    pairs.set(host, client);
    pairs.set(client, host);

    // Relay seguro (verifica JSON)
    const relay = (opponent: WebSocket) => (e: MessageEvent) => {
      try {
        JSON.parse(e.data); // só valida; se quiser filtrar, faça aqui
        if (opponent.readyState === WebSocket.OPEN) opponent.send(e.data);
      } catch {
        console.log("Invalid JSON received");
      }
    };

    host.onmessage = relay(client);
    client.onmessage = relay(host);

    // Limpeza ao desconectar
    const cleanup = (disconnected: WebSocket, opponent: WebSocket) => () => {
      if (opponent.readyState === WebSocket.OPEN) {
        opponent.send(JSON.stringify({ type: "opponent_disconnected" }));
      }
      pairs.delete(disconnected);
      pairs.delete(opponent);
      console.log("Player disconnected, opponent notified.");
    };

    host.onclose = cleanup(host, client);
    client.onclose = cleanup(client, host);
  }

  // Se ainda está na fila, avisa que está esperando
  if (waitingPlayers.includes(ws)) {
    ws.send(JSON.stringify({ type: "role", role: "waiting" }));
    console.log(`Player ${id} waiting...`);

    // Remove da fila ao desconectar
    ws.onclose = () => {
      const idx = waitingPlayers.indexOf(ws);
      if (idx !== -1) waitingPlayers.splice(idx, 1);
    };
  }
}

Deno.serve(handler);
