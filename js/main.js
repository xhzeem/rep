// Main Entry Point
import { state, addRequest, addToHistory } from './modules/state.js';
import {
    initUI, elements, renderRequestItem, filterRequests, updateHistoryButtons,
    clearAllRequestsUI, setupResizeHandle, setupSidebarResize, setupContextMenu,
    setupUndoRedo, captureScreenshot, exportRequests, importRequests, selectRequest
} from './modules/ui.js';
import { setupNetworkListener, parseRequest, executeRequest } from './modules/network.js';
import { getAISettings, saveAISettings, streamExplanationFromClaude } from './modules/ai.js';
import { setupBulkReplay } from './modules/bulk-replay.js';
import { formatBytes, highlightHTTP, renderDiff, copyToClipboard } from './modules/utils.js';
import { scanForSecrets } from './modules/secret-scanner.js';

// Update history counter display
export function updateHistoryCounter() {
    const counter = document.getElementById('history-counter');
    if (state.requestHistory && state.requestHistory.length > 0) {
        counter.textContent = `${state.historyIndex + 1}/${state.requestHistory.length}`;
    } else {
        counter.textContent = '0/0';
    }
}

// Theme Detection
function updateTheme() {
    const pref = localStorage.getItem('themePreference');
    if (pref === 'light') {
        document.body.classList.add('light-theme');
    } else if (pref === 'dark') {
        document.body.classList.remove('light-theme');
    } else {
        const theme = chrome.devtools.panels.themeName;
        if (theme === 'default') {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.add('light-theme');
            }
        } else if (theme === 'dark') {
            document.body.classList.remove('light-theme');
        } else {
            document.body.classList.add('light-theme');
        }
    }
    updateThemeIcon();
}

function beautifyHeaderName(name) {
    return (name || '')
        .split('-')
        .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part)
        .join('-');
}

function updateThemeIcon() {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;

    const isLight = document.body.classList.contains('light-theme');
    if (isLight) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M10 2c-1.82 0-3.53.5-5 1.35C7.99 5.08 10 8.3 10 12s-2.01 6.92-5 8.65C6.47 21.5 8.18 22 10 22c5.52 0 10-4.48 10-10S15.52 2 10 2z" fill="currentColor"/></svg>`;
        btn.title = "Switch to Dark Mode";
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" fill="currentColor" /></svg>`;
        btn.title = "Switch to Light Mode";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI Elements
    initUI();

    updateTheme();

    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-theme');
            if (isLight) {
                localStorage.setItem('themePreference', 'dark');
            } else {
                localStorage.setItem('themePreference', 'light');
            }
            updateTheme();
        });
    }

    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);
    }

    // Setup Network Listener
    setupNetworkListener((request) => {
        const index = addRequest(request);
        renderRequestItem(request, index);
    });

    // Setup UI Components
    setupResizeHandle();
    setupSidebarResize();
    setupContextMenu();
    setupUndoRedo();
    setupBulkReplay();

    // Disable Send when request editor is empty
    const updateSendBtnState = () => {
        const hasContent = (elements.rawRequestInput.innerText || '').trim().length > 0;
        elements.sendBtn.disabled = !hasContent;
    };
    updateSendBtnState();
    if (elements.rawRequestInput) {
        elements.rawRequestInput.addEventListener('input', updateSendBtnState);
        elements.rawRequestInput.addEventListener('keyup', updateSendBtnState);
        elements.rawRequestInput.addEventListener('click', updateSendBtnState);
        const sendObserver = new MutationObserver(updateSendBtnState);
        sendObserver.observe(elements.rawRequestInput, { childList: true, subtree: true, characterData: true });
    }

    // Event Listeners

    // Send Request
    elements.sendBtn.addEventListener('click', handleSendRequest);

    // Search & Filter
    elements.searchBar.addEventListener('input', (e) => {
        state.currentSearchTerm = e.target.value.toLowerCase();
        filterRequests();
    });

    elements.regexToggle.addEventListener('click', () => {
        state.useRegex = !state.useRegex;
        elements.regexToggle.classList.toggle('active', state.useRegex);
        elements.regexToggle.title = state.useRegex
            ? 'Regex mode enabled (click to disable)'
            : 'Toggle Regex Mode (enable to use regex patterns)';
        filterRequests();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            filterRequests();
        });
    });

    // Clear All
    elements.clearAllBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all requests?')) {
            clearAllRequestsUI();
        }
    });

    // Export/Import
    elements.exportBtn.addEventListener('click', exportRequests);
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importRequests(e.target.files[0]);
            e.target.value = ''; // Reset
        }
    });

    // History Navigation
    elements.historyBackBtn = document.getElementById('history-back');
    elements.historyFwdBtn = document.getElementById('history-fwd');

    elements.historyBackBtn.addEventListener('click', () => {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            const item = state.requestHistory[state.historyIndex];
            elements.rawRequestInput.innerHTML = highlightHTTP(item.rawText);
            elements.useHttpsCheckbox.checked = item.useHttps;
            
            // Restore response if it exists
            if (item.response) {
                elements.rawResponseDisplay.innerHTML = highlightHTTP(item.response);
                elements.rawResponseDisplay.style.display = 'block';
                elements.rawResponseDisplay.style.visibility = 'visible';
            } else {
                elements.rawResponseDisplay.textContent = '';
            }
            
            updateHistoryButtons();
            updateHistoryCounter();
        }
    });

    elements.historyFwdBtn.addEventListener('click', () => {
        if (state.historyIndex < state.requestHistory.length - 1) {
            state.historyIndex++;
            const item = state.requestHistory[state.historyIndex];
            elements.rawRequestInput.innerHTML = highlightHTTP(item.rawText);
            elements.useHttpsCheckbox.checked = item.useHttps;
            
            // Restore response if it exists
            if (item.response) {
                elements.rawResponseDisplay.innerHTML = highlightHTTP(item.response);
                elements.rawResponseDisplay.style.display = 'block';
                elements.rawResponseDisplay.style.visibility = 'visible';
            } else {
                elements.rawResponseDisplay.textContent = '';
            }
            
            updateHistoryButtons();
            updateHistoryCounter();
        }
    });

    // Copy Buttons
    elements.copyReqBtn.addEventListener('click', () => {
        copyToClipboard(elements.rawRequestInput.innerText, elements.copyReqBtn);
    });

    elements.copyResBtn.addEventListener('click', () => {
        copyToClipboard(elements.rawResponseDisplay.innerText, elements.copyResBtn);
    });

    // Screenshot
    elements.screenshotBtn.addEventListener('click', captureScreenshot);

    // Diff Toggle
    if (elements.showDiffCheckbox) {
        elements.showDiffCheckbox.addEventListener('change', () => {
            if (state.regularRequestBaseline && state.currentResponse) {
                if (elements.showDiffCheckbox.checked) {
                    elements.rawResponseDisplay.innerHTML = renderDiff(state.regularRequestBaseline, state.currentResponse);
                } else {
                    elements.rawResponseDisplay.innerHTML = highlightHTTP(state.currentResponse);
                }
            }
        });
    }

    // AI Features
    setupAIFeatures();
    
    // Secret Scanner
    const scanSecretsBtn = document.getElementById('scan-secrets-btn');
    const secretsModal = document.getElementById('secrets-modal');
    const secretsResults = document.getElementById('secrets-results');
    const secretsProgress = document.getElementById('secrets-progress');
    const secretsProgressBar = document.getElementById('secrets-progress-bar');
    const secretsProgressText = document.getElementById('secrets-progress-text');
    const secretsSearch = document.getElementById('secrets-search');
    const secretsSearchContainer = document.getElementById('secrets-search-container');
    
    let currentSecretResults = [];
    
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
    
    function renderSecretResults(results) {
        if (results.length === 0) {
            secretsResults.innerHTML = '<div class="empty-state">No secrets found matching your criteria.</div>';
            return;
        }
        
        let html = '<table class="secrets-table"><thead><tr><th>Type</th><th>Match</th><th>Confidence</th><th>File</th></tr></thead><tbody>';
        results.forEach(r => {
            const confidenceClass = r.confidence >= 80 ? 'high' : (r.confidence >= 50 ? 'medium' : 'low');
            html += `<tr>
                <td>${escapeHtml(r.type)}</td>
                <td class="secret-match" title="${escapeHtml(r.match)}">${escapeHtml(r.match.substring(0, 50))}${r.match.length > 50 ? '...' : ''}</td>
                <td><span class="confidence-badge ${confidenceClass}">${r.confidence}%</span></td>
                <td class="secret-file"><a href="${escapeHtml(r.file)}" target="_blank" title="${escapeHtml(r.file)}">${escapeHtml(r.file)}</a></td>
            </tr>`;
        });
        html += '</tbody></table>';
        secretsResults.innerHTML = html;
    }
    
    if (scanSecretsBtn) {
        scanSecretsBtn.addEventListener('click', async () => {
            secretsModal.showPopover();
            secretsResults.innerHTML = '';
            secretsProgress.style.display = 'block';
            secretsProgressBar.style.setProperty('--progress', '0%');
            secretsProgressText.textContent = 'Scanning JS files...';
            if (secretsSearch) secretsSearch.value = ''; // Reset search
            if (secretsSearchContainer) secretsSearchContainer.style.display = 'none';
            
            currentSecretResults = await scanForSecrets(state.requests, (processed, total) => {
                const percent = Math.round((processed / total) * 100);
                secretsProgressBar.style.setProperty('--progress', `${percent}%`);
                secretsProgressText.textContent = `Scanning JS files... ${processed}/${total}`;
            });
            
            secretsProgress.style.display = 'none';
            if (secretsSearchContainer) secretsSearchContainer.style.display = 'block';
            renderSecretResults(currentSecretResults);
        });
    }
    
    // Close modal is now handled by the popover API with popovertarget attribute
    
    // Search functionality
    if (secretsSearch) {
        secretsSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = currentSecretResults.filter(r => 
                r.type.toLowerCase().includes(query) || 
                r.match.toLowerCase().includes(query) || 
                r.file.toLowerCase().includes(query)
            );
            renderSecretResults(filtered);
        });
    }
});

async function handleSendRequest() {
    const rawContent = elements.rawRequestInput.innerText;
    const useHttps = elements.useHttpsCheckbox.checked;

    // Re-highlight the request editor to reflect any user edits before send
    elements.rawRequestInput.innerHTML = highlightHTTP(rawContent);

    try {
        const { url, options, method, filteredHeaders, bodyText } = parseRequest(rawContent, useHttps);

        elements.resStatus.textContent = 'Sending...';
        elements.resStatus.className = 'status-badge';

        console.log('Sending request to:', url);

        const result = await executeRequest(url, options);

        elements.resTime.textContent = `${result.duration}ms`;
        elements.resSize.textContent = formatBytes(result.size);

        elements.resStatus.textContent = `${result.status} ${result.statusText}`;
        if (result.status >= 200 && result.status < 300) {
            elements.resStatus.className = 'status-badge status-2xx';
        } else if (result.status >= 400 && result.status < 500) {
            elements.resStatus.className = 'status-badge status-4xx';
        } else if (result.status >= 500) {
            elements.resStatus.className = 'status-badge status-5xx';
        }

        // Build raw HTTP response
        let rawResponse = `HTTP/1.1 ${result.status} ${result.statusText}\n`;
        for (const [key, value] of result.headers) {
            const niceKey = beautifyHeaderName(key);
            rawResponse += `${niceKey}: ${value}\n`;
        }
        rawResponse += '\n';

        try {
            const json = JSON.parse(result.body);
            rawResponse += JSON.stringify(json, null, 2);
        } catch (e) {
            rawResponse += result.body;
        }

        // Store current response
        state.currentResponse = rawResponse;
        
        // Always create a new history entry for the response
        // This ensures we keep all responses, even for identical requests
        const currentText = elements.rawRequestInput.innerText;
        const currentHttps = elements.useHttpsCheckbox.checked;
        
        // Only add to history if we have a response
        if (rawResponse) {
            addToHistory(currentText, currentHttps, rawResponse);
            
            // Update the selected request's history if it exists
            if (state.selectedRequest) {
                if (!state.selectedRequest._history) {
                    state.selectedRequest._history = [];
                }
                
                // Add to the selected request's history if it's not already there
                const lastHistory = state.selectedRequest._history[state.selectedRequest._history.length - 1];
                if (!lastHistory || lastHistory.rawText !== currentText || lastHistory.response !== rawResponse) {
                    state.selectedRequest._history.push({
                        rawText: currentText,
                        useHttps: currentHttps,
                        response: rawResponse
                    });
                    state.selectedRequest._historyIndex = state.selectedRequest._history.length - 1;
                }
                
                // Update the history counter after adding the new entry
                updateHistoryCounter();
            }
        }

        // Handle Diff Baseline
        if (!state.regularRequestBaseline) {
            state.regularRequestBaseline = rawResponse;
            elements.diffToggle.style.display = 'none';
        } else {
            elements.diffToggle.style.display = 'flex';
            if (elements.showDiffCheckbox && elements.showDiffCheckbox.checked) {
                elements.rawResponseDisplay.innerHTML = renderDiff(state.regularRequestBaseline, rawResponse);
            } else {
                elements.rawResponseDisplay.innerHTML = highlightHTTP(rawResponse);
            }
        }

        // If diff not enabled or first response
        if (!elements.showDiffCheckbox || !elements.showDiffCheckbox.checked || !state.regularRequestBaseline || state.regularRequestBaseline === rawResponse) {
            elements.rawResponseDisplay.innerHTML = highlightHTTP(rawResponse);
        }

        elements.rawResponseDisplay.style.display = 'block';
        elements.rawResponseDisplay.style.visibility = 'visible';

        // Mark selected request as sent (for left pane highlighting)
        if (state.selectedRequest) {
            state.selectedRequest.sent = true;
            const idx = state.requests.indexOf(state.selectedRequest);
            const item = elements.requestList.querySelector(`.request-item[data-index="${idx}"]`);
            if (item) item.classList.add('sent');
            
            // Update the history counter after sending a request
            if (typeof updateHistoryCounter === 'function') {
                updateHistoryCounter();
            }
        }

        // Re-highlight request editor after send completes
        const postSendContent = elements.rawRequestInput.innerText;
        elements.rawRequestInput.innerHTML = highlightHTTP(postSendContent);

    } catch (err) {
        console.error('Request Failed:', err);
        elements.resStatus.textContent = 'Error';
        elements.resStatus.className = 'status-badge status-5xx';
        elements.resTime.textContent = '0ms';
        elements.rawResponseDisplay.textContent = `Error: ${err.message}\n\nStack: ${err.stack}`;
        elements.rawResponseDisplay.style.display = 'block';

        // Mark selected request as sent even on error (attempted)
        if (state.selectedRequest) {
            state.selectedRequest.sent = true;
            const idx = state.requests.indexOf(state.selectedRequest);
            const item = elements.requestList.querySelector(`.request-item[data-index="${idx}"]`);
            if (item) item.classList.add('sent');
        }

        // Ensure request editor stays highlighted even on error
        const postErrorContent = elements.rawRequestInput.innerText;
        elements.rawRequestInput.innerHTML = highlightHTTP(postErrorContent);
    }
}

function setupAIFeatures() {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const anthropicApiKeyInput = document.getElementById('anthropic-api-key');
    const anthropicModelSelect = document.getElementById('anthropic-model');
    const aiMenuBtn = document.getElementById('ai-menu-btn');
    const aiMenuDropdown = document.getElementById('ai-menu-dropdown');
    const explainBtn = document.getElementById('explain-btn');
    const suggestAttackBtn = document.getElementById('suggest-attack-btn');
    const explanationModal = document.getElementById('explanation-modal');
    const explanationContent = document.getElementById('explanation-content');
    const ctxExplainAi = document.getElementById('ctx-explain-ai');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const { apiKey, model } = getAISettings();
            anthropicApiKeyInput.value = apiKey;
            if (anthropicModelSelect) anthropicModelSelect.value = model;

            settingsModal.showPopover();
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const key = anthropicApiKeyInput.value.trim();
            const model = anthropicModelSelect ? anthropicModelSelect.value : 'claude-3-5-sonnet-20241022';

            if (key) {
                saveAISettings(key, model);
            }

            alert('Settings saved!');
            settingsModal.hidePopover();
        });
    }

    if (aiMenuBtn && aiMenuDropdown) {
        aiMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            aiMenuDropdown.classList.toggle('show');
        });
        window.addEventListener('click', () => {
            if (aiMenuDropdown.classList.contains('show')) {
                aiMenuDropdown.classList.remove('show');
            }
        });
    }

    const handleAIRequest = async (promptPrefix, content) => {
        const { apiKey, model } = getAISettings();
        if (!apiKey) {
            alert('Please configure your Anthropic API Key in Settings first.');
            settingsModal.showPopover();
            return;
        }

        explanationModal.showPopover();
        explanationContent.innerHTML = '<div class="loading-spinner">Generating...</div>';

        try {
            await streamExplanationFromClaude(apiKey, model, promptPrefix + "\n\n" + content, (text) => {
                if (typeof marked !== 'undefined') {
                    explanationContent.innerHTML = marked.parse(text);
                } else {
                    explanationContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: sans-serif;">${text}</pre>`;
                }
            });
        } catch (error) {
            explanationContent.innerHTML = `<div style="color: var(--error-color); padding: 20px;">Error: ${error.message}</div>`;
        }
    };

    if (explainBtn) {
        explainBtn.addEventListener('click', () => {
            const content = elements.rawRequestInput.innerText;
            if (!content.trim()) {
                alert('Request is empty.');
                return;
            }
            handleAIRequest("Explain this HTTP request:", content);
        });
    }

    if (suggestAttackBtn) {
        suggestAttackBtn.addEventListener('click', () => {
            const content = elements.rawRequestInput.innerText;
            if (!content.trim()) {
                alert('Request is empty.');
                return;
            }
            const prompt = `Analyze this HTTP request for potential security vulnerabilities. Provide a prioritized checklist of specific attack vectors to test. For each item, specify the target parameter/header, the potential vulnerability (e.g., IDOR, SQLi, XSS), and a brief test instruction. Format the output as a clear Markdown checklist.`;
            handleAIRequest(prompt, content);
        });
    }

    if (ctxExplainAi) {
        ctxExplainAi.addEventListener('click', () => {
            const selection = window.getSelection().toString();
            if (!selection.trim()) {
                alert('Please select some text to explain.');
                return;
            }
            const prompt = `Explain this specific part of an HTTP request/response:\n\n"${selection}"\n\nProvide context on what it is, how it's used, and any security relevance.`;
            handleAIRequest(prompt, ""); // Content is in prompt
        });
    }

    // Close Popovers
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const popover = e.target.closest('[popover]');
            if (popover) popover.hidePopover();
        });
    });
}
