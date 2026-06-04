import UdpSocket from 'react-native-udp';

const DISCOVERY_PORT = 41234;

export type DiscoveredServer = {
  name: string;
  host: string;
  port: number;
  url: string;
};

let listenSocket: ReturnType<typeof UdpSocket.createSocket> | null = null;

export const MdnsService = {
  startScan(
    onFound: (server: DiscoveredServer) => void,
    _onRemove: (name: string) => void,
    onTimeout: () => void,
  ) {
    if (listenSocket) return;

    listenSocket = UdpSocket.createSocket({ type: 'udp4', reusePort: true });

    listenSocket.on('message', (data: Buffer, rinfo: { address: string; port: number }) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'bookleaf_beacon') {
          onFound({
            name: msg.name,
            host: rinfo.address,
            port: msg.port,
            url: `http://${rinfo.address}:${msg.port}`,
          });
        }
      } catch {}
    });

    listenSocket.on('error', () => {
      onTimeout();
    });

    listenSocket.bind(DISCOVERY_PORT);
  },

  stopScan() {
    if (listenSocket) {
      try { listenSocket.close(); } catch {}
      listenSocket = null;
    }
  },
};
