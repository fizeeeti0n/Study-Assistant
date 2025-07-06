// Global state
let uploadedDocuments = [];
let selectedDepartment = null;
let chatHistory = [];
let questionCount = 0;
let builtInResources = {};

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
            const res = await fetch('https://web-production-e4ce5.up.railway.app//upload', { method: 'POST', body: formData });
            clearInterval(interval);
            progressFill.style.width = '100%';
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
                    content: data.extractedText || ''
                };

                uploadedDocuments.push(doc);
                displayUploadedFile(doc, file);
                updateDocumentCount();
                addChatMessage(`✅ Uploaded: ${fileName}`, 'ai');
            } else {
                addChatMessage(`❌ Error: ${data.message}`, 'ai');
            }
        } catch (err) {
            addChatMessage(`❌ Upload failed for ${fileName}`, 'ai');
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
        img.src = URL.createObjectURL(rawFile);
        img.style.maxWidth = '100px';
        img.style.marginTop = '5px';
        item.appendChild(img);
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
        card.classList.toggle('selected', card.dataset.dept === dept)
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

function addChatMessage(message, sender) {
    const div = document.createElement('div');
    div.className = `${sender}-message`;
    div.innerHTML = `
        <div class="message-header">
            <span>${sender === 'ai' ? '🤖' : '👤'}</span><span>${sender === 'ai' ? 'AI Assistant' : 'You'}</span>
        </div>
        <div class="message-content"><p>${message}</p></div>
    `;
    chatHistoryDiv.appendChild(div);
    chatHistoryDiv.scrollTop = chatHistoryDiv.scrollHeight;
    chatHistory.push({ sender, message, timestamp: new Date().toISOString() });
}

async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question) return addChatMessage('⚠️ Enter a question first.', 'ai');
    addChatMessage(question, 'user');
    questionInput.value = '';
    questionCount++;
    questionCountSpan.textContent = questionCount;
    addChatMessage('💭 Thinking...', 'ai');

    try {
        const res = await fetch('https://web-production-e4ce5.up.railway.app//ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question,
                documents: uploadedDocuments.map(doc => doc.content),
                department: selectedDepartment,
                chatHistory
            })
        });
        const data = await res.json();
        chatHistoryDiv.lastChild.remove();
        addChatMessage(data.answer, 'ai');
    } catch {
        chatHistoryDiv.lastChild.remove();
        addChatMessage('❌ AI failed to respond.', 'ai');
    }
}

async function generateSummary() {
    if (!uploadedDocuments.length) return addChatMessage('⚠️ Upload documents first.', 'ai');
    addChatMessage('📄 Summarizing...', 'ai');

    try {
        const res = await fetch('https://web-production-e4ce5.up.railway.app//summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documents: uploadedDocuments.map(doc => doc.content),
                department: selectedDepartment
            })
        });
        const data = await res.json();
        chatHistoryDiv.lastChild.remove();
        addChatMessage(`<strong>Summary:</strong><br>${data.summary}`, 'ai');
    } catch {
        chatHistoryDiv.lastChild.remove();
        addChatMessage('❌ Failed to summarize.', 'ai');
    }
}

function clearChat() {
    chatHistory = [];
    questionCount = 0;
    questionCountSpan.textContent = questionCount;
    chatHistoryDiv.innerHTML = `<div class="ai-message"><div class="message-header"><span>🤖</span><span>AI Assistant</span></div><div class="message-content"><p>👋 Welcome to UniStudy AI!</p></div></div>`;
    addChatMessage('🧹 Chat history cleared.', 'ai');
    loadSavedItems();
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
    if (savedItems.length === 0) return section?.remove();

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
