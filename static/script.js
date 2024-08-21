// Add this at the top of the file
let lastSearchVolumes = {};

const form = document.getElementById('chat-form');
const chatHistory = document.getElementById('chat-history');
const clearHistoryButton = document.getElementById('clear-history');
const userInput = document.getElementById('user-input');
const mindmapContainer = document.getElementById('mindmap');

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
}

function addNodeToMindmap(content, parentId = null, searchVolume = null) {
    let newNode;
    if (parentId) {
        const existingNode = nodes.find(n => n.label.split('\n')[0] === content && edges.some(e => e.from === parentId && e.to === n.id));
        if (existingNode) {
            return existingNode.id; // Return existing node if it matches the content and is a child of the parent
        }
    }

    const label = searchVolume !== null ? `${content}\n(${searchVolume})` : content;
    newNode = { 
        id: ++nodeId, 
        label: label,
        content: content, // Store original content without search volume
        x: parentId ? nodes.find(n => n.id === parentId).x : mindmapContainer.clientWidth / 2, 
        y: parentId ? nodes.find(n => n.id === parentId).y : mindmapContainer.clientHeight / 2 
    };
    nodes.push(newNode);
    if (parentId !== null) {
        edges.push({ from: parentId, to: newNode.id });
    }
    renderMindmap();
    return newNode.id;
}

function positionNodes() {
    const rootNode = nodes[0];
    if (!rootNode) return;

    const levelMap = new Map();
    const nodeLevels = new Map();

    // Assign levels to nodes
    function assignLevels(nodeId, level) {
        nodeLevels.set(nodeId, level);
        if (!levelMap.has(level)) levelMap.set(level, []);
        levelMap.get(level).push(nodeId);

        const children = edges.filter(e => e.from === nodeId).map(e => e.to);
        children.forEach(childId => assignLevels(childId, level + 1));
    }
    assignLevels(rootNode.id, 0);

    // Position nodes by level
    const baseRadius = 150;
    const radiusIncrement = 100;
    levelMap.forEach((nodeIds, level) => {
        const radius = baseRadius + level * radiusIncrement;
        const angleStep = (2 * Math.PI) / nodeIds.length;
        nodeIds.forEach((nodeId, index) => {
            const node = nodes.find(n => n.id === nodeId);
            const angle = index * angleStep;
            if (level === 0) {
                node.x = mindmapContainer.clientWidth / 2;
                node.y = mindmapContainer.clientHeight / 2;
            } else {
                const parentEdge = edges.find(e => e.to === nodeId);
                const parentNode = nodes.find(n => n.id === parentEdge.from);
                node.x = parentNode.x + radius * Math.cos(angle);
                node.y = parentNode.y + radius * Math.sin(angle);
            }
        });
    });

    // Adjust positions to avoid overlaps
    const nodeRadius = 60;
    const minDistance = nodeRadius * 2;
    for (let i = 0; i < 50; i++) { // Limit iterations to prevent infinite loop
        let moved = false;
        for (let j = 0; j < nodes.length; j++) {
            for (let k = j + 1; k < nodes.length; k++) {
                const dx = nodes[k].x - nodes[j].x;
                const dy = nodes[k].y - nodes[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < minDistance) {
                    const angle = Math.atan2(dy, dx);
                    const moveDistance = (minDistance - distance) / 2;
                    nodes[j].x -= moveDistance * Math.cos(angle);
                    nodes[j].y -= moveDistance * Math.sin(angle);
                    nodes[k].x += moveDistance * Math.cos(angle);
                    nodes[k].y += moveDistance * Math.sin(angle);
                    moved = true;
                }
            }
        }
        if (!moved) break;
    }
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
    if (isDraggingPane) {
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

// ... (keep the rest of the code, including autocomplete functionality)

document.addEventListener('DOMContentLoaded', () => {
    initMindmap();
    renderMindmap();
});

// Add event listener for zooming
mindmapContainer.addEventListener('wheel', handleZoom, { passive: false });

// Add this event listener at the bottom of the file
form.addEventListener('submit', submitForm);