const handler = (req: Request): Response => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Chess Forge Server Online!", { status: 200 });
  }

  const { socket: ws, response } = Deno.upgradeWebSocket(req);
  ws.onopen = () => onConnect(ws);
  return response;
};

let waitingPlayer: WebSocket | null = null;

function onConnect(ws: WebSocket) {
  console.log("Player connected");

  if (waitingPlayer && waitingPlayer.readyState === WebSocket.OPEN) {
    const host = waitingPlayer;
    waitingPlayer = null;

    host.send(JSON.stringify({ type: "role", role: "host" }));
    ws.send(JSON.stringify({ type: "role", role: "client" }));

    console.log("Match found!");

    host.onmessage = (e) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    ws.onmessage = (e) => {
      if (host.readyState === WebSocket.OPEN) host.send(e.data);
    };

    host.onclose = () => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "opponent_disconnected" }));
    };
    ws.onclose = () => {
      if (host.readyState === WebSocket.OPEN)
        host.send(JSON.stringify({ type: "opponent_disconnected" }));
    };

  } else {
    waitingPlayer = ws;
    ws.send(JSON.stringify({ type: "role", role: "waiting" }));
    console.log("Player waiting...");

    ws.onclose = () => {
      if (waitingPlayer === ws) waitingPlayer = null;
    };
  }
}

Deno.serve(handler);
