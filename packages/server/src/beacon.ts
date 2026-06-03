import { createSocket, Socket } from 'dgram';

const DISCOVERY_PORT = 41234;

let beaconSocket: Socket | null = null;
let beaconInterval: ReturnType<typeof setInterval> | null = null;

export function startBeacon(port: number): void {
  beaconSocket = createSocket('udp4');
  beaconSocket.bind(() => {
    beaconSocket!.setBroadcast(true);
    const msg = Buffer.from(
      JSON.stringify({ type: 'bookleaf_beacon', name: 'Bookleaf Library', port }),
    );
    beaconInterval = setInterval(() => {
      beaconSocket?.send(msg, 0, msg.length, DISCOVERY_PORT, '255.255.255.255');
    }, 3000);
  });
}

export function stopBeacon(): void {
  if (beaconInterval) { clearInterval(beaconInterval); beaconInterval = null; }
  if (beaconSocket) { try { beaconSocket.close(); } catch { /* ignore */ } beaconSocket = null; }
}
