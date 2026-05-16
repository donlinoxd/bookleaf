import nodejs from 'nodejs-mobile-react-native';
import { ApiServer } from './ApiServer';

type BridgeMessage =
  | { requestId: number; action: string; params: Record<string, unknown> }
  | { type: 'server_ready'; port: number }
  | { type: 'server_error'; message: string }
  | { type: 'stop' };

type StatusCallback = (status: 'starting' | 'running' | 'error' | 'stopped', detail?: string) => void;

let institutionId = 1;
let statusCallback: StatusCallback | null = null;
let isStarted = false;

async function handleQuery(requestId: number, action: string, params: Record<string, unknown>) {
  let data: unknown;
  try {
    switch (action) {
      case 'searchBooks':
        data = await ApiServer.searchBooks(institutionId, (params.q as string) || '');
        break;
      case 'getAllBooks':
        data = await ApiServer.getAllBooks(institutionId);
        break;
      case 'getBookDetail':
        data = await ApiServer.getBookDetail(params.id as number);
        break;
      case 'getMemberBorrows':
        data = await ApiServer.getMemberBorrows(params.idNumber as string);
        break;
      default:
        data = { error: `Unknown action: ${action}` };
    }
  } catch (e: unknown) {
    data = { error: e instanceof Error ? e.message : 'Unknown error' };
  }
  nodejs.channel.send(JSON.stringify({ requestId, data }));
}

export const ServerBridge = {
  start(instId: number, onStatus: StatusCallback) {
    if (isStarted) return;
    institutionId = instId;
    statusCallback = onStatus;
    isStarted = true;

    onStatus('starting');

    nodejs.channel.addListener('message', (raw: string) => {
      try {
        const msg: BridgeMessage = JSON.parse(raw);

        if ('type' in msg) {
          if (msg.type === 'server_ready') {
            statusCallback?.('running', `Port ${msg.port}`);
          } else if (msg.type === 'server_error') {
            statusCallback?.('error', msg.message);
          }
          return;
        }

        // DB query from Node.js side
        if ('requestId' in msg) {
          handleQuery(msg.requestId, msg.action, msg.params);
        }
      } catch {
        // malformed message
      }
    });

    nodejs.start('main.js');
  },

  stop() {
    if (!isStarted) return;
    nodejs.channel.send(JSON.stringify({ type: 'stop' }));
    isStarted = false;
    statusCallback?.('stopped');
    statusCallback = null;
  },

  isRunning() {
    return isStarted;
  },
};
