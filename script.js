// Data structure: Each list now includes a 'reset' object: {hour, minute, lastResetTime}
const DEFAULT_LISTS = [
    { id: 'board-1', title: "Today's Focus", area: 'board', tasks: [], reset: { hour: 0, minute: 0, lastResetTime: 0 } },
    // RENAMED the default inbox list
    { id: 'inbox-1', title: "Incomplete Tasks", area: 'inbox', tasks: [], reset: { hour: -1, minute: -1, lastResetTime: 0 } }, // -1 means no auto-reset
];

let draggedItem = null;
let lists = [];
let currentListIdForModal = null; 

// --- Local Storage Management ---

function getLocalData(key, defaultValue = '[]') {
    const storedData = localStorage.getItem(key);
    if (storedData) {
        return JSON.parse(storedData);
    }
    return JSON.parse(defaultValue);
}

function saveLists() {
    localStorage.setItem('taskLists', JSON.stringify(lists));
}

// --- Initialization and View Management ---

function initializeApp() {
    // 1. Load lists from storage or use defaults
    lists = getLocalData('taskLists', JSON.stringify(DEFAULT_LISTS));
    
    // CRITICAL: Ensure the default Inbox list exists and has the correct name if it was old
    let inboxList = lists.find(l => l.id === 'inbox-1');
    if (!inboxList) {
        // If it doesn't exist, push the default (now "Incomplete Tasks")
        lists.push(DEFAULT_LISTS.find(l => l.area === 'inbox'));
        inboxList = lists.find(l => l.id === 'inbox-1');
    }
    // Ensure the title is always the default "Incomplete Tasks" on load, even if it was previously "Unsorted Tasks" in storage
    inboxList.title = "Incomplete Tasks";
    saveLists(); 
    
    // 2. Display the app
    showView('board-view'); 
    renderLists();

    // 3. Check for task resets (for all applicable lists)
    checkAndPerformAllResets();
    
    // 4. Set up recurring check (every 5 minutes)
    setInterval(checkAndPerformAllResets, 5 * 60 * 1000); 

    // 5. Add scroll listener for custom indicator
    document.getElementById('board-container').addEventListener('scroll', updateScrollIndicator);
    
    // Call once to set initial state of indicator
    updateScrollIndicator(); 
}

function showView(viewId) {
    document.querySelectorAll('.app-view').forEach(view => {
        view.classList.remove('active-view');
    });
    document.getElementById(viewId).classList.add('active-view');
    
    document.querySelectorAll('#app-nav button').forEach(btn => {
        btn.classList.remove('active');
    });
    const navButton = document.getElementById(`nav-${viewId.replace('-view', '')}`);
    if(navButton) {
        navButton.classList.add('active');
    }
}

// --- List Management (Create/Delete/Render) ---

function generateListId(area) {
    return `${area}-${Date.now()}`;
}

/** Creates the HTML structure for a single list. */
function createListElement(list) {
    const listEl = document.createElement('div');
    listEl.className = 'list';
    listEl.id = list.id;

    // Show timer button only for Board lists
    const timerButton = list.area === 'board' ? 
        `<button class="reset-timer-btn" onclick="openResetModal('${list.id}')">⏰</button>` : '';

    // Prevent deleting the default inbox list (id: inbox-1)
    const deleteButton = list.id !== 'inbox-1' ? 
        `<button class="delete-list-btn" onclick="deleteList('${list.id}')">🗑️</button>` : '';

    // Prevent editing the title of the default inbox list
    const titleEditable = list.id !== 'inbox-1';

    listEl.innerHTML = `
        <div class="list-header">
            <div class="list-title-group">
                <h2 contenteditable="${titleEditable}" onblur="updateListTitle('${list.id}', this.textContent)">${list.title}</h2>
                ${timerButton}
            </div>
            ${deleteButton}
        </div>
        <ul class="task-list" 
            ondragover="handleDragOver(event)" 
            ondrop="handleDrop(event, '${list.id}')"
            data-list-id="${list.id}">
        </ul>
        <button class="add-task-btn" onclick="addTask('${list.id}')">+ Add a task</button>
    `;

    return listEl;
}

function renderLists() {
    const boardContainer = document.getElementById('board-container');
    const inboxContainer = document.getElementById('inbox-container');
    
    const boardPlaceholder = boardContainer.querySelector('.add-list-placeholder');

    boardContainer.innerHTML = '';
    inboxContainer.innerHTML = '';

    lists.forEach(list => {
        const listEl = createListElement(list);
        if (list.area === 'board') {
            boardContainer.appendChild(listEl);
        } else if (list.area === 'inbox') {
            inboxContainer.appendChild(listEl);
        }
    });
    
    if (boardPlaceholder) boardContainer.appendChild(boardPlaceholder);

    renderTasks();
}

function addList(area) {
    if (area !== 'board') return; 

    const title = prompt(`Enter a title for the new ${area} list:`);
    if (title && title.trim()) {
        const newList = {
            id: generateListId(area),
            title: title.trim(),
            area: area,
            tasks: [],
            reset: { 
                hour: 0, 
                minute: 0, 
                lastResetTime: 0 
            } 
        };
        lists.push(newList);
        saveLists();
        renderLists();
    }
}

function deleteList(listId) {
    if (listId === 'inbox-1') {
        alert("The default Inbox list cannot be deleted. You can clear its tasks using the manual reset button.");
        return;
    }
    
    const list = lists.find(l => l.id === listId);
    if (list && confirm(`Are you sure you want to delete the list "${list.title}" and all its tasks?`)) {
        lists = lists.filter(l => l.id !== listId);
        saveLists();
        renderLists();
    }
}

function updateListTitle(listId, newTitle) {
    const list = lists.find(l => l.id === listId);
    
    if (listId === 'inbox-1') {
        // Do not allow renaming the default inbox list
        list.title = "Incomplete Tasks";
        // To immediately revert the title if user tried to edit it in the UI
        document.querySelector(`#${listId} h2`).textContent = "Incomplete Tasks";
        return;
    }
    
    if (list) {
        list.title = newTitle.trim() || "Untitled List";
        saveLists();
    }
}


// --- Task Management (Rest of the functions remain the same) ---
function createTaskElement(task, listId) {
    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;
    li.setAttribute('draggable', 'true');
    li.setAttribute('data-task-text', task.text);
    li.setAttribute('data-source-list', listId);

    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragend', handleDragEnd);

    li.innerHTML = `
        <div class="task-content">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                   onchange="toggleTaskCompletion('${listId}', '${task.text}', this.checked)">
            <span class="task-text">${task.text}</span>
        </div>
        <button class="remove-btn" onclick="removeTask('${listId}', '${task.text}')">🗑️</button>
    `;

    return li;
}
function renderTasks() {
    lists.forEach(list => {
        const taskListEl = document.querySelector(`#${list.id} .task-list`);
        if (taskListEl) {
            taskListEl.innerHTML = '';
            list.tasks.forEach(task => {
                taskListEl.appendChild(createTaskElement(task, list.id));
            });
        }
    });
}
function addTask(listId) {
    const taskText = prompt('Enter the new task:');
    if (taskText && taskText.trim()) {
        const list = lists.find(l => l.id === listId);
        if (list) {
            list.tasks.push({ text: taskText.trim(), completed: false });
            saveLists();
            renderTasks();
        }
    }
}
function removeTask(listId, taskText) {
    const list = lists.find(l => l.id === listId);
    if (list && confirm(`Remove task: "${taskText}"?`)) {
        list.tasks = list.tasks.filter(t => t.text !== taskText);
        saveLists();
        renderTasks();
    }
}
function toggleTaskCompletion(listId, taskText, isCompleted) {
    const list = lists.find(l => l.id === listId);
    if (list) {
        const task = list.tasks.find(t => t.text === taskText);
        if (task) {
            task.completed = isCompleted;
            saveLists();
            renderTasks();
        }
    }
}
function saveTaskOrder() {
    lists.forEach(list => {
        const taskListEl = document.querySelector(`#${list.id} .task-list`);
        if (taskListEl) {
            const newTasks = [];
            taskListEl.querySelectorAll('.task-item').forEach(li => {
                const text = li.getAttribute('data-task-text');
                
                const originalTask = list.tasks.find(t => t.text === text);

                if (originalTask) {
                    newTasks.push(originalTask);
                } else {
                    const isCompleted = li.querySelector('.task-checkbox').checked;
                    newTasks.push({ text: text, completed: isCompleted });
                }
            });

            list.tasks = newTasks;
        }
    });
    saveLists();
}

// --- Drag and Drop Logic (unchanged) ---
function handleDragStart(e) {
    draggedItem = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-task-text')); 
    setTimeout(() => this.classList.add('dragging'), 0);
}
function handleDragEnd() {
    this.classList.remove('dragging');
    draggedItem = null;
    saveTaskOrder(); 
}
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetListEl = e.currentTarget;

    if (targetListEl && draggedItem) {
        const afterElement = getDragAfterElement(targetListEl, e.clientY);
        
        if (afterElement == null) {
            targetListEl.appendChild(draggedItem);
        } else {
            targetListEl.insertBefore(draggedItem, afterElement);
        }
    }
}
function handleDrop(e, targetListId) {
    e.preventDefault();
    if (!draggedItem) return;

    const sourceListId = draggedItem.getAttribute('data-source-list');
    const taskText = draggedItem.getAttribute('data-task-text');
    
    if (sourceListId !== targetListId) {
        const sourceList = lists.find(l => l.id === sourceListId);
        const targetList = lists.find(l => l.id === targetListId);
        
        const taskIndex = sourceList.tasks.findIndex(t => t.text === taskText);
        const taskToMove = sourceList.tasks[taskIndex];

        sourceList.tasks.splice(taskIndex, 1);
        targetList.tasks.splice(0, 0, taskToMove); 
        
        draggedItem.setAttribute('data-source-list', targetListId); 
    }

    saveTaskOrder(); 
    renderTasks(); 
}
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


// --- Custom Scroll Indicator Logic (unchanged) ---

function updateScrollIndicator() {
    const boardContainer = document.getElementById('board-container');
    const indicator = document.getElementById('board-scroll-indicator');
    
    const scrollableWidth = boardContainer.scrollWidth - boardContainer.clientWidth;
    
    if (scrollableWidth <= 1) { 
        indicator.style.width = '0%';
        return;
    }
    
    const scrollPercent = boardContainer.scrollLeft / scrollableWidth;

    const indicatorWidthRatio = boardContainer.clientWidth / boardContainer.scrollWidth;
    const indicatorWidth = indicatorWidthRatio * 100; 

    const indicatorPosition = scrollPercent * (100 - indicatorWidth); 

    indicator.style.width = `${indicatorWidth}%`;
    indicator.style.transform = `translateX(${indicatorPosition}%)`;
}


// --- List-Specific Reset (Unchecking) Logic ---

function openResetModal(listId) {
    const list = lists.find(l => l.id === listId);
    if (!list || list.area !== 'board') return;

    currentListIdForModal = listId;
    document.getElementById('modal-list-title').textContent = `Set Reset Timer for: ${list.title}`;
    
    const hour = list.reset.hour === -1 ? 0 : list.reset.hour;
    const minute = list.reset.minute === -1 ? 0 : list.reset.minute;
    
    document.getElementById('modal-reset-hour').value = hour;
    document.getElementById('modal-reset-minute').value = minute;

    // FIX: Modal display is controlled here by button click
    document.getElementById('reset-modal').style.display = 'flex';
}

function closeModal(event) {
    if (event.target.id === 'reset-modal') {
        document.getElementById('reset-modal').style.display = 'none';
    }
}

function saveListResetTime() {
    const list = lists.find(l => l.id === currentListIdForModal);
    if (!list) return;

    const hour = parseInt(document.getElementById('modal-reset-hour').value, 10);
    const minute = parseInt(document.getElementById('modal-reset-minute').value, 10);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        list.reset.hour = hour;
        list.reset.minute = minute;
        saveLists();
        alert(`Reset time for "${list.title}" set to ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`);
        document.getElementById('reset-modal').style.display = 'none';
    } else {
        alert('Please enter a valid hour (0-23) and minute (0-59).');
    }
}

function resetListTasks(listId) {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    list.tasks.forEach(task => {
        task.completed = false;
    });
    list.reset.lastResetTime = Date.now();
    
    saveLists();
    renderTasks();
}

function manualResetList() {
    const list = lists.find(l => l.id === currentListIdForModal);
    if (list && confirm(`Are you sure you want to UNCHECK all tasks in "${list.title}" now?`)) {
        resetListTasks(list.id);
        document.getElementById('reset-modal').style.display = 'none';
        alert(`All tasks in "${list.title}" have been unchecked.`);
    }
}

function checkAndPerformAllResets() {
    const now = new Date();
    
    lists.filter(l => l.area === 'board').forEach(list => {
        const lastResetTime = list.reset.lastResetTime || 0;
        const resetHour = list.reset.hour;
        const resetMinute = list.reset.minute;

        if (resetHour === -1 || resetMinute === -1) return;

        const lastResetDate = new Date(lastResetTime);
        const today = now.toDateString();
        const lastResetDay = lastResetDate.toDateString();
        
        const resetTimeToday = new Date(now);
        resetTimeToday.setHours(resetHour, resetMinute, 0, 0); 

        const shouldReset = (
            lastResetTime === 0 || 
            lastResetDay !== today || 
            (lastResetDay === today && now.getTime() >= resetTimeToday.getTime() && lastResetTime < resetTimeToday.getTime())
        );

        if (shouldReset) {
            console.log(`Automatic Reset: List "${list.title}" triggered at ${now.toLocaleTimeString()}`);
            resetListTasks(list.id);
        }
    });
}


// Start the application
initializeApp();