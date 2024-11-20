const API_URL = 'https://api.platform.ai.vn/services/platform-ai-api/v1/chat/completions';
const LOGIN_URL = 'https://web.rengine.platform.ai.vn/app/login';
const USER_INFO_URL = 'https://api.platform.ai.vn/services/platform-ai-api/account/info';
const SUPPORTED_DOC_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/msword', // doc
    'application/vnd.ms-excel' // xls
];

let isProcessing = false;
let editingAIIndex = null;
let currentAI = null;
let currentDataAI = null;
let customAIs = [];
let chatHistory = [];
const CHAT_HISTORY_KEY = 'chatHistory';

const chatArea = document.getElementById('chat-area');
const inputField = document.getElementById('input-field');
const sendButton = document.getElementById('send-button');
const typingIndicator = document.getElementById('typing-indicator');
const userInfoElement = document.getElementById('user-info');

// API calls
async function apiCall(url, method, data = null) {
    const token = getCookie('access_token');
    if (!token) {
        redirectToLogin();
        return null;
    }

    const options = {
        method: method,
        headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
        redirectToLogin();
        return null;
    }

    return await response.json();
}

// Custom AI functions
async function getCustomAIs() {
    const response = await apiCall('https://api.platform.ai.vn/services/platform-ai-api/contents?draw=3&columns%5B0%5D%5Bdata%5D=id&columns%5B0%5D%5Bname%5D=Id&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=false&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=title&columns%5B1%5D%5Bname%5D=Title&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=content_type&columns%5B2%5D%5Bname%5D=Content%20Type&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=created_at&columns%5B3%5D%5Bname%5D=Created&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=updated_at&columns%5B4%5D%5Bname%5D=Updated&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=action&columns%5B5%5D%5Bname%5D=Action&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=false&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=2&order%5B0%5D%5Bdir%5D=desc&start=0&length=1000&search%5Bvalue%5D=platform-chat-app-config&search%5Bregex%5D=false&_=1730859785338', 'GET');
    return response.data.filter(item => item.content_type === 'platform-chat-app-config');
}

async function getCustomAI(id) {
    return await apiCall(`https://api.platform.ai.vn/services/platform-ai-api/contents/${id}`, 'GET');
}

async function saveCustomAI(ai) {
    const data = {
        title: ai.name,
        content_type: 'platform-chat-app-config',
        content_data: JSON.stringify(ai)
    };

    if (ai.id) {
        return await apiCall(`https://api.platform.ai.vn/services/platform-ai-api/contents/${ai.id}`, 'PUT', data);
    } else {
        return await apiCall('https://api.platform.ai.vn/services/platform-ai-api/contents', 'POST', data);
    }
}

async function deleteCustomAI(id) {
    return await apiCall(`https://api.platform.ai.vn/services/platform-ai-api/contents/${id}`, 'DELETE');
}

// Function to handle document upload
async function handleDocumentUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!SUPPORTED_DOC_TYPES.includes(file.type)) {
        alert('Please upload a supported document file (PDF, DOCX, XLSX, DOC, XLS)');
        return;
    }

    try {
        const base64Document = await fileToBase64(file);
        // Show loading state in preview area
        const previewArea = document.getElementById('preview-area');
        previewArea.innerHTML = `
            <div class="document-preview">
                <div class="document-info">
                    <i class="fas fa-file-alt"></i>
                    <span>${file.name}</span>
                </div>
                <button class="remove-preview" onclick="clearPreviewArea()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Call document parser API
        const parsedContent = await parseDocument(base64Document);
        if (parsedContent) {
            // Store the parsed content to be sent with the next message
            window.lastParsedDocument = parsedContent;
        }
    } catch (error) {
        console.error('Error processing document:', error);
        alert('Error processing document');
        clearPreviewArea();
    }
}

// Function to convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Function to parse document using the API
async function parseDocument(base64Content) {
    const token = getCookie('access_token');
    if (!token) {
        redirectToLogin();
        return null;
    }

    try {
        const response = await fetch('https://api.platform.ai.vn/services/platform-ai-api/scrapings/execute', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scraping_name: "Document Parser",
                variables: {
                    content: base64Content
                }
            })
        });

        if (response.status === 401) {
            redirectToLogin();
            return null;
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error parsing document:', error);
        throw error;
    }
}

// Function to clear preview area
function clearPreviewArea() {
    const previewArea = document.getElementById('preview-area');
    previewArea.innerHTML = '';
    window.lastParsedDocument = null;
}

// Image handling
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', 0.6);
                resolve(base64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// UI functions
function addCopyButtons() {
    document.querySelectorAll('pre code').forEach((codeBlock) => {
        if (!codeBlock.parentNode.querySelector('.copy-button')) {
            const button = document.createElement('button');
            button.className = 'copy-button';
            button.textContent = 'Copy';

            button.addEventListener('click', () => {
                const textArea = document.createElement('textarea');
                textArea.value = codeBlock.textContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);

                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 2000);
            });

            const pre = codeBlock.parentNode;
            pre.insertBefore(button, codeBlock);
        }
    });
}

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const themeIcon = document.querySelector('#theme-toggle i');
    if (document.body.classList.contains('light-theme')) {
        themeIcon.classList.replace('fa-sun', 'fa-moon');
        localStorage.setItem('theme', 'light');
    } else {
        themeIcon.classList.replace('fa-moon', 'fa-sun');
        localStorage.setItem('theme', 'dark');
    }
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        document.querySelector('#theme-toggle i').classList.replace('fa-sun', 'fa-moon');
    }
}

// Image upload handling
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
    }

    try {
        const base64Image = await compressImage(file);
        displayImagePreview(base64Image);
    } catch (error) {
        console.error('Error processing image:', error);
        alert('Error processing image');
    }
}

function displayImagePreview(base64Image) {
    const previewArea = document.getElementById('preview-area');
    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-container';

    const img = document.createElement('img');
    img.src = base64Image;
    img.className = 'image-preview';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-preview';
    removeButton.innerHTML = '<i class="fas fa-times"></i>';
    removeButton.onclick = () => {
        previewArea.removeChild(previewContainer);
    };

    previewContainer.appendChild(img);
    previewContainer.appendChild(removeButton);
    previewArea.innerHTML = '';
    previewArea.appendChild(previewContainer);
}

// Chat history functions
function loadChatHistory() {
    const savedHistory = localStorage.getItem(CHAT_HISTORY_KEY);
    if (savedHistory) {
        chatHistory = JSON.parse(savedHistory);
        chatArea.innerHTML = '';
        chatHistory.forEach(msg => {
            if (msg.role === 'user') {
                if (Array.isArray(msg.content)) {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('message', 'sent');

                    msg.content.forEach(item => {
                        if (item.type === 'text') {
                            messageElement.innerHTML += item.text;
                        } else if (item.type === 'image_url' && item.image_url) {
                            messageElement.innerHTML += `<br><img src="${item.image_url.url}" alt="Uploaded image">`;
                        }
                    });

                    chatArea.appendChild(messageElement);
                } else {
                    displayMessage(msg.content, true);
                }
            } else {
                displayMessage(msg.content, false);
            }
        });
    }
}

function saveChatHistory() {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
}

function clearChatHistory() {
    chatHistory = [];
    localStorage.removeItem(CHAT_HISTORY_KEY);
    chatArea.innerHTML = '';
    const greetingMessage = document.createElement('div');
    greetingMessage.classList.add('message', 'received');
    greetingMessage.textContent = 'Hello! How can I assist you today?';
    chatArea.appendChild(greetingMessage);
}

// Custom AI management
function addNewAI() {
    editingAIIndex = null;
    document.getElementById('aiConfigLabel').innerHTML = `AI Configuration (New)`;
    document.getElementById('aiForm').reset();
}

async function showAIList() {
    const popup = document.getElementById('aiPopup');
    customAIs = await getCustomAIs();
    displayAIList(customAIs);
    popup.style.display = 'flex';
}

function closeAIPopup() {
    document.getElementById('aiPopup').style.display = 'none';
}

async function saveAI(event) {
    event.preventDefault();
    const ai = {
        name: document.getElementById('aiName').value,
        model: document.getElementById('aiModel').value,
        systemPrompt: document.getElementById('aiSystemPrompt').value,
        defaultText: document.getElementById('aiDefaultText').value,
        temperature: parseFloat(document.getElementById('aiTemperature').value),
        maxTokens: parseInt(document.getElementById('aiMaxTokens').value),
        topP: parseFloat(document.getElementById('aiTopP').value),
        maxHistory: parseInt(document.getElementById('aiMaxHistory').value)
    };

    if (editingAIIndex !== null) {
        ai.id = customAIs[editingAIIndex].id;
    }

    const savedAI = await saveCustomAI(ai);
    if (savedAI) {
        await showAIList();
        if (editingAIIndex !== null) {
            selectAI(editingAIIndex);
        }
        closeAIPopup();
    }
}

async function editAI(index) {
    const aiData = await getCustomAI(customAIs[index].id);
    const ai = JSON.parse(aiData.content_data);
    document.getElementById('aiName').value = ai.name;
    document.getElementById('aiModel').value = ai.model;
    document.getElementById('aiSystemPrompt').value = ai.systemPrompt;
    document.getElementById('aiDefaultText').value = ai.defaultText;
    document.getElementById('aiTemperature').value = ai.temperature;
    document.getElementById('aiMaxTokens').value = ai.maxTokens;
    document.getElementById('aiTopP').value = ai.topP;
    document.getElementById('aiMaxHistory').value = ai.maxHistory;
    document.getElementById('aiConfigLabel').innerHTML = `AI Configuration (${ai.name})`;
    editingAIIndex = index;
}

async function deleteAI(index) {
    await deleteCustomAI(customAIs[index].id);
    await showAIList();
}

async function selectAI(index) {
    const aiData = await getCustomAI(customAIs[index].id);
    currentDataAI = aiData;
    currentAI = JSON.parse(aiData.content_data);
    localStorage.setItem('selectedAI', JSON.stringify(currentDataAI));
    document.querySelector('.custom-ai-name').textContent = `Chat with ${currentAI.name}`;
    showAIList();
}

function searchAI() {
    const searchTerm = document.getElementById('aiSearch').value.toLowerCase();
    const filteredAIs = customAIs.filter(ai => ai.title.toLowerCase().includes(searchTerm));
    displayAIList(filteredAIs);
}

function displayAIList(ais) {
    const aiList = document.getElementById('aiList');
    aiList.innerHTML = '';

    ais.forEach((ai, index) => {
        const aiItem = document.createElement('div');
        aiItem.classList.add('ai-item');
        if (currentDataAI && currentDataAI.id === ai.id) {
            aiItem.classList.add('selected');
            editAI(index);
        }
        aiItem.innerHTML = `
            <span>${ai.title}</span>
            <div class="ai-item-buttons">
                <button class="btn btn-sm btn-primary" onclick="editAI(${index})">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAI(${index})">Delete</button>
                <button class="btn btn-sm btn-success" onclick="selectAI(${index})">Select</button>
            </div>
        `;
        aiList.appendChild(aiItem);
    });
}

// Authentication functions
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value};${expires};path=/`;
}

function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

function handleLogout() {
    deleteCookie('access_token');
    redirectToLogin();
}

function checkAuth() {
    const token = getCookie('access_token');
    if (!token) {
        redirectToLogin();
        return false;
    }
    return true;
}

function redirectToLogin() {
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `${LOGIN_URL}?returnUrl=${currentUrl}`;
}

function handleLoginReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        setCookie('access_token', token, 7);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}


function copyToClipboard(textToCopy) {
    var tempInput = document.createElement("input");
    tempInput.value = textToCopy;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
}

// Message display functions
function displayMessage(message, isSent) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(isSent ? 'sent' : 'received');

    if (typeof message === 'object' && message.content) {
        if (Array.isArray(message.content)) {
            message.content.forEach(item => {
                if (item.type === 'text') {
                    let rendered = marked.parse(item.text);
                    rendered = rendered.replace(/<table>/g, '<div class="table-container"><table>');
                    rendered = rendered.replace(/<\/table>/g, '</table></div>');
                    messageElement.innerHTML += rendered;
                } else if (item.type === 'image_url' && item.image_url) {
                    messageElement.innerHTML += `<br><img src="${item.image_url.url}" alt="Uploaded image">`;
                }
            });
        } else {
            let rendered = marked.parse(message.content);
            rendered = rendered.replace(/<table>/g, '<div class="table-container"><table>');
            rendered = rendered.replace(/<\/table>/g, '</table></div>');
            messageElement.innerHTML = rendered;
        }
    } else {
        let rendered = marked.parse(message);
        rendered = rendered.replace(/<table>/g, '<div class="table-container"><table>');
        rendered = rendered.replace(/<\/table>/g, '</table></div>');
        messageElement.innerHTML = rendered;
    }

    chatArea.appendChild(messageElement);
    chatArea.scrollTop = chatArea.scrollHeight;

    messageElement.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    addCopyButtons();
    scrollToBottom();
}

function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
}

function setLoading(loading) {
    isProcessing = loading;
    sendButton.disabled = loading;
    inputField.disabled = loading;
    typingIndicator.classList.toggle('visible', loading);

    if (!loading) {
        inputField.focus();
    }
}

// AI response streaming
async function streamResponse(message, imageBase64) {
    try {
        const token = getCookie('access_token');
        if (!token) {
            redirectToLogin();
            return;
        }
        const aiConfig = currentAI || {
            model: 'openai/gpt-4o-mini-2024-07-18:openrouter',
            temperature: 0.7,
            maxTokens: 2048,
            topP: 1,
            systemPrompt: '',
            maxHistory: 10
        };

        let latestMessage;
        if (imageBase64) {
            latestMessage = {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: message || aiConfig.defaultText
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: imageBase64,
                            detail: "low"
                        }
                    }
                ]
            };
        } else {
            latestMessage = {
                role: "user",
                content: message
            };
        }

        chatHistory.push(latestMessage);
        saveChatHistory();

        let messages = [];

        if (aiConfig.systemPrompt && aiConfig.systemPrompt.trim()) {
            messages.push({
                role: 'system',
                content: aiConfig.systemPrompt
            });
        }

        const historyLimit = aiConfig.maxHistory || 10;
        const startIndex = Math.max(0, chatHistory.length - historyLimit);

        messages = messages.concat(chatHistory.slice(startIndex));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                model: aiConfig.model,
                messages: messages,
                temperature: aiConfig.temperature,
                max_tokens: aiConfig.maxTokens,
                top_p: aiConfig.topP,
                stream: true
            })
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let responseMessage = document.createElement('div');

        let fullResponse = '';
        let currentMarkdown = '';
        let lastProcessedLength = 0;
        let createResponseMessage = true;

        const processMarkdown = (markdown) => {
            if (createResponseMessage) {
                responseMessage.classList.add('message', 'received');
                chatArea.appendChild(responseMessage);
                createResponseMessage = false;
            }
            marked.setOptions({
                breaks: true,
                gfm: true,
                tables: true,
                headerIds: false,
                sanitize: false,
                highlight: function (code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                }
            });
            let rendered = marked.parse(markdown);

            rendered = rendered.replace(/<table>/g, '<div class="table-container"><table>');
            rendered = rendered.replace(/<\/table>/g, '</table></div>');

            responseMessage.innerHTML = rendered;
            hljs.highlightAll();
            addCopyButtons();
            scrollToBottom();
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]\r') continue;

                    try {
                        const json = JSON.parse(data);
                        const content = json.choices[0]?.delta?.content || '';
                        if (content) {
                            fullResponse += content;
                            currentMarkdown += content;

                            if (currentMarkdown.length - lastProcessedLength > 10 || content.includes('\n')) {
                                processMarkdown(currentMarkdown);
                                lastProcessedLength = currentMarkdown.length;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                    }
                }
            }
        }

        processMarkdown(currentMarkdown);

        chatHistory.push({
            role: 'assistant',
            content: fullResponse
        });
        saveChatHistory();

        if (bridge) {
            bridge.receive_message(fullResponse);
        }
        else
        {
            copyToClipboard(fullResponse);
        }

        // const notificationElement = document.createElement('div');
        // notificationElement.classList.add('notification');
        // notificationElement.textContent = 'Response copied to clipboard!';
        // document.body.appendChild(notificationElement);
        
        // setTimeout(() => {
        //     document.body.removeChild(notificationElement);
        // }, 3000);
    } catch (error) {
        console.error('Error:', error);
        displayMessage('Sorry, there was an error processing your request.', false);
    } finally {
        setLoading(false);
    }
}

async function sendMessage() {
    const message = inputField.value.trim();
    const previewArea = document.getElementById('preview-area');
    const imagePreview = previewArea.querySelector('.image-preview');
    const documentPreview = previewArea.querySelector('.document-preview');

    if ((!message && !imagePreview && !documentPreview) || isProcessing) return;

    if (!checkAuth()) return;

    inputField.value = '';
    inputField.style.height = 'auto';
    setLoading(true);

    // Handle document preview
    if (documentPreview && window.lastParsedDocument) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'sent');
        messageElement.innerHTML = `${message}<br><div class="document-info"><i class="fas fa-file-alt"></i> Document uploaded</div>`;
        chatArea.appendChild(messageElement);
        scrollToBottom();

        // Create message with document content
        const documentMessage = `${message}\n\nDocument Content:\n${window.lastParsedDocument.text}`;
        await streamResponse(documentMessage);

        // Clear preview and parsed content
        clearPreviewArea();
    } else if (imagePreview) {
        // Existing image handling code
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'sent');
        messageElement.innerHTML = `${message || currentAI.defaultText}<br><img src="${imagePreview.src}" alt="Uploaded image">`;
        chatArea.appendChild(messageElement);
        scrollToBottom();

        await streamResponse(message, imagePreview.src);
        previewArea.innerHTML = '';
    } else {
        displayMessage(message, true);
        await streamResponse(message);
    }
}

function getInitials(name) {
    return name.split(' ').map(word => word[0].toUpperCase()).join('');
}

function displayUserInfo(userInfo) {
    const avatar = document.getElementById('avatar');
    const userInfoElement = document.getElementById('user-info');

    const initials = getInitials(userInfo.full_name || userInfo.username);
    avatar.textContent = initials;

    userInfoElement.innerHTML = `
        <span class="user-name">${userInfo.full_name || userInfo.username}</span>
        <span class="user-email">${userInfo.email}</span>
        <span class="custom-ai-name"></span>
    `;
    const savedAI = localStorage.getItem('selectedAI');
    if (savedAI) {
        currentDataAI = JSON.parse(savedAI);
        currentAI = JSON.parse(currentDataAI.content_data);
        document.querySelector('.custom-ai-name').textContent = `Chat with ${currentAI.name}`;
    }
}

async function fetchUserInfo() {
    try {
        const token = getCookie('access_token');
        if (!token) {
            redirectToLogin();
            return;
        }

        const response = await fetch(USER_INFO_URL, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        const data = await response.json();
        displayUserInfo(data);
    } catch (error) {
        console.error('Error fetching user info:', error);
    }
}

function updateChatHeader() {
    const headerRight = document.querySelector('.header-right');

    const clearHistoryBtn = document.createElement('button');
    clearHistoryBtn.className = 'btn btn-warning me-2';
    clearHistoryBtn.innerHTML = `
        <i class="bi bi-trash"></i>
        Clear History
    `;
    clearHistoryBtn.onclick = () => {
        if (confirm('Are you sure you want to clear the chat history?')) {
            clearChatHistory();
        }
    };

    const customAiButton = headerRight.querySelector('.custom-ai-button');
    headerRight.insertBefore(clearHistoryBtn, customAiButton);
}

function closePopupOnOutsideClick(event) {
    const popup = document.getElementById('aiPopup');
    const popupContent = popup.querySelector('.popup-content');

    if (popup.style.display === 'flex' && !popupContent.contains(event.target)) {
        closeAIPopup();
    }
}

// Event listeners and initialization
document.addEventListener('DOMContentLoaded', async () => {
    handleLoginReturn();
    if (!checkAuth()) return;
    marked.setOptions({
        breaks: true,
        gfm: true,
        tables: true,
        headerIds: false,
        sanitize: false,
        highlight: function (code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    });
    // Add document upload input to HTML
    const inputContainer = document.querySelector('.input-container');
    const uploadLabel = document.createElement('label');
    uploadLabel.className  = 'upload-btn';
    const documentUploadInput = document.createElement('input');
    documentUploadInput.type = 'file';
    documentUploadInput.id = 'document-upload';
    documentUploadInput.accept = '.pdf,.docx,.xlsx,.doc,.xls';
    documentUploadInput.style.display = 'none';
    uploadLabel.appendChild(documentUploadInput);

    // Add document icon
    const documentIcon = document.createElement('i');
    documentIcon.className = 'fas fa-file-alt ms-2';
    uploadLabel.appendChild(documentIcon);

    inputContainer.insertBefore(uploadLabel, inputContainer.firstChild);

    // Add event listener for document upload
    documentUploadInput.addEventListener('change', handleDocumentUpload);
    await fetchUserInfo();
    updateChatHeader();
    loadChatHistory();
    sendButton.addEventListener('click', sendMessage);

    function autoResizeTextarea() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    }

    inputField.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    inputField.addEventListener('input', autoResizeTextarea);

    inputField.focus();
    customAIs = await getCustomAIs();
    const imageUpload = document.getElementById('image-upload');
    imageUpload.addEventListener('change', handleImageUpload);
    loadSavedTheme();
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
});

document.querySelector('.popup-content').addEventListener('click', function (event) {
    event.stopPropagation();
});

document.querySelector('.custom-ai-button').addEventListener('click', function (event) {
    event.stopPropagation();
    showAIList();
});

document.addEventListener('click', closePopupOnOutsideClick);

document.getElementById('aiSearch').addEventListener('input', searchAI);

document.getElementById('aiForm').addEventListener('submit', saveAI);