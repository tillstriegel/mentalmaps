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
                `<span class="inline-block bg-blue-100 text-blue-800 text-xs font-semibold mr-2 mb-2 px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-blue-200 transition-colors duration-200" onclick="sendKeyword('${keyword}')">${keyword}</span>`
            ).join('');
            
            element.innerHTML = content.replace(/\[\[.*?\]\]/, '') +
                `<div class="mt-4 pt-2 border-t border-gray-200">
                    <p class="text-sm text-gray-600 mb-2">Related topics:</p>
                    <div>${keywordHtml}</div>
                </div>`;
        }
    }
}

// Process initial messages
document.querySelectorAll('.message-content').forEach(processKeywords);

function addMessageToHistory(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'p-4 rounded-lg shadow-md bg-white border-l-4 border-green-500';
    
    messageDiv.innerHTML = `
        <p class="font-semibold text-sm text-green-700 mb-2">${lastUserMessage}</p>
        <p class="text-gray-800 message-content">${content}</p>
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
    loadingDiv.className = 'loading p-4 rounded-lg shadow-md bg-white border-l-4 border-green-500 space-y-2';
    loadingDiv.innerHTML = `
        <div class="h-4 bg-green-200 rounded w-3/4 animate-pulse"></div>
        <div class="space-y-2">
            <div class="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div class="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div class="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
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
                    break;
                }
                assistantResponse += content;
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