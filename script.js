// Global state
let uploadedDocuments = []; // Stores { id, name, type, content, imageBase64 }
let selectedDepartment = null;
let chatHistory = []; // Stores { sender, message, timestamp, images: [{ mimeType, data }] }
let questionCount = 0;
let builtInResources = {};

// Initialize markdown-it parser with options
const MARKDOWN_OPTIONS = {
    breaks: true, // Convert '\n' in input to <br>
    gfm: true,    // Enable GitHub Flavored Markdown (tables, strikethrough, etc.)
    tables: true  // Enable tables (part of GFM)
};
const md = window.markdownit(MARKDOWN_OPTIONS); // Apply options here

const TYPING_DELAY = 50; // ms between "typing" characters (not directly used in current streaming)
const TYPING_INDICATOR_ID = 'typing-indicator';

// Add this after your other DOM elements
const chatContainer = document.getElementById('chatHistory');

/**
 * Adds a chat message to the display.
 * @param {string} message - The text message or raw HTML to display.
 * @param {'ai'|'user'} sender - The sender of the message ('ai' or 'user').
 * @param {Array<Object>} images - An array of image objects { mimeType, data }.
 * @param {boolean} isStreaming - True if this message is part of a streaming response.
 * @param {boolean} isRawHtml - True if the message should be inserted as raw HTML (no Markdown parsing).
 * @returns {string} The ID of the created message div.
 */
function addChatMessage(message, sender, images = [], isStreaming = false, isRawHtml = false) {
    const messageId = `msg-${Date.now()}`;
    const div = document.createElement('div');
    div.className = `${sender}-message`;
    div.id = messageId;

    let processedMessage;
    if (isRawHtml) {
        processedMessage = message; // Insert as raw HTML
    } else if (sender === 'ai' && typeof md !== 'undefined') {
        processedMessage = md.render(message); // Render as Markdown for AI messages
    } else {
        processedMessage = `<p>${message}</p>`; // Default to paragraph for user messages or if md not available
    }

    let messageContentHtml = `<div class="message-content">${processedMessage}</div>`;

    // Add image previews if images are provided
    if (images.length > 0) {
        const imgHtml = images.map(img =>
            `<img src="${img.data}" alt="Uploaded Image" class="uploaded-image" style="max-width: 150px; border-radius: 8px; margin-top: 5px;">`
        ).join('');
        messageContentHtml += `<div class="image-previews">${imgHtml}</div>`;
    }

    div.innerHTML = `
        <div class="message-header">
            <span>${sender === 'ai' ? '🤖' : '👤'}</span>
            <span>${sender === 'ai' ? 'AI Assistant' : 'You'}</span>
            ${sender === 'ai' ? '<div class="message-actions"></div>' : ''}
        </div>
        ${messageContentHtml}
    `;

    // For AI messages, add a copy button
    if (sender === 'ai') {
        const actionsDiv = div.querySelector('.message-actions');
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '📋'; // Clipboard icon
        copyButton.title = 'Copy to clipboard';
        copyButton.addEventListener('click', () => {
            // Use a temporary textarea to copy the raw text, not HTML
            const tempTextArea = document.createElement('textarea');
            // If the message was raw HTML, we need to extract its text content for copying
            // Otherwise, use the original raw message
            tempTextArea.value = isRawHtml ? div.querySelector('.message-content').innerText : message;
            document.body.appendChild(tempTextArea);
            tempTextArea.select();
            document.execCommand('copy'); // Use execCommand for broader compatibility in iframes
            document.body.removeChild(tempTextArea);

            copyButton.innerHTML = '✓'; // Change icon to checkmark
            setTimeout(() => copyButton.innerHTML = '📋', 2000); // Revert after 2 seconds
        });
        actionsDiv.appendChild(copyButton);
    }

    // Append message to chat container
    if (isStreaming) {
        // Remove any existing typing indicator before appending new streaming message part
        const existingTyping = document.getElementById(TYPING_INDICATOR_ID);
        if (existingTyping) existingTyping.remove();
        chatContainer.appendChild(div);
    } else {
        // Insert before any typing indicator for non-streaming messages
        const typingIndicator = document.getElementById(TYPING_INDICATOR_ID);
        if (typingIndicator) {
            chatContainer.insertBefore(div, typingIndicator);
        } else {
            chatContainer.appendChild(div);
        }
    }

    // Highlight code blocks if highlight.js is loaded (for AI messages)
    // Only apply if not raw HTML, as raw HTML might contain its own formatting
    if (sender === 'ai' && typeof hljs !== 'undefined' && !isRawHtml) {
        setTimeout(() => {
            div.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }, 100);
    }

    // Store message in chat history (store raw message, not processed HTML)
    // For raw HTML messages, we store the original HTML string
    const chatEntry = {
        sender,
        message: isRawHtml ? message : message, // Store the original message for chat history
        timestamp: new Date().toISOString(),
        images: images.map(img => ({ mimeType: img.mimeType, data: img.data }))
    };
    chatHistory.push(chatEntry);

    // Auto-scroll to bottom if user is near the bottom
    const isNearBottom = chatContainer.scrollTop + chatContainer.clientHeight >=
                         chatContainer.scrollHeight - 100; // 100px buffer
    if (isNearBottom) {
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 50);
    }

    return messageId;
}

/**
 * Displays a typing indicator at the bottom of the chat.
 * @returns {HTMLElement} The typing indicator div element.
 */
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = TYPING_INDICATOR_ID;
    typingDiv.className = 'ai-message typing-indicator';
    typingDiv.innerHTML = `
        <div class="message-header">
            <span>🤖</span>
            <span>AI Assistant</span>
        </div>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return typingDiv;
}

/**
 * Removes the typing indicator from the chat.
 */
function removeTypingIndicator() {
    const typingDiv = document.getElementById(TYPING_INDICATOR_ID);
    if (typingDiv) typing_Div.remove();
}

/**
 * Streams the response from the server and updates the message element.
 * @param {Response} response - The fetch API Response object.
 * @param {string} messageId - The ID of the message element to update.
 * @returns {Promise<string>} A promise that resolves with the full streamed message.
 */
async function streamResponse(response, messageId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullMessage = '';
    let messageElement = document.getElementById(messageId);

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullMessage += chunk;

            // Update message content with new chunk (rendered as Markdown)
            if (messageElement) {
                const contentDiv = messageElement.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.innerHTML = md.render(fullMessage); // Use md for markdown-it

                    // Highlight any new code blocks that appear during streaming
                    if (typeof hljs !== 'undefined') {
                        messageElement.querySelectorAll('pre code').forEach(block => {
                            hljs.highlightElement(block);
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error("Streaming error:", error);
        fullMessage += `\n\n**Error during streaming:** ${error.message || 'Connection interrupted.'}`;
    }

    return fullMessage;
}


const departmentResources = {
    'engineering': { 'Mathematics': ['Calculus', 'Differential Equations', 'Linear Algebra', 'Statistics'] },
    'computer-science': { 'Programming': ['Data Structures', 'Algorithms', 'OOP Concepts', 'Design Patterns'] },
    'medicine': { 'Basic Sciences': ['Anatomy', 'Physiology', 'Biochemistry', 'Pathology'] },
    'business': { 'Core Subjects': ['Accounting', 'Finance', 'Marketing', 'Management'] },
    'law': { 'Foundational': ['Constitutional Law', 'Criminal Law', 'Contract Law', 'Tort Law'] },
    'arts': { 'Literature': ['Literary Theory', 'Poetry Analysis', 'World Literature', 'Creative Writing'] },
    'science': { 'Chemistry': ['Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry', 'Analytical Chemistry'] },
    'general': { 'Study Skills': ['Time Management', 'Note-Taking', 'Exam Preparation', 'Critical Thinking'] }
};

// DOM elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadedFilesList = document.getElementById('uploadedFiles');
const libraryFilesList = document.getElementById('libraryFiles');
const docCountSpan = document.getElementById('docCount');
const questionCountSpan = document.getElementById('questionCount');
const uploadStatusDiv = document.getElementById('uploadStatus');
const libraryStatsDiv = document.getElementById('libraryStats');
const chatHistoryDiv = document.getElementById('chatHistory');
const questionInput = document.getElementById('questionInput');
const resourceCategoriesDiv = document.getElementById('resourceCategories');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    updateDocumentCount();
    updateLibraryStats();
    selectDepartment('general');
    loadSavedItems();
});

function setupEventListeners() {
    document.getElementById('chooseFilesBtn')?.addEventListener('click', () => fileInput.click());
    document.getElementById('clearAllBtn')?.addEventListener('click', clearAllFiles);
    document.getElementById('askAIButton')?.addEventListener('click', askQuestion);
    document.getElementById('summarizeButton')?.addEventListener('click', generateSummary);
    document.getElementById('clearChatButton')?.addEventListener('click', clearChat);

    document.querySelectorAll('.department-card').forEach(card =>
        card.addEventListener('click', () => selectDepartment(card.dataset.dept)));

    uploadZone.addEventListener('dragover', e => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', e => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        processFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', e => processFiles(e.target.files));
    // The onkeypress attribute was removed from HTML, so add event listener here
    questionInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') askQuestion();
    });
}

async function processFiles(files) {
    if (!files.length) return;

    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    uploadStatusDiv.textContent = 'Uploading and processing...';

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const fileName = file.name;

        let simulatedProgress = 0;
        const interval = setInterval(() => {
            simulatedProgress += 5;
            if (simulatedProgress <= 100) progressFill.style.width = `${simulatedProgress}%`;
            else clearInterval(interval);
        }, 50);

        try {
            // Standardized URL for upload - FIXED TO RENDER URL
            const res = await fetch('https://ai-backend-6fsy.onrender.com/upload', { method: 'POST', body: formData });
            clearInterval(interval);
            progressFill.style.width = '100%';
            // Check for non-OK responses before trying to parse JSON
            if (!res.ok) {
                const errorText = await res.text(); // Get raw text for better error message
                throw new Error(`HTTP error! Status: ${res.status}, Message: ${errorText}`);
            }
            const data = await res.json();

            if (data.success) {
                const fileType = file.type;
                const prefix = fileType.startsWith('image/') ? '🖼️ Image' :
                              fileType.includes('officedocument.wordprocessingml.document') ? '📄 DOCX' :
                              fileType.includes('pdf') ? '📕 PDF' : '📁 File';

                const doc = {
                    id: Date.now() + Math.random(),
                    name: `${prefix} - ${fileName}`,
                    type: fileType,
                    content: data.extractedText || '',
                    imageBase64: data.imageBase64 || null // Store base64 for images
                };

                uploadedDocuments.push(doc);
                displayUploadedFile(doc, file);
                updateDocumentCount();
                addChatMessage(`✅ Uploaded: ${fileName}`, 'ai');

                // Feature 1: Generate questions after PDF/DOCX upload
                if (doc.content.length > 100 && (doc.type.includes('pdf') || doc.type.includes('officedocument.wordprocessingml.document'))) {
                    await generateQuestionsForDocument(doc.content);
                }

            } else {
                addChatMessage(`❌ Error: ${data.message}`, 'ai');
            }
        } catch (err) {
            console.error("Upload error:", err);
            addChatMessage(`❌ Upload failed for ${fileName}. ${err.message || 'Check server connection.'}`, 'ai');
        } finally {
            setTimeout(() => {
                progressBar.style.display = 'none';
                uploadStatusDiv.textContent = '';
            }, 500);
        }
    }
}

function displayUploadedFile(file, rawFile) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `<span>${file.name}</span><button class="remove-file-btn" data-id="${file.id}">Remove</button>`;

    // Image thumbnail preview
    if (file.type.startsWith('image/') && rawFile) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(rawFile); // Use rawFile for object URL
        img.style.maxWidth = '80px'; // Smaller thumbnail
        img.style.height = 'auto';
        img.style.borderRadius = '5px';
        img.style.marginLeft = '10px';
        item.prepend(img); // Prepend to show image before text
    }

    uploadedFilesList.appendChild(item);
    const libItem = item.cloneNode(true);
    libraryFilesList.appendChild(libItem);

    [item, libItem].forEach(el => {
        el.querySelector('.remove-file-btn').addEventListener('click', e =>
            removeFile(parseFloat(e.target.dataset.id))
        );
    });

    updateLibraryStats();
}

function removeFile(id) {
    uploadedDocuments = uploadedDocuments.filter(doc => doc.id !== id);
    uploadedFilesList.querySelector(`button[data-id="${id}"]`)?.closest('.file-item')?.remove();
    libraryFilesList.querySelector(`button[data-id="${id}"]`)?.closest('.file-item')?.remove();
    updateDocumentCount();
    updateLibraryStats();
    addChatMessage('🗑️ File removed.', 'ai');
}

function clearAllFiles() {
    uploadedDocuments = [];
    uploadedFilesList.innerHTML = '';
    libraryFilesList.innerHTML = '';
    updateDocumentCount();
    updateLibraryStats();
    addChatMessage('📂 All files cleared.', 'ai');
}

function updateDocumentCount() {
    docCountSpan.textContent = uploadedDocuments.length;
}

function updateLibraryStats() {
    libraryStatsDiv.style.display = uploadedDocuments.length === 0 ? 'block' : 'none';
}

function selectDepartment(dept) {
    selectedDepartment = dept;
    document.querySelectorAll('.department-card').forEach(card =>
        card.classList.toggle('active', card.dataset.dept === dept) // Use 'active' as per provided CSS
    );
    addChatMessage(`🎓 Department set to ${dept.replace('-', ' ').toUpperCase()}`, 'ai');
    displayBuiltInResources(dept);
}

async function displayBuiltInResources(dept) {
    const categories = departmentResources[dept];
    if (!categories) {
        resourceCategoriesDiv.innerHTML = 'No resources available.';
        return;
    }

    let html = '';
    for (const category in categories) {
        html += `<h4>${category}</h4><ul class="resource-list">`;
        for (const topic of categories[category]) {
            const key = `${dept}-${category}-${topic}`;
            if (!builtInResources[key])
                builtInResources[key] = await simulateResourceLoad(dept, category, topic);
            html += `<li><span class="resource-item" data-topic="${topic}" data-category="${category}" data-dept="${dept}">${topic}</span></li>`;
        }
        html += '</ul>';
    }
    resourceCategoriesDiv.innerHTML = html;

    document.querySelectorAll('.resource-item').forEach(item => {
        item.addEventListener('click', () => {
            const { topic, category, dept } = item.dataset;
            const key = `${dept}-${category}-${topic}`;
            addChatMessage(`📘 ${topic}:<br>${builtInResources[key].slice(0, 200)}...`, 'ai');
        });
    });
}

function simulateResourceLoad(dept, cat, topic) {
    return new Promise(res => {
        setTimeout(() => {
            res(`This is a simulated resource on ${topic} in ${cat} (${dept}) with detailed explanations and examples.`);
        }, 300);
    });
}


async function askQuestion() {
    const question = questionInput.value.trim();

    // Collect images from uploadedDocuments that have base64 data
    const imagesToSend = uploadedDocuments.filter(doc => doc.type.startsWith('image/') && doc.imageBase64).map(doc => ({
        mimeType: doc.type,
        data: doc.imageBase64 // Send raw base64 data, not data URL prefix here
    }));

    // Collect text content from non-image documents
    const textDocumentsContent = uploadedDocuments.filter(doc => !doc.type.startsWith('image/')).map(doc => doc.content);

    if (!question && imagesToSend.length === 0 && textDocumentsContent.length === 0) {
        return addChatMessage('⚠️ Enter a question or upload documents/images first.', 'ai');
    }

    // Display user's question and images (images need data URL prefix for display)
    addChatMessage(question, 'user', imagesToSend.map(img => ({ mimeType: img.mimeType, data: `data:${img.mimeType};base64,${img.data}` })));

    questionInput.value = '';
    questionCount++;
    questionCountSpan.textContent = questionCount;

    showTypingIndicator(); // Show typing indicator

    const messageId = addChatMessage('', 'ai', [], true); // Create an empty AI message for streaming

    try {
        // FIXED TO RENDER URL
        const res = await fetch('https://ai-backend-6fsy.onrender.com/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: question,
                documents: textDocumentsContent, // Send text content of non-image docs
                images: imagesToSend.map(img => `data:${img.mimeType};base64,${img.data}`), // Send data URLs for the backend
                department: selectedDepartment,
                chatHistory: chatHistory, // Send full chat history
                stream: true // Request streaming response
            })
        });

        if (!res.ok) {
            const errorText = await res.text(); // Get raw text for better error message
            throw new Error(`HTTP error! Status: ${res.status}, Message: ${errorText}`);
        }

        removeTypingIndicator(); // Remove typing indicator once response starts
        const fullMessage = await streamResponse(res, messageId); // Stream the response

        // Update chat history with complete message
        const aiMessageIndex = chatHistory.findIndex(msg => msg.sender === 'ai' && msg.message === '');
        if (aiMessageIndex !== -1) {
            chatHistory[aiMessageIndex].message = fullMessage;
        }

    } catch (error) {
        console.error("Ask AI error:", error);
        removeTypingIndicator(); // Remove typing indicator on error

        // Update the empty AI message with error
        const errorElement = document.getElementById(messageId);
        if (errorElement) {
            errorElement.querySelector('.message-content').innerHTML =
                `❌ AI failed to respond. ${error.message || 'Please try again or check server.'}`;
        }

        // Update chat history
        const aiMessageIndex = chatHistory.findIndex(msg => msg.sender === 'ai' && msg.message === '');
        if (aiMessageIndex !== -1) {
            chatHistory[aiMessageIndex].message =
                `AI Error: ${error.message || 'Failed to respond'}`;
        }
    }
}


async function generateSummary() {
    // Collect images from uploadedDocuments that have base64 data
    const imagesToSend = uploadedDocuments.filter(doc => doc.type.startsWith('image/') && doc.imageBase64).map(doc => ({
        mimeType: doc.type,
        data: doc.imageBase64 // Send raw base64 data, not data URL prefix here
    }));

    // Collect text content from non-image documents
    const textDocumentsContent = uploadedDocuments.filter(doc => !doc.type.startsWith('image/')).map(doc => doc.content);

    if (textDocumentsContent.length === 0 && imagesToSend.length === 0) {
        return addChatMessage('⚠️ Upload PDF, DOCX documents, or images to summarize.', 'ai');
    }

    let summaryMessage = '📄 Summarizing...';
    if (imagesToSend.length > 0 && textDocumentsContent.length > 0) {
        summaryMessage = '📄 Summarizing documents and images...';
    } else if (imagesToSend.length > 0) {
        summaryMessage = '🖼️ Summarizing images...';
    } else if (textDocumentsContent.length > 0) {
        summaryMessage = '📄 Summarizing documents...';
    }

    addChatMessage(summaryMessage, 'ai');
    showTypingIndicator(); // Show typing indicator

    const messageId = addChatMessage('', 'ai', [], true); // Create an empty AI message for streaming

    try {
        // FIXED TO RENDER URL
        const res = await fetch('https://ai-backend-6fsy.onrender.com/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documents: textDocumentsContent,
                images: imagesToSend.map(img => `data:${img.mimeType};base64,${img.data}`), // Send data URLs for the backend
                department: selectedDepartment,
                stream: true // Request streaming response
            })
        });
        if (!res.ok) {
            const errorText = await res.text(); // Get raw text for better error message
            throw new Error(`HTTP error! Status: ${res.status}, Message: ${errorText}`);
        }

        removeTypingIndicator(); // Remove typing indicator once response starts
        const fullMessage = await streamResponse(res, messageId); // Stream the response

        // Update chat history with complete message
        const aiMessageIndex = chatHistory.findIndex(msg => msg.sender === 'ai' && msg.message === '');
        if (aiMessageIndex !== -1) {
            chatHistory[aiMessageIndex].message = fullMessage;
        }

    } catch (error) {
        console.error("Summarize error:", error);
        removeTypingIndicator(); // Remove typing indicator on error

        // Update the empty AI message with error
        const errorElement = document.getElementById(messageId);
        if (errorElement) {
            errorElement.querySelector('.message-content').innerHTML =
                `❌ Failed to summarize. ${error.message || 'Please try again or check server.'}`;
        }

        // Update chat history
        const aiMessageIndex = chatHistory.findIndex(msg => msg.sender === 'ai' && msg.message === '');
        if (aiMessageIndex !== -1) {
            chatHistory[aiMessageIndex].message =
                `AI Error: ${error.message || 'Failed to summarize'}`;
        }
    }
}

async function generateQuestionsForDocument(documentText) {
    addChatMessage('💡 Generating quick questions...', 'ai'); // This message is fine as it's just text
    try {
        // Standardized URL for generate_questions - FIXED TO RENDER URL
        const res = await fetch('https://ai-backend-6fsy.onrender.com/generate_questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentText: documentText,
                department: selectedDepartment
            })
        });
        // Check for non-OK responses before trying to parse JSON
        if (!res.ok) {
            const errorText = await res.text(); // Get raw text for better error message
            throw new Error(`HTTP error! Status: ${res.status}, Message: ${errorText}`);
        }
        const data = await res.json();
        chatHistoryDiv.lastChild.remove(); // Remove "Generating..." message

        if (data.questions && data.questions.length > 0) {
            let questionsHtml = "<strong>Here are some quick questions you might ask:</strong><br>";
            data.questions.forEach((q, index) => {
                questionsHtml += `<button class="btn btn-small generated-question-btn" data-question="${q}">${index + 1}. ${q}</button><br>`;
            });
            // Pass true for isRawHtml so it's inserted directly without markdown parsing
            addChatMessage(questionsHtml, 'ai', [], false, true);
            // Add event listeners to the new buttons
            document.querySelectorAll('.generated-question-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    questionInput.value = e.target.dataset.question;
                    askQuestion();
                });
            });
        } else {
            addChatMessage('No quick questions could be generated for this document.', 'ai');
        }
    } catch (error) {
        console.error("Generate questions error:", error);
        chatHistoryDiv.lastChild.remove();
        addChatMessage(`❌ Failed to generate quick questions. ${error.message || 'Please try again or check server.'}`, 'ai');
    }
}

function clearChat() {
    chatHistory = [];
    questionCount = 0;
    questionCountSpan.textContent = questionCount;
    // Reset chat history to the initial welcome message
    // Note: This initial message is raw HTML, so it should be handled accordingly.
    chatHistoryDiv.innerHTML = `<div class="ai-message"><div class="message-header"><span>🤖</span><span>AI Assistant</span></div><div class="message-content"><p>👋 Welcome to UniStudy AI! I'm your department-agnostic study assistant.</p><p><strong>Here's how I can help you:</strong></p><ul style="margin: 10px 0; padding-left: 20px;"><li>📖 Answer questions from your uploaded materials</li><li>📝 Create summaries and study guides</li><li>🔍 Find specific information across multiple documents</li><li>💡 Explain complex concepts in simple terms</li><li>📊 Analyze patterns in your study materials</li></ul><p>Select your department above and upload your study materials to get started!</p></div></div>`;
    // No need to call addChatMessage here as we just set innerHTML
    loadSavedItems(); // Reload saved items if they are displayed
}

function handleSaveChat(question, answer) {
    const savedItems = JSON.parse(localStorage.getItem('savedUniStudyItems') || '[]');
    savedItems.push({ id: Date.now(), question, answer });
    localStorage.setItem('savedUniStudyItems', JSON.stringify(savedItems));
    addChatMessage('⭐️ Chat saved!', 'ai');
    loadSavedItems();
}

function deleteSavedItem(id) {
    let savedItems = JSON.parse(localStorage.getItem('savedUniStudyItems') || '[]');
    savedItems = savedItems.filter(item => item.id !== parseFloat(id));
    localStorage.setItem('savedUniStudyItems', JSON.stringify(savedItems));
    addChatMessage('🗑️ Saved item deleted.', 'ai');
    loadSavedItems();
}

function loadSavedItems() {
    const savedItems = JSON.parse(localStorage.getItem('savedUniStudyItems') || '[]');
    const qaSection = document.querySelector('.qa-section');
    let section = document.querySelector('.saved-items-section');
    if (savedItems.length === 0) {
        if (section) section.remove();
        return;
    }

    if (!section) {
        section = document.createElement('div');
        section.className = 'card saved-items-section';
        section.innerHTML = `<h4>⭐️ Saved Questions & Notes</h4><ul class="saved-list" id="savedQuestionsList"></ul>`;
        qaSection.appendChild(section);
    }

    const list = section.querySelector('#savedQuestionsList');
    list.innerHTML = '';
    savedItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'saved-item';
        li.innerHTML = `
            <div class="saved-question">Q: ${item.question}</div>
            <div class="saved-answer">A: ${item.answer}</div>
            <div class="saved-actions">
                <button class="delete-saved-btn" data-id="${item.id}">Delete</button>
            </div>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll('.delete-saved-btn').forEach(btn =>
        btn.addEventListener('click', e =>
            deleteSavedItem(e.target.dataset.id)
        )
    );
}
