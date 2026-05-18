import nodejs from 'nodejs-mobile-react-native';
import { ApiServer } from './ApiServer';
import { MdnsService } from './MdnsService';

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
      case 'getRecentlyAdded':
        data = await ApiServer.getRecentlyAdded(institutionId, (params.limit as number) || 10);
        break;
      case 'getPopular':
        data = await ApiServer.getPopular(institutionId, (params.limit as number) || 10);
        break;
      case 'renewBorrow':
        data = await ApiServer.renewBorrow(params.borrowingId as number, params.idNumber as string);
        break;
      case 'reserveBook':
        data = await ApiServer.reserveBook(params.resourceId as number, params.idNumber as string);
        break;
      case 'getMemberReservations':
        data = await ApiServer.getMemberReservations(params.idNumber as string);
        break;
      case 'searchBooksFiltered':
        data = await ApiServer.searchBooksFiltered(
          institutionId,
          (params.query as string) || '',
          params.materialType as string | undefined,
          params.yearFrom as number | undefined,
          params.yearTo as number | undefined,
          params.language as string | undefined,
        );
        break;
      case 'getSimilarBooks':
        data = await ApiServer.getSimilarBooks(params.resourceId as number);
        break;
      case 'toggleFavorite':
        data = await ApiServer.toggleFavorite(params.resourceId as number, params.idNumber as string);
        break;
      case 'getFavoriteStatus':
        data = await ApiServer.getFavoriteStatus(params.resourceId as number, params.idNumber as string);
        break;
      case 'getMemberFavorites':
        data = await ApiServer.getMemberFavorites(params.idNumber as string);
        break;
      case 'getBookReviews':
        data = await ApiServer.getBookReviews(params.resourceId as number);
        break;
      case 'submitReview':
        data = await ApiServer.submitReview(
          params.resourceId as number,
          params.idNumber as string,
          params.rating as number,
          (params.comment as string) || null,
        );
        break;
      case 'gateLogByIdNumber':
        data = await ApiServer.gateLogByIdNumber(
          params.idNumber as string,
          params.institutionId as number,
          params.method as 'app' | 'browser' | 'manual',
        );
        break;
      case 'gateVerifyAndLog':
        data = await ApiServer.gateVerifyAndLog(
          params.idNumber as string,
          params.pin as string,
          params.institutionId as number,
        );
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
            MdnsService.publish();
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
    MdnsService.unpublish();
    nodejs.channel.send(JSON.stringify({ type: 'stop' }));
    isStarted = false;
    statusCallback?.('stopped');
    statusCallback = null;
  },

  isRunning() {
    return isStarted;
  },

  setStatusCallback(cb: StatusCallback | null) {
    statusCallback = cb;
  },
};
