// Add this at the top of the file
let lastSearchVolumes = {};

const form = document.getElementById('chat-form');
const chatHistory = document.getElementById('chat-history');
const clearHistoryButton = document.getElementById('clear-history');
const userInput = document.getElementById('user-input');
const mindmapContainer = document.getElementById('mindmap');
const autocompleteList = document.createElement('ul');
autocompleteList.className = 'absolute z-10 bg-white border border-gray-300 w-full mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto';
let autocompleteTimeout;

let lastUserMessage = '';
let nodes = [];
let edges = [];
let nodeId = 0;
let lastClickedNodeId = null;
let isDragging = false;
let draggedNode = null;
let offsetX, offsetY;

let zoom = 1;
const ZOOM_SPEED = 0.1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

let isDraggingPane = false;
let startPanX, startPanY;

let isCreatingNewNode = false;
let newNodeInput = null;

function initMindmap() {
    mindmapContainer.innerHTML = '';
    nodes = [];
    edges = [];
    nodeId = 0;
    lastClickedNodeId = null;
    zoom = 1;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'mindmap-wrapper';
    wrapper.style.transform = `scale(${zoom})`;
    wrapper.style.transformOrigin = 'top left';
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    mindmapContainer.appendChild(wrapper);

    // Add event listeners for panning
    mindmapContainer.addEventListener('mousedown', startPanning);
    document.addEventListener('mousemove', pan);
    document.addEventListener('mouseup', stopPanning);

    // Add event listener for double-click
    mindmapContainer.addEventListener('dblclick', startCreatingNewNode);
}

function addNodeToMindmap(content, parentId = null, searchVolume = null, x = null, y = null) {
    let newNode;
    if (parentId) {
        const existingNode = nodes.find(n => n.label.split('\n')[0] === content && edges.some(e => e.from === parentId && e.to === n.id));
        if (existingNode) {
            return existingNode.id; // Return existing node if it matches the content and is a child of the parent
        }
    }

    const label = searchVolume !== null ? `${content}\n(${searchVolume})` : content;
    const parentNode = parentId ? nodes.find(n => n.id === parentId) : null;
    const startX = parentNode ? parentNode.x : mindmapContainer.clientWidth / 2;
    const startY = parentNode ? parentNode.y : mindmapContainer.clientHeight / 2;

    newNode = { 
        id: ++nodeId, 
        label: label,
        content: content, // Store original content without search volume
        x: x !== null ? x : startX,
        y: y !== null ? y : startY,
        searchVolume: searchVolume  // Store the search volume
    };

    // Use spiral placement for new nodes
    const spiralAngle = 0.5;
    const spiralSpacing = 100;
    let angle = 0;
    let radius = 0;

    while (isOverlapping(newNode)) {
        angle += spiralAngle;
        radius += spiralSpacing / (2 * Math.PI);
        newNode.x = startX + radius * Math.cos(angle);
        newNode.y = startY + radius * Math.sin(angle);
    }

    nodes.push(newNode);
    if (parentId !== null) {
        edges.push({ from: parentId, to: newNode.id });
    }

    renderMindmap();
    return newNode.id;
}

function isOverlapping(node) {
    const minDistance = 150; // Minimum distance between nodes
    return nodes.some(existingNode => {
        if (existingNode.id === node.id) return false;
        const dx = existingNode.x - node.x;
        const dy = existingNode.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < minDistance;
    });
}

// Update the positionNodes function to only handle initial positioning of the root node
function positionNodes() {
    const rootNode = nodes[0];
    if (!rootNode) return;

    rootNode.x = mindmapContainer.clientWidth / 2;
    rootNode.y = mindmapContainer.clientHeight / 2;
}

function renderMindmap() {
    const wrapper = mindmapContainer.querySelector('.mindmap-wrapper');
    wrapper.innerHTML = '';

    // Render edges
    edges.forEach(edge => {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        const edgeElement = document.createElement('div');
        edgeElement.className = 'edge';
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        edgeElement.style.width = `${length}px`;
        edgeElement.style.left = `${fromNode.x}px`;
        edgeElement.style.top = `${fromNode.y}px`;
        edgeElement.style.transform = `rotate(${angle}rad)`;
        wrapper.appendChild(edgeElement);
    });

    // Render nodes
    nodes.forEach(node => {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'node';
        nodeElement.textContent = node.label;
        nodeElement.style.left = `${node.x - 50}px`;
        nodeElement.style.top = `${node.y - 25}px`;
        
        // Color the node based on its search volume
        const volume = parseInt(node.label.split('(')[1]);
        if (!isNaN(volume)) {
            const color = getColorForVolume(volume);
            nodeElement.style.backgroundColor = color;
            nodeElement.style.color = volume > 50 ? '#fff' : '#1e293b';  // Adjust text color for readability
            nodeElement.style.borderColor = 'transparent';
        }
        
        let isDragging = false;
        let dragStartTime;
        let dragStartX, dragStartY;

        nodeElement.addEventListener('mousedown', (e) => {
            isDragging = false;
            dragStartTime = new Date().getTime();
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            startDragging(e, node);
        });

        nodeElement.addEventListener('mousemove', (e) => {
            if (!isDragging && (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5)) {
                isDragging = true;
            }
        });

        nodeElement.addEventListener('mouseup', (e) => {
            const dragEndTime = new Date().getTime();
            const dragDuration = dragEndTime - dragStartTime;

            if (!isDragging && dragDuration < 200) {
                e.stopPropagation();
                const keyword = node.content;
                sendKeyword(keyword, node.id);
            }
            stopDragging(e);
        });

        wrapper.appendChild(nodeElement);
    });
}

function startPanning(e) {
    if (e.target === mindmapContainer) {
        isDraggingPane = true;
        startPanX = e.clientX - mindmapContainer.offsetLeft;
        startPanY = e.clientY - mindmapContainer.offsetTop;
        mindmapContainer.style.cursor = 'grabbing';
    }
}

function pan(e) {
    if (isDraggingPane && !isCreatingNewNode) {
        e.preventDefault();
        const wrapper = mindmapContainer.querySelector('.mindmap-wrapper');
        const x = e.clientX - mindmapContainer.offsetLeft;
        const y = e.clientY - mindmapContainer.offsetTop;
        wrapper.style.left = `${wrapper.offsetLeft + (x - startPanX) / zoom}px`;
        wrapper.style.top = `${wrapper.offsetTop + (y - startPanY) / zoom}px`;
        startPanX = x;
        startPanY = y;
    }
}

function stopPanning() {
    isDraggingPane = false;
    mindmapContainer.style.cursor = 'default';
}

function startDragging(e, node) {
    e.stopPropagation();
    isDragging = true;
    draggedNode = node;
    const wrapper = mindmapContainer.querySelector('.mindmap-wrapper');
    const rect = wrapper.getBoundingClientRect();
    offsetX = (e.clientX - rect.left) / zoom - node.x;
    offsetY = (e.clientY - rect.top) / zoom - node.y;
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDragging);
}

function drag(e) {
    if (isDragging) {
        const wrapper = mindmapContainer.querySelector('.mindmap-wrapper');
        const rect = wrapper.getBoundingClientRect();
        draggedNode.x = (e.clientX - rect.left) / zoom - offsetX;
        draggedNode.y = (e.clientY - rect.top) / zoom - offsetY;
        renderMindmap();
    }
}

function stopDragging(e) {
    if (isDragging) {
        isDragging = false;
        if (!e.target.classList.contains('node')) {
            positionNodes(); // Reposition nodes after dragging
        }
        renderMindmap();
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDragging);
    }
}

function handleZoom(event) {
    if (isCreatingNewNode) return;
    event.preventDefault();

    const delta = Math.sign(event.deltaY) * -1;
    const oldZoom = zoom;
    zoom += delta * ZOOM_SPEED;
    zoom = Math.min(Math.max(MIN_ZOOM, zoom), MAX_ZOOM);

    const wrapper = mindmapContainer.querySelector('.mindmap-wrapper');
    const rect = mindmapContainer.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const scale = zoom / oldZoom;
    const x = (mouseX - wrapper.offsetLeft) * (scale - 1);
    const y = (mouseY - wrapper.offsetTop) * (scale - 1);

    wrapper.style.transform = `scale(${zoom})`;
    wrapper.style.left = `${wrapper.offsetLeft - x / oldZoom}px`;
    wrapper.style.top = `${wrapper.offsetTop - y / oldZoom}px`;
}

async function sendKeyword(keyword, nodeId) {
    // Use the existing node ID instead of creating a new one
    lastClickedNodeId = nodeId;

    // Trigger the AI response
    const formData = new FormData();
    formData.append('user_input', keyword);

    try {
        const response = await fetch('/', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantResponse = '';
        let keywords = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const content = line.slice(6);
                    if (content.trim() === '[END]') {
                        processAssistantResponse(assistantResponse, nodeId);
                    } else if (content.startsWith('SEARCH_VOLUMES')) {
                        const searchVolumes = JSON.parse(content.slice(14));
                        updateSearchVolumes(searchVolumes, nodeId);
                    } else {
                        assistantResponse += content;
                        const keywordMatch = content.match(/\[\[(.*?)\]\]/);
                        if (keywordMatch) {
                            const newKeywords = keywordMatch[1].split(',').map(keyword => keyword.trim());
                            keywords = [...keywords, ...newKeywords];
                        }
                    }
                }
            }
            if (assistantResponse && lines.some(line => line.includes('[END]'))) {
                break;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        // Handle the error (e.g., display an error message to the user)
    }
}

// Update the fetchSearchVolumes function
async function fetchSearchVolumes(keywords) {
    try {
        const response = await fetch('/search_volumes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keywords }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Received search volumes:", data);
        return data;
    } catch (error) {
        console.error("Error fetching search volumes:", error);
        return {};
    }
}

// Update the submitForm function
async function submitForm(event) {
    event.preventDefault();
    autocompleteList.innerHTML = '';

    const formData = new FormData(form);
    const userInputText = formData.get('user_input');
    if (!userInputText.trim()) return;
    
    lastUserMessage = userInputText;
    userInput.value = '';
    userInput.focus();

    // Create a root node for the user's input
    const rootId = addNodeToMindmap(userInputText, lastClickedNodeId);
    lastClickedNodeId = rootId;

    try {
        const response = await fetch('/', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantResponse = '';
        let keywords = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const content = line.slice(6);
                    if (content.trim() === '[END]') {
                        processAssistantResponse(assistantResponse, rootId);
                    } else if (content.startsWith('SEARCH_VOLUMES')) {
                        const searchVolumes = JSON.parse(content.slice(14));
                        updateSearchVolumes(searchVolumes, rootId);
                    } else {
                        assistantResponse += content;
                        const keywordMatch = content.match(/\[\[(.*?)\]\]/);
                        if (keywordMatch) {
                            const newKeywords = keywordMatch[1].split(',').map(keyword => keyword.trim());
                            keywords = [...keywords, ...newKeywords];
                        }
                    }
                }
            }
            if (assistantResponse && lines.some(line => line.includes('[END]'))) {
                break;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        // Handle the error (e.g., display an error message to the user)
    }
}

// Update the updateSearchVolumes function
function updateSearchVolumes(searchVolumes, rootId) {
    lastSearchVolumes = { ...lastSearchVolumes, ...searchVolumes };
    nodes.forEach(node => {
        const keyword = node.content;
        if (lastSearchVolumes[keyword] !== undefined) {
            node.label = `${keyword}\n(${lastSearchVolumes[keyword]})`;
            node.searchVolume = lastSearchVolumes[keyword];  // Update the stored search volume
        }
    });
    positionNodes();
    renderMindmap();
}

// Update the processAssistantResponse function
function processAssistantResponse(response, parentId) {
    const keywordMatch = response.match(/\[\[(.*?)\]\]/);
    if (keywordMatch) {
        const keywords = keywordMatch[1].split(',').map(keyword => keyword.trim());
        keywords.forEach(keyword => {
            if (!nodes.some(node => node.content === keyword)) {
                const searchVolume = lastSearchVolumes[keyword] || 0;
                addNodeToMindmap(keyword, parentId, searchVolume);
            }
        });
    }
    positionNodes();
    renderMindmap();
}

clearHistoryButton.addEventListener('click', async () => {
    const response = await fetch('/', {
        method: 'POST',
        body: new URLSearchParams({'clear': 'true'})
    });
    if (response.ok) {
        const result = await response.json();
        if (result.status === 'cleared') {
            initMindmap();
            lastSearchVolumes = {};
        }
    }
});

// Add this function to handle autocomplete
async function handleAutocomplete() {
    clearTimeout(autocompleteTimeout);
    autocompleteTimeout = setTimeout(async () => {
        const query = userInput.value.trim();
        if (query.length < 2) {
            autocompleteList.innerHTML = '';
            autocompleteList.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/autocomplete?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const suggestions = await response.json();
            displayAutocompleteSuggestions(suggestions);
        } catch (error) {
            console.error('Error fetching autocomplete suggestions:', error);
        }
    }, 300);
}

// Add this function to display autocomplete suggestions
function displayAutocompleteSuggestions(suggestions) {
    autocompleteList.innerHTML = '';
    if (suggestions.length === 0) {
        autocompleteList.style.display = 'none';
        return;
    }
    
    suggestions.forEach(suggestion => {
        const li = document.createElement('li');
        li.className = 'px-4 py-2 hover:bg-gray-100 cursor-pointer';
        li.innerHTML = highlightMatch(suggestion, userInput.value);
        li.addEventListener('click', () => {
            userInput.value = suggestion.replace(/<[^>]*>/g, '');  // Remove HTML tags
            autocompleteList.innerHTML = '';
            autocompleteList.style.display = 'none';
        });
        autocompleteList.appendChild(li);
    });
    
    autocompleteList.style.display = 'block';
    // Position the autocomplete list above the input field
    const inputRect = userInput.getBoundingClientRect();
    autocompleteList.style.bottom = `${inputRect.height + 8}px`; // 8px for margin
    autocompleteList.style.top = 'auto';
}

// Add this new function to highlight the matching part of the suggestion
function highlightMatch(suggestion, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return suggestion.replace(regex, '<strong class="text-primary">$1</strong>');
}

// Add this function at the top of the file
function getColorForVolume(volume) {
    const maxVolume = 100;  // Adjust this value based on your typical maximum volume
    const minLightness = 40; // Darker blue
    const maxLightness = 80; // Lighter blue
    const lightness = maxLightness - (volume / maxVolume) * (maxLightness - minLightness);
    return `hsl(210, 70%, ${lightness}%)`;
}

// Add these event listeners for the userInput
userInput.addEventListener('input', handleAutocomplete);
userInput.addEventListener('focus', handleAutocomplete);
userInput.addEventListener('blur', () => {
    setTimeout(() => {
        autocompleteList.style.display = 'none';
    }, 200);
});

// Add this new event listener to show suggestions on focus
userInput.addEventListener('focus', () => {
    if (autocompleteList.children.length > 0) {
        autocompleteList.style.display = 'block';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initMindmap();
    renderMindmap();
    
    // Add the autocompleteList to the DOM
    userInput.parentNode.appendChild(autocompleteList);
});

// Add event listener for zooming
mindmapContainer.addEventListener('wheel', handleZoom, { passive: false });

// Add this event listener at the bottom of the file
form.addEventListener('submit', submitForm);

function startCreatingNewNode(e) {
    if (e.target !== mindmapContainer) return;

    isCreatingNewNode = true;
    
    const wrapper = mindmapContainer.querySelector('.mindmap-wrapper');
    const rect = wrapper.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    newNodeInput = document.createElement('input');
    newNodeInput.type = 'text';
    newNodeInput.className = 'node new-node-input';
    newNodeInput.style.position = 'absolute';
    newNodeInput.style.left = `${x - 50}px`;
    newNodeInput.style.top = `${y - 25}px`;
    newNodeInput.style.width = '100px';
    newNodeInput.style.height = '50px';
    newNodeInput.style.zIndex = '1000';

    wrapper.appendChild(newNodeInput);
    newNodeInput.focus();

    newNodeInput.addEventListener('keydown', handleNewNodeInputKeydown);
    newNodeInput.addEventListener('blur', cancelNewNode);
}

function handleNewNodeInputKeydown(e) {
    if (e.key === 'Enter') {
        const content = newNodeInput.value.trim();
        if (content) {
            const newNodeId = addNodeToMindmap(content, null, null, parseFloat(newNodeInput.style.left), parseFloat(newNodeInput.style.top));
            cancelNewNode();
            // Trigger AI response for the new node
            sendKeyword(content, newNodeId);
        }
    } else if (e.key === 'Escape') {
        cancelNewNode();
    }
}

function cancelNewNode() {
    if (newNodeInput && newNodeInput.parentNode) {
        newNodeInput.parentNode.removeChild(newNodeInput);
    }
    isCreatingNewNode = false;
    newNodeInput = null;
}