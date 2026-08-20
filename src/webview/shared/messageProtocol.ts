import type { SearchHit } from '../../core/models/searchHit';
import type { ConnectionProfile } from '../../core/models/connectionProfile';
import type { ConditionalFilterGroup } from '../../core/models/conditionalFilterGroup';

// --- Extension Host → Webview ---

export type StatusType = 'info' | 'searching' | 'connecting' | 'done' | 'noMatches' | 'error' | 'canceled' | 'watching';

export type ExtensionToWebview =
    | { type: 'stateUpdate'; payload: { results: SearchHit[]; profiles: ConnectionProfile[]; resultRetentionLimit?: number } }
    | { type: 'searchResult'; payload: SearchHit }
    | { type: 'searchComplete'; payload: { count: number; elapsedMs: number } }
    | { type: 'statusUpdate'; payload: { status: string; statusType: StatusType } }
    | { type: 'streamsDiscovered'; payload: string[] }
    | { type: 'connectionProfiles'; payload: ConnectionProfile[] }
    | { type: 'resultSelected'; payload: { index: number; formattedMessage: string } }
    | { type: 'error'; payload: { message: string } }
    | { type: 'selectProfileAfterSave'; payload: { profileId: string } };

// --- Webview → Extension Host ---

export interface SearchOptionsDto {
    streams: string[];
    findField: string;
    findEq: string;
    jsonField: string;
    findLast: number | undefined;
    findMax: number | undefined;
    newestFirst: boolean;
    caseInsensitive: boolean;
    useAdvancedFilters?: boolean;
    conditionalFilter?: ConditionalFilterGroup;
}

export type WebviewToExtension =
    | { type: 'ready' }
    | { type: 'startSearch'; payload: SearchOptionsDto }
    | { type: 'startWatch'; payload: SearchOptionsDto }
    | { type: 'cancel' }
    | { type: 'fetchStreams'; payload: { profileId: string } }
    | { type: 'selectConnection'; payload: { profileId: string } }
    | { type: 'addConnection' }
    | { type: 'editConnection'; payload: { profileId: string } }
    | { type: 'deleteConnection'; payload: { profileId: string } }
    | { type: 'manageProfiles' }
    | { type: 'exportJson' }
    | { type: 'exportCsv' }
    | { type: 'replay'; payload: { hitIndices: number[] } }
    | { type: 'replayAll' }
    | { type: 'selectResult'; payload: { index: number } };
