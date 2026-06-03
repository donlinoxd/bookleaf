import nodejs from 'nodejs-mobile-react-native';
import { ApiServer } from './ApiServer';
import { MdnsService } from './MdnsService';

type BridgeMessage =
  | { requestId: number; action: string; params: Record<string, unknown> }
  | { type: 'server_ready'; port: number }
  | { type: 'server_error'; message: string }
  | { type: 'stop' };

type StatusCallback = (status: 'starting' | 'running' | 'error' | 'stopped', detail?: string) => void;

let institutionId: number | null = null;
let statusCallback: StatusCallback | null = null;
let isStarted = false;

function requireInstitution(): number {
  if (institutionId === null) {
    throw new Error('ServerBridge not initialized — call start(institutionId) first');
  }
  return institutionId;
}

async function handleQuery(requestId: number, action: string, params: Record<string, unknown>) {
  let data: unknown;
  try {
    switch (action) {
      case 'searchBooks':
        data = await ApiServer.searchBooks(requireInstitution(), (params.q as string) || '');
        break;
      case 'getAllBooks':
        data = await ApiServer.getAllBooks(requireInstitution());
        break;
      case 'getBookDetail':
        data = await ApiServer.getBookDetail(params.id as number);
        break;
      case 'getMemberBorrows':
        data = await ApiServer.getMemberBorrows(params.userId as number);
        break;
      case 'getRecentlyAdded':
        data = await ApiServer.getRecentlyAdded(requireInstitution(), (params.limit as number) || 10);
        break;
      case 'getPopular':
        data = await ApiServer.getPopular(requireInstitution(), (params.limit as number) || 10);
        break;
      case 'renewBorrow':
        data = await ApiServer.renewBorrow(params.borrowingId as number, params.userId as number);
        break;
      case 'reserveBook':
        data = await ApiServer.reserveBook(params.resourceId as number, params.userId as number);
        break;
      case 'getMemberReservations':
        data = await ApiServer.getMemberReservations(params.userId as number);
        break;
      case 'searchBooksFiltered':
        data = await ApiServer.searchBooksFiltered(
          requireInstitution(),
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
        data = await ApiServer.toggleFavorite(params.resourceId as number, params.userId as number);
        break;
      case 'getFavoriteStatus':
        data = await ApiServer.getFavoriteStatus(params.resourceId as number, params.userId as number);
        break;
      case 'getMemberFavorites':
        data = await ApiServer.getMemberFavorites(params.userId as number);
        break;
      case 'getBookReviews':
        data = await ApiServer.getBookReviews(params.resourceId as number);
        break;
      case 'submitReview':
        data = await ApiServer.submitReview(
          params.resourceId as number,
          params.userId as number,
          params.rating as number,
          (params.comment as string) || null,
        );
        break;
      case 'gateLogByUserId':
        data = await ApiServer.gateLogByUserId(
          params.userId as number,
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
      case 'authenticateMember':
        data = await ApiServer.authenticateMember(
          params.idNumber as string,
          params.pin as string,
        );
        break;
      case 'validateSession':
        data = await ApiServer.validateSession(params.token as string);
        break;
      case 'logout':
        data = await ApiServer.logout(params.token as string);
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
