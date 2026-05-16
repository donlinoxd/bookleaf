import Zeroconf from 'react-native-zeroconf';

const SERVICE_TYPE = 'bookleaf';
const SERVICE_PROTOCOL = 'tcp';
const SERVICE_DOMAIN = 'local.';
const SERVICE_NAME = 'Bookleaf Library';
const PORT = 3000;

export type DiscoveredServer = {
  name: string;
  host: string;
  port: number;
  url: string;
};

let zc: Zeroconf | null = null;

function getInstance(): Zeroconf {
  if (!zc) zc = new Zeroconf();
  return zc;
}

export const MdnsService = {
  publish() {
    getInstance().publishService(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN, SERVICE_NAME, PORT);
  },

  unpublish() {
    getInstance().unpublishService(SERVICE_NAME);
  },

  startScan(
    onFound: (server: DiscoveredServer) => void,
    onRemove: (name: string) => void,
    onError: (err: Error) => void,
  ) {
    const zeroconf = getInstance();

    zeroconf.on('resolved', (service) => {
      const host = (service.addresses?.[0] ?? service.host).replace(/\.$/, '');
      onFound({
        name: service.name,
        host,
        port: service.port,
        url: `http://${host}:${service.port}`,
      });
    });

    zeroconf.on('remove', (name: string) => {
      onRemove(name);
    });

    zeroconf.on('error', (err: Error) => {
      onError(err);
    });

    zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN);
  },

  stopScan() {
    getInstance().stop();
    // Remove all listeners to avoid stale callbacks on next scan
    const zeroconf = getInstance();
    zeroconf.removeDeviceListeners();
  },
};
