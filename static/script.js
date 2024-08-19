// Add this at the top of the file
let lastSearchVolumes = {};

const form = document.getElementById('chat-form');
const chatHistory = document.getElementById('chat-history');
const clearHistoryButton = document.getElementById('clear-history');
const userInput = document.getElementById('user-input');

let lastUserMessage = '';

function processKeywords(element) {
    if (element.classList.contains('message-content')) {
        const content = element.innerHTML;
        const keywordMatch = content.match(/\[\[(.*?)\]\]/);
        
        if (keywordMatch) {
            const keywords = keywordMatch[1].split(',').map(keyword => keyword.trim());
            const keywordHtml = keywords.map(keyword => 
                `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r from-peter-river to-belize-hole text-white shadow-sm hover:from-belize-hole hover:to-peter-river transition-all duration-200 cursor-pointer mr-2 mb-2" onclick="sendKeyword('${keyword}')">
                    ${keyword}
                    <span class="search-volume ml-2 bg-white text-midnight-blue px-2 py-0.5 rounded-full text-xs font-semibold">...</span>
                </span>`
            ).join('');
            
            element.innerHTML = content.replace(/\[\[.*?\]\]/, '') +
                `<div class="mt-4 pt-2 border-t border-silver">
                    <p class="text-sm font-medium text-wet-asphalt mb-2">Related topics:</p>
                    <div class="flex flex-wrap">${keywordHtml}</div>
                </div>`;
            
            // Update search volumes immediately if we have them
            if (Object.keys(lastSearchVolumes).length > 0) {
                updateSearchVolumes(lastSearchVolumes);
            }
        }
    }
}

function updateSearchVolumes(searchVolumes) {
    console.log("Updating search volumes:", searchVolumes);
    // Merge new search volumes with existing ones
    lastSearchVolumes = { ...lastSearchVolumes, ...searchVolumes };
    
    const keywordSpans = document.querySelectorAll('.message-content .inline-flex');
    keywordSpans.forEach(span => {
        const keyword = span.childNodes[0].textContent.trim();
        const volumeSpan = span.querySelector('.search-volume');
        if (volumeSpan) {
            const volume = lastSearchVolumes[keyword];
            if (volume !== undefined) {
                volumeSpan.textContent = volume;
                console.log(`Updated volume for ${keyword}: ${volume}`);
            }
        }
    });
}

// Process initial messages
document.querySelectorAll('.message-content').forEach(processKeywords);

function addMessageToHistory(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'p-6 rounded-xl shadow-md bg-white border-l-4 border-peter-river transition-all duration-300 hover:shadow-lg';
    
    messageDiv.innerHTML = `
        <p class="font-semibold text-sm text-belize-hole mb-3">${lastUserMessage}</p>
        <p class="text-wet-asphalt message-content">${content}</p>
    `;
    chatHistory.appendChild(messageDiv);
    processKeywords(messageDiv.querySelector('.message-content'));
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function sendKeyword(keyword) {
    userInput.value = keyword;
    form.dispatchEvent(new Event('submit'));
}

function addLoadingAnimation() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading p-6 rounded-xl shadow-md bg-white border-l-4 border-peter-river space-y-2';
    loadingDiv.innerHTML = `
        <div class="h-4 bg-clouds rounded w-3/4 animate-pulse"></div>
        <div class="space-y-2">
            <div class="h-4 bg-silver rounded animate-pulse"></div>
            <div class="h-4 bg-silver rounded animate-pulse"></div>
            <div class="h-4 bg-silver rounded w-5/6 animate-pulse"></div>
        </div>
    `;
    chatHistory.appendChild(loadingDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function removeLoadingAnimation() {
    const loadingDiv = chatHistory.querySelector('.loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const userInputText = formData.get('user_input');
    if (!userInputText.trim()) return;
    
    lastUserMessage = userInputText;
    userInput.value = '';
    userInput.focus();

    addLoadingAnimation();

    const response = await fetch('/', {
        method: 'POST',
        body: formData
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantResponse = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const content = line.slice(6);
                if (content.trim() === '[END]') {
                    removeLoadingAnimation();
                    addMessageToHistory(assistantResponse);
                } else if (content.startsWith('SEARCH_VOLUMES')) {
                    const newSearchVolumes = JSON.parse(content.slice(14));
                    console.log("Received search volumes:", newSearchVolumes);
                    updateSearchVolumes(newSearchVolumes);
                } else {
                    assistantResponse += content;
                }
            }
        }
        if (assistantResponse && lines.some(line => line.includes('[END]'))) {
            break;
        }
    }
});

clearHistoryButton.addEventListener('click', async () => {
    const response = await fetch('/', {
        method: 'POST',
        body: new URLSearchParams({'clear': 'true'})
    });
    if (response.ok) {
        const result = await response.json();
        if (result.status === 'cleared') {
            chatHistory.innerHTML = '';
            lastUserMessage = '';
        }
    }
});

// Add autocomplete functionality
const suggestionsList = document.createElement('ul');
suggestionsList.className = 'absolute z-10 w-full bg-white border border-silver rounded-b-xl shadow-lg hidden';
userInput.parentNode.appendChild(suggestionsList);

let currentFocus = -1;

userInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value;
    if (query.length < 2) {
        suggestionsList.innerHTML = '';
        suggestionsList.classList.add('hidden');
        return;
    }

    const response = await fetch(`/autocomplete?q=${encodeURIComponent(query)}`);
    const suggestions = await response.json();

    suggestionsList.innerHTML = '';
    if (suggestions.length > 0) {
        suggestions.forEach((suggestion, index) => {
            const li = document.createElement('li');
            li.innerHTML = suggestion; // Changed from textContent to innerHTML
            li.className = 'px-4 py-2 hover:bg-clouds cursor-pointer';
            li.addEventListener('click', () => {
                userInput.value = li.textContent; // Use textContent here to get plain text
                suggestionsList.classList.add('hidden');
            });
            suggestionsList.appendChild(li);
        });
        suggestionsList.classList.remove('hidden');
    } else {
        suggestionsList.classList.add('hidden');
    }
}, 300));

userInput.addEventListener('keydown', (e) => {
    const items = suggestionsList.getElementsByTagName('li');
    if (e.key === 'ArrowDown') {
        currentFocus++;
        addActive(items);
    } else if (e.key === 'ArrowUp') {
        currentFocus--;
        addActive(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentFocus > -1) {
            if (items) items[currentFocus].click();
        }
    }
});

function addActive(items) {
    if (!items) return false;
    removeActive(items);
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (items.length - 1);
    items[currentFocus].classList.add('bg-peter-river', 'text-white');
}

function removeActive(items) {
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('bg-peter-river', 'text-white');
    }
}

document.addEventListener('click', (e) => {
    if (e.target !== userInput) {
        suggestionsList.classList.add('hidden');
    }
});

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}