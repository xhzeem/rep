// State Management
import { updateHistoryCounter } from '../main.js';
import { updateHistoryButtons } from './ui.js';

export const state = {
    requests: [],
    selectedRequest: null,
    currentFilter: 'all',
    currentSearchTerm: '',
    useRegex: false,
    requestHistory: [],
    historyIndex: -1,
    undoStack: [],
    redoStack: [],
    // Bulk Replay State
    positionConfigs: [],
    currentAttackType: 'sniper',
    shouldStopBulk: false,
    shouldPauseBulk: false,
    // Diff State
    regularRequestBaseline: null,
    currentResponse: null
};

export function addRequest(request) {
    state.requests.push(request);
    return state.requests.length - 1; // Return index
}

export function clearRequests() {
    state.requests = [];
    state.selectedRequest = null;
    state.requestHistory = [];
    state.historyIndex = -1;
    state.regularRequestBaseline = null;
    state.currentResponse = null;
}

export function addToHistory(rawText, useHttps, response = null) {
    // Only prevent adding if we have a duplicate entry with the same content and no response
    // This allows us to add new responses to the same request
    if (state.historyIndex >= 0) {
        const current = state.requestHistory[state.historyIndex];
        if (current.rawText === rawText && 
            current.useHttps === useHttps && 
            current.response && 
            (!response || current.response === response)) {
            // Still update the counter even if we don't add to history
            if (typeof updateHistoryCounter === 'function') {
                updateHistoryCounter();
            }
            return;
        }
    }

    // If we are in the middle of history and make a change, discard future history
    if (state.historyIndex < state.requestHistory.length - 1) {
        state.requestHistory = state.requestHistory.slice(0, state.historyIndex + 1);
    }

    const historyEntry = { rawText, useHttps };
    if (response) {
        historyEntry.response = response;
    }
    
    state.requestHistory.push(historyEntry);
    state.historyIndex = state.requestHistory.length - 1;
    
    // Update the counter and buttons when history changes
    if (typeof updateHistoryCounter === 'function') {
        updateHistoryCounter();
    }
    
    // Ensure history buttons are properly updated
    if (typeof updateHistoryButtons === 'function') {
        updateHistoryButtons();
    }
}
