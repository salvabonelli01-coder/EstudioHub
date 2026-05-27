    let scheduleBlocks = JSON.parse(localStorage.getItem('db_hub_schedule_blocks')) || [];
    const daysList = ["lunes", "martes", "miercoles", "jueves", "viernes"];
    // Configuración Inicial y Migración de Datos Antiguos
    let db;
    let activeSubjectId = null;
    
    // Obtener y adaptar el array de materias (V1 a V2)
    let subjects = JSON.parse(localStorage.getItem('db_hub_subjects')) || [];
    subjects = subjects.map(sub => {
        if (!Array.isArray(sub.grades)) {
            const oldGrades = sub.grades || {};
            sub.grades = [
                { id: 'g1', name: 'Parcial 1', weight: 40, date: '', score: (oldGrades.parcial1 > 0 ? (oldGrades.parcial1/10) : null) },
                { id: 'g2', name: 'Parcial 2', weight: 40, date: '', score: (oldGrades.parcial2 > 0 ? (oldGrades.parcial2/10) : null) },
                { id: 'g3', name: 'Trabajo Práctico', weight: 20, date: '', score: (oldGrades.tp > 0 ? (oldGrades.tp/10) : null) }
            ];
            sub.color = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6'][Math.floor(Math.random()*4)];
            sub.icon = '📚';
            sub.passingGrade = 6; 
            sub.machetes = [];
            sub.checklist = [];
        }
        return sub;
    });

    // Guardar estado e hidratar vistas
    function saveData() {
        localStorage.setItem('db_hub_subjects', JSON.stringify(subjects));
        updateDashboard();
        if(activeSubjectId) renderSubjectDetails();
    }

    // Inicializar IndexedDB para archivos
    const request = indexedDB.open("EstudioHubFilesDB", 2);
    request.onupgradeneeded = event => {
        db = event.target.result;
        if (!db.objectStoreNames.contains("files")) {
            db.createObjectStore("files", { keyPath: "id" });
        }
    };
    request.onsuccess = event => {
        db = event.target.result;
        initApp();
    };

    function initApp() {
        loadUsername(); // <-- Agregamos esta línea
        updateDashboard();
        loadTheme();      // <-- Nueva línea para el tema
        loadUsername();   // (La que agregamos antes)
        updateDashboard();
        // ... tus otras cargas (theme, username, etc) ...
        updateDashboard();
        renderSchedule(); 
        llenarSelectoresHorarios();
    }

    function showDashboard() {
        activeSubjectId = null;
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('subject-view').classList.add('hidden');
        updateDashboard();
    }

    function updateDashboard() {
        const grid = document.getElementById('subjects-grid');
        grid.innerHTML = '';
        
        let totalTopics = 0;
        let completedTopics = 0;
        let upcomingEvents = [];

        subjects.forEach(sub => {
            if (sub.checklist) {
                totalTopics += sub.checklist.length;
                completedTopics += sub.checklist.filter(c => c.status === 'done').length;
            }
            if (sub.grades) {
                sub.grades.forEach(g => {
                    if (g.date && !g.score) {
                        upcomingEvents.push({ subjectName: sub.name, evalName: g.name, date: g.date, color: sub.color });
                    }
                });
            }

            const progressPercent = sub.checklist?.length > 0 
                ? Math.round((sub.checklist.filter(c=>c.status==='done').length / sub.checklist.length) * 100) 
                : 0;

            const card = document.createElement('div');
            card.className = 'subject-card';
            card.onclick = () => openSubject(sub.id);
            card.innerHTML = `
                <div class="card-color-strip" style="background-color: ${sub.color}"></div>
                <div class="card-header">
                    <div>
                        <div class="card-title">${sub.name}</div>
                        <div class="card-status">${sub.info}</div>
                    </div>
                    <div class="card-icon" style="background-color: ${sub.color}20; color: ${sub.color}">
                        ${sub.icon || '📚'}
                    </div>
                </div>
                <div class="progress-container" style="margin-top: 1.5rem;">
                    <div class="progress-bar-bg" style="height: 6px;">
                        <div class="progress-bar-fill" style="width: ${progressPercent}%; background: ${sub.color}"></div>
                    </div>
                    <div class="progress-text" style="font-size: 0.75rem;">Progreso: ${progressPercent}%</div>
                </div>
                <button class="card-delete" onclick="event.stopPropagation(); deleteSubject('${sub.id}')"><i class="ph ph-trash"></i></button>
            `;
            grid.appendChild(card);
        });

        const globalPercent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
        document.getElementById('global-progress').style.width = `${globalPercent}%`;
        document.getElementById('global-progress-text').innerText = `${globalPercent}%`;

        const eventsContainer = document.getElementById('upcoming-events');
        upcomingEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (upcomingEvents.length === 0) {
            eventsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No hay parciales ni entregas pendientes. ¡Relajá! ☕</p>';
        } else {
            eventsContainer.innerHTML = upcomingEvents.slice(0, 4).map(e => `
                <div class="event-item" style="border-left-color: ${e.color}">
                    <div class="event-date">${new Date(e.date + 'T00:00:00').toLocaleDateString('es-AR', {day: 'numeric', month: 'short'})}</div>
                    <div class="event-title">${e.evalName} - <span style="color: var(--text-muted); font-size: 0.85rem;">${e.subjectName}</span></div>
                </div>
            `).join('');
        }
        // Pega esto justo antes de cerrar la llave } de updateDashboard()
        const select = document.getElementById('schedule-subject-select');
        if(select) {
            select.innerHTML = subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('') || '<option value="">Crea una materia primero</option>';
        }
    }

    function addSubject() {
        const name = document.getElementById('modal-sub-name').value.trim();
        const info = document.getElementById('modal-sub-info').value.trim() || 'Activa';
        const color = document.getElementById('modal-sub-color').value;

        if (!name) return alert('Ingresá el nombre.');

        subjects.push({
            id: 'sub_' + Date.now(), name, info, color, icon: '📚', passingGrade: 6,
            grades: [
                { id: 'g1', name: 'Primer Parcial', weight: 40, date: '', score: null },
                { id: 'g2', name: 'Segundo Parcial', weight: 40, date: '', score: null },
                { id: 'g3', name: 'Trabajo Práctico', weight: 20, date: '', score: null }
            ],
            machetes: [], checklist: []
        });

        document.getElementById('modal-sub-name').value = '';
        document.getElementById('modal-sub-info').value = '';
        closeModal('modal-add-subject');
        saveData();
    }

    function deleteSubject(id) {
        if(confirm('¿Seguro que querés borrar la materia y todos sus archivos?')) {
            subjects = subjects.filter(sub => sub.id !== id);
            const store = db.transaction(["files"], "readwrite").objectStore("files");
            const req = store.getAll();
            req.onsuccess = () => {
                req.result.forEach(file => {
                    if (file.subjectId === id) store.delete(file.id);
                });
            };
            saveData();
        }
    }

    function openSubject(id) {
        activeSubjectId = id;
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('subject-view').classList.remove('hidden');
        renderSubjectDetails();
    }

    function renderSubjectDetails() {
        const subject = subjects.find(s => s.id === activeSubjectId);
        if (!subject) return showDashboard();

        document.getElementById('view-subject-title').innerText = subject.name;
        document.getElementById('view-subject-info').innerText = subject.info;

        renderMachetes(subject);
        renderFilesList();
        renderGrades(subject);
        renderChecklist(subject);
    }

    function switchTab(event, tabId) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        event.currentTarget.classList.add('active');
    }

    function addMachete() {
        const titleInput = document.getElementById('machete-title');
        const contentInput = document.getElementById('machete-content');
        if(!titleInput.value.trim() || !contentInput.value.trim()) return alert("Completá título y contenido");

        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.machetes.push({ id: 'm_' + Date.now(), title: titleInput.value.trim(), content: contentInput.value.trim() });
        
        titleInput.value = ''; contentInput.value = '';
        saveData();
    }

    function renderMachetes(subject) {
        const container = document.getElementById('machetes-list');
        container.innerHTML = subject.machetes.map(m => `
            <details class="machete-item">
                <summary>
                    ${m.title} 
                    <button class="btn btn-danger" style="padding: 0.2rem 0.5rem; min-height: auto; background: none; border: none;" onclick="deleteMachete('${m.id}', event)"><i class="ph ph-trash"></i></button>
                </summary>
                <div class="machete-body">${m.content}</div>
            </details>
        `).join('') || '<p style="color:var(--text-muted); font-size:0.9rem;">No hay machetes creados.</p>';
    }

    function deleteMachete(mId, event) {
        event.preventDefault(); 
        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.machetes = subject.machetes.filter(m => m.id !== mId);
        saveData();
    }

    function renderGrades(subject) {
        document.getElementById('passing-grade-input').value = subject.passingGrade || 6;
        
        const generateOptions = (selected) => {
            let options = `<option value="">--</option>`;
            for(let i = 1; i <= 10; i += 0.5) {
                const val = i.toFixed(1);
                options += `<option value="${val}" ${selected == val ? 'selected' : ''}>${val}</option>`;
            }
            return options;
        };

        const tbody = document.getElementById('grades-tbody');
        tbody.innerHTML = subject.grades.map(g => `
            <tr>
                <td style="font-weight: 500;">${g.name}</td>
                <td>${g.weight}%</td>
                <td><input type="date" value="${g.date || ''}" onchange="updateGradeField('${g.id}', 'date', this.value)"></td>
                <td>
                    <select onchange="updateGradeField('${g.id}', 'score', this.value)">
                        ${generateOptions(g.score)}
                    </select>
                </td>
                <td>
                    <button class="btn btn-danger" style="padding: 0.3rem; min-height: auto; border: none; background: none;" onclick="deleteGradeComponent('${g.id}')"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `).join('');

        calculateSimulator(subject);
    }

    function updateGradeField(gradeId, field, value) {
        const subject = subjects.find(s => s.id === activeSubjectId);
        if (!subject) return;

        const grade = subject.grades.find(g => g.id === gradeId);
        
        if (grade) {
            if (field === 'score') {
                grade.score = value === "" ? null : parseFloat(value);
            } else {
                grade[field] = value;
            }
            saveData(); 
            console.log(`Guardado: ${field} = ${value}`);
        }
    }

    function updatePassingGrade(val) {
        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.passingGrade = parseFloat(val);
        saveData();
    }

    function addGradeComponent() {
        const name = document.getElementById('new-eval-name').value.trim();
        const weight = parseFloat(document.getElementById('new-eval-weight').value);
        if(!name || isNaN(weight)) return;

        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.grades.push({ id: 'g_' + Date.now(), name, weight, date: '', score: null });
        
        document.getElementById('new-eval-name').value = '';
        document.getElementById('new-eval-weight').value = '';
        saveData();
    }

    function deleteGradeComponent(id) {
        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.grades = subject.grades.filter(g => g.id !== id);
        saveData();
    }

    function calculateSimulator(subject) {
        const output = document.getElementById('simulator-output');
        let currentPoints = 0;
        let missingWeight = 0;
        let totalWeight = 0;

        subject.grades.forEach(g => {
            totalWeight += g.weight;
            if (g.score !== null) {
                currentPoints += (g.score * (g.weight / 100));
            } else {
                missingWeight += g.weight;
            }
        });

        if (totalWeight !== 100) {
            output.innerHTML = `<h3 style="color: var(--warning)"><i class="ph ph-warning-circle"></i> Ajustá los porcentajes</h3><p style="font-size: 0.9rem;">La suma de ponderaciones da ${totalWeight}%. Debe ser exactamente 100%.</p>`;
            return;
        }

        const targetGrade = subject.passingGrade || 6;
        const missingPoints = targetGrade - currentPoints;

        if (missingPoints <= 0) {
            output.innerHTML = `<h3 style="color: var(--success)"><i class="ph ph-check-circle"></i> ¡Materia Aprobada!</h3><p style="font-size: 0.9rem;">Tu nota actual ponderada es ${currentPoints.toFixed(2)}.</p>`;
        } else if (missingWeight === 0 && missingPoints > 0) {
            output.innerHTML = `<h3 style="color: var(--danger)"><i class="ph ph-x-circle"></i> No alcanzó</h3><p style="font-size: 0.9rem;">Nota final: ${currentPoints.toFixed(2)}. Faltaron ${missingPoints.toFixed(2)} pts.</p>`;
        } else {
            const neededAverage = (missingPoints / (missingWeight / 100)).toFixed(2);
            
            if (neededAverage > 10) {
                output.innerHTML = `<h3><i class="ph ph-warning"></i> Matemáticamente imposible</h3><p style="font-size: 0.9rem;">Necesitarías sacarte un ${neededAverage} en lo que queda.</p>`;
            } else {
                output.innerHTML = `
                    <h3>Para aprobar necesitas:</h3>
                    <div class="simulator-result">${neededAverage}</div>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">De promedio en el ${missingWeight}% restante de la materia.</p>
                `;
            }
        }
    }

    function addTopic() {
        const input = document.getElementById('new-topic-input');
        if(!input.value.trim()) return;

        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.checklist.push({ id: 'chk_' + Date.now(), text: input.value.trim(), status: 'pending' });
        input.value = '';
        saveData();
    }

    function toggleTopicStatus(chkId) {
        const subject = subjects.find(s => s.id === activeSubjectId);
        const topic = subject.checklist.find(c => c.id === chkId);
        topic.status = topic.status === 'done' ? 'pending' : 'done';
        saveData();
    }

    function deleteTopic(chkId) {
        const subject = subjects.find(s => s.id === activeSubjectId);
        subject.checklist = subject.checklist.filter(c => c.id !== chkId);
        saveData();
    }

    function renderChecklist(subject) {
        const container = document.getElementById('checklist-container');
        container.innerHTML = subject.checklist.map(c => `
            <div class="checklist-item ${c.status}">
                <div class="checklist-left" onclick="toggleTopicStatus('${c.id}')" style="cursor: pointer; flex-grow: 1;">
                    <input type="checkbox" ${c.status === 'done' ? 'checked' : ''} onclick="event.stopPropagation(); toggleTopicStatus('${c.id}')">
                    <span>${c.text}</span>
                </div>
                <button class="btn btn-danger" style="background: none; border: none; padding: 0.2rem; min-height: auto;" onclick="deleteTopic('${c.id}')"><i class="ph ph-trash"></i></button>
            </div>
        `).join('') || '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 1rem;">No agregaste temas todavía.</p>';
    }

    function handleFileUpload(event) {
        if (!activeSubjectId) return;
        const file = event.target.files[0];
        if (!file) return;

        const transaction = db.transaction(["files"], "readwrite");
        const store = transaction.objectStore("files");
        
        store.add({ id: 'file_' + Date.now(), subjectId: activeSubjectId, name: file.name, type: file.name.split('.').pop().toUpperCase(), fileBlob: file }).onsuccess = () => {
            event.target.value = ''; 
            renderFilesList();
        };
    }

    function renderFilesList() {
        const container = document.getElementById('files-list');
        const req = db.transaction(["files"], "readonly").objectStore("files").getAll();
        
        req.onsuccess = () => {
            const currentFiles = req.result.filter(f => f.subjectId === activeSubjectId);
            container.innerHTML = currentFiles.length === 0 
                ? '<p style="color:var(--text-muted); font-size:0.9rem;">Sin archivos.</p>'
                : currentFiles.map(file => `
                    <div class="file-item">
                        <div style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;" onclick="openFile('${file.id}')">
                            <span style="background: var(--primary-light); color: var(--primary); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">${file.type}</span>
                            <span style="font-size: 0.9rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">${file.name}</span>
                        </div>
                        <button class="btn btn-danger" style="background: none; border: none; padding: 0.2rem; min-height: auto;" onclick="deleteFile('${file.id}')"><i class="ph ph-trash"></i></button>
                    </div>
                `).join('');
        };
    }

    function openFile(fileId) {
        db.transaction(["files"], "readonly").objectStore("files").get(fileId).onsuccess = (e) => {
            const record = e.target.result;
            if(!record) return;
            const url = URL.createObjectURL(record.fileBlob);
            const a = document.createElement('a');
            a.href = url; a.download = record.name;
            document.body.appendChild(a); a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        };
    }

    function deleteFile(fileId) {
        db.transaction(["files"], "readwrite").objectStore("files").delete(fileId).onsuccess = renderFilesList;
    }

    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    // Función para cargar y mostrar el nombre del usuario
function loadUsername() {
    let savedName = localStorage.getItem('db_hub_username');
    
    // Si no hay nombre guardado, le pedimos uno por primera vez
    if (!savedName) {
        savedName = prompt("¡Bienvenido a EstudioHub! ¿Cuál es tu nombre?", "Estudiante");
        if (!savedName || savedName.trim() === "") {
            savedName = "Estudiante";
        }
        localStorage.setItem('db_hub_username', savedName.trim());
    }
    
    // Lo mostramos en pantalla
    document.getElementById('username-display').innerText = savedName;
}

// Función por si el usuario quiere hacer click sobre su nombre y cambiarlo
function changeUsername() {
    const currentName = localStorage.getItem('db_hub_username') || "Estudiante";
    const newName = prompt("Modificá tu nombre de usuario:", currentName);
    
    if (newName && newName.trim() !== "") {
        localStorage.setItem('db_hub_username', newName.trim());
        document.getElementById('username-display').innerText = newName.trim();
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('db_hub_theme', isDark ? 'dark' : 'light');
    updateThemeButton(isDark);
}

function updateThemeButton(isDark) {
    const btn = document.getElementById('theme-toggle-btn');
    if (isDark) {
        btn.innerHTML = `<i class="ph ph-sun"></i> Modo Claro`;
    } else {
        btn.innerHTML = `<i class="ph ph-moon"></i> Modo Oscuro`;
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('db_hub_theme');
    const isDark = savedTheme === 'dark';
    if (isDark) {
        document.body.classList.add('dark-theme');
    }
    updateThemeButton(isDark);
}

// Renderiza las 5 columnas y mete los bloques correspondientes de forma apilada
function renderSchedule() {
    const container = document.getElementById('schedule-columns-container');
    if (!container) return;
    container.innerHTML = '';

    daysList.forEach(day => {
        const col = document.createElement('div');
        col.className = 'day-column';
        
        const dayBlocks = scheduleBlocks.filter(b => b.day === day);
        let blocksHTML = '';
        
        if(dayBlocks.length === 0) {
            blocksHTML = `<p class="empty-day-text">Sin cursadas</p>`;
        } else {
            blocksHTML = dayBlocks.map(b => {
                const sub = subjects.find(s => s.id === b.subjectId);
                const name = sub ? sub.name : 'Materia eliminada';
                const color = sub ? sub.color : '#64748b';
                return `
                    <div class="time-block" style="background-color: ${color}">
                        <div class="block-hours"><i class="ph ph-clock"></i> ${b.hours}</div>
                        <div class="block-name">${name}</div>
                        <button class="block-del" onclick="deleteScheduleBlock('${b.id}')">&times;</button>
                    </div>
                `;
            }).join('');
        }

        col.innerHTML = `<h3>${day}</h3><div class="schedule-blocks-list">${blocksHTML}</div>`;
        container.appendChild(col);
    });
}

function addScheduleBlock() {
    const day = document.getElementById('schedule-day-select').value;
    const subjectId = document.getElementById('schedule-subject-select').value;
    
    // Capturamos los valores de los nuevos selectores
    const horaInicio = document.getElementById('hora-inicio').value;
    const horaFin = document.getElementById('hora-fin').value;

    if(!subjectId) return alert("Por favor crea y selecciona una materia válida.");
    if(horaInicio >= horaFin) return alert("La hora de fin debe ser mayor a la de inicio.");

    // Guardamos el rango formado
    const hours = `${horaInicio} a ${horaFin}`;

    scheduleBlocks.push({ id: 'b_' + Date.now(), day, subjectId, hours });
    closeModal('modal-add-schedule');
    
    localStorage.setItem('db_hub_schedule_blocks', JSON.stringify(scheduleBlocks));
    renderSchedule();
}

// Borra un bloque específico usando su ID único
function deleteScheduleBlock(id) {
    scheduleBlocks = scheduleBlocks.filter(b => b.id !== id);
    localStorage.setItem('db_hub_schedule_blocks', JSON.stringify(scheduleBlocks));
    renderSchedule();
}

// Función para generar los intervalos de 15 min
function llenarSelectoresHorarios() {
    const selects = ['hora-inicio', 'hora-fin'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 15) {
                let time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                select.add(new Option(time, time));
            }
        }
    });
}